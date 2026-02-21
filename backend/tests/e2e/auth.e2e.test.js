const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const createAuthHarness = () => {
  const dbModulePath = require.resolve('../../dist/config/database');
  const routerModulePath = require.resolve('../../dist/routes/auth');

  const queryQueue = [];
  const queryCalls = [];
  const poolMock = {
    query: async (...args) => {
      queryCalls.push(args);
      const next = queryQueue.shift();
      if (next instanceof Error) throw next;
      return next ?? { rows: [], rowCount: 0 };
    },
  };

  delete require.cache[dbModulePath];
  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: { __esModule: true, default: poolMock },
  };

  delete require.cache[routerModulePath];
  const router = require('../../dist/routes/auth').default;

  const runRoute = async ({ method, path, body = {}, headers = {} }) => {
    const routeLayer = router.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === path &&
        layer.route.methods[method.toLowerCase()]
    );

    if (!routeLayer) {
      throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
    }

    const reqHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      reqHeaders[k.toLowerCase()] = v;
    }

    const req = {
      method: method.toUpperCase(),
      path,
      body,
      headers: reqHeaders,
      get(name) {
        return this.headers[String(name).toLowerCase()];
      },
      header(name) {
        return this.get(name);
      },
    };

    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
      send(payload) {
        this.body = payload;
        return this;
      },
    };

    const handlers = routeLayer.route.stack.map((item) => item.handle);
    for (const fn of handlers) {
      let nextCalled = false;
      await new Promise((resolve, reject) => {
        const next = (err) => {
          if (err) return reject(err);
          nextCalled = true;
          resolve();
        };

        try {
          const ret = fn(req, res, next);
          Promise.resolve(ret)
            .then(() => {
              if (!nextCalled) resolve();
            })
            .catch(reject);
        } catch (error) {
          reject(error);
        }
      });

      if (!nextCalled) {
        break;
      }
    }

    return { status: res.statusCode, body: res.body };
  };

  return { queryQueue, queryCalls, runRoute };
};

test('POST /login returns 400 on validation error', async () => {
  const envBackup = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const h = createAuthHarness();

  const res = await h.runRoute({
    method: 'post',
    path: '/login',
    body: { identifier: '', password: '' },
  });

  assert.equal(res.status, 400);
  assert.ok(Array.isArray(res.body.errors));
  process.env.JWT_SECRET = envBackup;
});

test('POST /login handles invalid credentials and success flow', async (t) => {
  const envBackup = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const h = createAuthHarness();

  h.queryQueue.push({ rows: [] });
  let res = await h.runRoute({
    method: 'post',
    path: '/login',
    body: { identifier: 'none@example.com', password: 'pw' },
  });
  assert.equal(res.status, 401);

  h.queryQueue.push(
    { rows: [] },
    { rows: [{ id: 1, password_hash: 'h1' }, { id: 2, password_hash: 'h2' }] }
  );
  res = await h.runRoute({
    method: 'post',
    path: '/login',
    body: { identifier: '010-1111-2222', password: 'pw' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Ambiguous phone identifier');

  h.queryQueue.push({
    rows: [{ id: 1, email: 'u@example.com', role: 'admin', password_hash: 'hash' }],
  });
  t.mock.method(bcrypt, 'compare', async () => false);
  res = await h.runRoute({
    method: 'post',
    path: '/login',
    body: { identifier: 'u@example.com', password: 'wrong' },
  });
  assert.equal(res.status, 401);

  h.queryQueue.push(
    { rows: [{ id: 10, email: 'c@example.com', role: 'customer', password_hash: 'hash2' }] },
    { rows: [{ id: 99, user_id: 10, name: '고객' }] }
  );
  t.mock.method(bcrypt, 'compare', async () => true);
  res = await h.runRoute({
    method: 'post',
    path: '/login',
    body: { identifier: 'c@example.com', password: 'ok-password' },
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.role, 'customer');
  assert.equal(res.body.customerInfo.name, '고객');

  h.queryQueue.push(
    { rows: [{ id: 11, email: 'c2@example.com', role: 'customer', password_hash: 'hash3' }] },
    { rows: [] }
  );
  t.mock.method(bcrypt, 'compare', async () => true);
  res = await h.runRoute({
    method: 'post',
    path: '/login',
    body: { identifier: 'c2@example.com', password: 'ok-password' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.customerInfo, null);

  h.queryQueue.push(new Error('login fail'));
  res = await h.runRoute({
    method: 'post',
    path: '/login',
    body: { identifier: 'e@example.com', password: 'pw' },
  });
  assert.equal(res.status, 500);

  process.env.JWT_SECRET = envBackup;
});

test('GET /me and PUT /password cover main branches', async (t) => {
  const envBackup = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const token = jwt.sign(
    { id: 7, email: 'c@example.com', role: 'customer' },
    process.env.JWT_SECRET
  );
  const h = createAuthHarness();

  h.queryQueue.push({ rows: [] });
  let res = await h.runRoute({
    method: 'get',
    path: '/me',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push(
    { rows: [{ id: 7, email: 'c@example.com', role: 'customer' }] },
    { rows: [{ id: 70, user_id: 7, name: '고객7' }] }
  );
  res = await h.runRoute({
    method: 'get',
    path: '/me',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, 7);
  assert.equal(res.body.customerInfo.name, '고객7');

  h.queryQueue.push(
    { rows: [{ id: 7, email: 'c@example.com', role: 'customer' }] },
    { rows: [] }
  );
  res = await h.runRoute({
    method: 'get',
    path: '/me',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.customerInfo, null);

  res = await h.runRoute({
    method: 'put',
    path: '/password',
    headers: { authorization: `Bearer ${token}` },
    body: { currentPassword: '', newPassword: '123' },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    path: '/password',
    headers: { authorization: `Bearer ${token}` },
    body: { currentPassword: 'old-pass', newPassword: 'new-pass' },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 7, password_hash: 'hash' }] });
  t.mock.method(bcrypt, 'compare', async () => false);
  res = await h.runRoute({
    method: 'put',
    path: '/password',
    headers: { authorization: `Bearer ${token}` },
    body: { currentPassword: 'bad-pass', newPassword: 'new-pass' },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push(
    { rows: [{ id: 7, password_hash: 'hash' }] },
    { rowCount: 1, rows: [] }
  );
  t.mock.method(bcrypt, 'compare', async () => true);
  t.mock.method(bcrypt, 'hash', async () => 'new-hash');
  res = await h.runRoute({
    method: 'put',
    path: '/password',
    headers: { authorization: `Bearer ${token}` },
    body: { currentPassword: 'ok-pass', newPassword: 'new-pass' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Password changed successfully');

  h.queryQueue.push(new Error('me fail'));
  res = await h.runRoute({
    method: 'get',
    path: '/me',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push(new Error('password fail'));
  res = await h.runRoute({
    method: 'put',
    path: '/password',
    headers: { authorization: `Bearer ${token}` },
    body: { currentPassword: 'ok-pass', newPassword: 'new-pass' },
  });
  assert.equal(res.status, 500);

  process.env.JWT_SECRET = envBackup;
});
