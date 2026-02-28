const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const createAdminAccountsHarness = () => {
  const dbModulePath = require.resolve('../../dist/config/database');
  const routerModulePath = require.resolve('../../dist/routes/adminAccounts');

  const queryQueue = [];
  const queryCalls = [];
  const poolMock = {
    async query(...args) {
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
  const router = require('../../dist/routes/adminAccounts').default;

  const runRoute = async ({
    method,
    routePath,
    params = {},
    body = {},
    headers = {},
  }) => {
    const routeLayer = router.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === routePath &&
        layer.route.methods[method.toLowerCase()]
    );
    if (!routeLayer) throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);

    const reqHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      reqHeaders[k.toLowerCase()] = v;
    }

    const req = {
      method: method.toUpperCase(),
      path: routePath,
      params,
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

      if (!nextCalled) break;
    }

    return { status: res.statusCode, body: res.body };
  };

  return { queryQueue, queryCalls, runRoute };
};

const adminToken = () =>
  jwt.sign({ id: 1, login_id: 'admin@example.com', role: 'admin' }, process.env.JWT_SECRET);
const customerToken = () =>
  jwt.sign({ id: 11, login_id: 'customer@example.com', role: 'customer' }, process.env.JWT_SECRET);

test('admin account routes require authentication and admin role', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createAdminAccountsHarness();

  let res = await h.runRoute({
    method: 'get',
    routePath: '/',
  });
  assert.equal(res.status, 401);

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);
});

test('GET / returns admin list and handles error', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createAdminAccountsHarness();

  h.queryQueue.push({ rows: [{ id: 1, login_id: 'admin' }] });
  let res = await h.runRoute({
    method: 'get',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body[0].login_id, 'admin');

  h.queryQueue.push(new Error('list-fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});

test('POST / covers validation, duplicate, success, and server error', async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createAdminAccountsHarness();

  let res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { login_id: '', password: '12' },
  });
  assert.equal(res.status, 400);
  assert.ok(Array.isArray(res.body.errors));

  t.mock.method(bcrypt, 'hash', async () => 'hashed');
  h.queryQueue.push(Object.assign(new Error('duplicate'), { code: '23505' }));
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { login_id: 'manager', password: '1234' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Login ID already exists');

  h.queryQueue.push({ rows: [{ id: 2, login_id: 'manager' }] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { login_id: ' manager ', password: 'abcd' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.login_id, 'manager');

  h.queryQueue.push(new Error('create-fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { login_id: 'manager2', password: 'abcd' },
  });
  assert.equal(res.status, 500);
});

test('PUT /:id/password covers validation, not found, success, and error', async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createAdminAccountsHarness();

  let res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { password: '' },
  });
  assert.equal(res.status, 400);

  t.mock.method(bcrypt, 'hash', async () => 'hashed-pass');
  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { password: '1234' },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 2 }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { password: 'new-password' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Password reset successfully');

  h.queryQueue.push(new Error('reset-fail'));
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { password: 'new-password' },
  });
  assert.equal(res.status, 500);
});

test('DELETE /:id covers invalid id, self-delete, remaining-admin guard, success, fk-violation, not found, and error', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createAdminAccountsHarness();

  let res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: 'bad' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Cannot delete your own admin account');

  h.queryQueue.push({ rows: [{ admin_count: 1 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'At least one admin account must remain');

  h.queryQueue.push(
    { rows: [{ admin_count: 3 }] },
    { rows: [] }
  );
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '99' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push(
    { rows: [{ admin_count: 3 }] },
    { rows: [{ id: 2 }] }
  );
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Admin account deleted successfully');

  h.queryQueue.push(Object.assign(new Error('fk-fail'), { code: '23503' }));
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Admin account is referenced by existing attendance records');

  h.queryQueue.push(new Error('delete-fail'));
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});
