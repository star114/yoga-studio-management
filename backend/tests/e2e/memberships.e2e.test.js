const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const createMembershipsHarness = () => {
  const dbModulePath = require.resolve('../../dist/config/database');
  const routerModulePath = require.resolve('../../dist/routes/memberships');

  const queryQueue = [];
  const queryCalls = [];
  const poolMock = {
    async query(...args) {
      queryCalls.push(args);
      const queryText = typeof args[0] === 'string' ? args[0] : '';
      const queryParams = Array.isArray(args[1]) ? args[1] : [];
      if (queryText.includes('/* auth-admin-check */')) {
        const userId = Number(queryParams[0]);
        return userId > 0 ? { rows: [{ id: userId }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
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
  const router = require('../../dist/routes/memberships').default;

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
    if (!routeLayer) {
      throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
    }

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
  jwt.sign({ id: 10, login_id: 'c@example.com', role: 'customer' }, process.env.JWT_SECRET);

test('types routes cover success/not-found/validation/error', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createMembershipsHarness();

  h.queryQueue.push({ rows: [{ id: 1, name: '10회' }] });
  let res = await h.runRoute({
    method: 'get',
    routePath: '/types',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body[0].name, '10회');

  h.queryQueue.push(new Error('types fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/types',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'post',
    routePath: '/types',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: '' },
  });
  assert.equal(res.status, 400);
  assert.ok(Array.isArray(res.body.errors));

  h.queryQueue.push({ rows: [{ id: 2, name: '월회원권' }] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/types',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: '월회원권', total_sessions: 30 },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 2);

  h.queryQueue.push(new Error('create type fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/types',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'X' },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'put',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { total_sessions: -9 },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'updated' },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 3, name: 'updated' }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'updated', is_active: false },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'updated');

  h.queryQueue.push(new Error('update type fail'));
  res = await h.runRoute({
    method: 'put',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'x2' },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 3 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('delete type fail'));
  res = await h.runRoute({
    method: 'delete',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});

test('memberships routes cover list/create/update/delete branches', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createMembershipsHarness();

  h.queryQueue.push({ rows: [{ id: 10 }] });
  let res = await h.runRoute({
    method: 'get',
    routePath: '/customer/:customerId',
    params: { customerId: '9' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);

  h.queryQueue.push(new Error('customer memberships fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/customer/:customerId',
    params: { customerId: '9' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 'x', membership_type_id: 1 },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, membership_type_id: 99 },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push(
    { rows: [{ id: 1, total_sessions: 10 }] },
    { rows: [{ id: 101, customer_id: 1 }] }
  );
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, membership_type_id: 1 },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 101);

  h.queryQueue.push(
    { rows: [{ id: 2, total_sessions: null }] },
    { rows: [{ id: 102, customer_id: 2 }] }
  );
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      customer_id: 2,
      membership_type_id: 2,
      notes: 'memo',
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 102);

  h.queryQueue.push(
    { rows: [{ id: 3, total_sessions: null }] },
    { rows: [{ id: 103, customer_id: 3 }] }
  );
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      customer_id: 3,
      membership_type_id: 3,
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 103);

  h.queryQueue.push(new Error('create membership fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, membership_type_id: 1 },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: 'x' },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 201, notes: 'x2' }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: 'x2' },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(
    { rows: [{ id: 202, remaining_sessions: 5, is_active: true }] },
    { rows: [{ id: 202, remaining_sessions: 5, is_active: false }] }
  );
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '202' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { remaining_sessions: 5, is_active: false },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.is_active, false);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '202' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { is_active: 'false' },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push(new Error('update membership fail'));
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: 'x3' },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 201 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('delete membership fail'));
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});
