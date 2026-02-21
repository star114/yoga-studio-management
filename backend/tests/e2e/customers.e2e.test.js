const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const createDbClientMock = () => {
  const queryQueue = [];
  const queryCalls = [];
  let released = false;
  return {
    queryQueue,
    queryCalls,
    get released() {
      return released;
    },
    async query(...args) {
      queryCalls.push(args);
      const next = queryQueue.shift();
      if (next instanceof Error) throw next;
      return next ?? { rows: [], rowCount: 0 };
    },
    release() {
      released = true;
    },
  };
};

const createCustomersHarness = () => {
  const dbModulePath = require.resolve('../../dist/config/database');
  const routerModulePath = require.resolve('../../dist/routes/customers');

  const queryQueue = [];
  const queryCalls = [];
  const connectQueue = [];
  const poolMock = {
    async query(...args) {
      queryCalls.push(args);
      const next = queryQueue.shift();
      if (next instanceof Error) throw next;
      return next ?? { rows: [], rowCount: 0 };
    },
    async connect() {
      const client = connectQueue.shift();
      if (!client) {
        throw new Error('No mock client queued');
      }
      return client;
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
  const router = require('../../dist/routes/customers').default;

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

      if (!nextCalled) {
        break;
      }
    }

    return { status: res.statusCode, body: res.body };
  };

  return {
    queryQueue,
    queryCalls,
    connectQueue,
    createDbClientMock,
    runRoute,
  };
};

const adminToken = () =>
  jwt.sign({ id: 1, email: 'admin@example.com', role: 'admin' }, process.env.JWT_SECRET);
const customerToken = () =>
  jwt.sign({ id: 10, email: 'c@example.com', role: 'customer' }, process.env.JWT_SECRET);

test('GET / returns customers for admin and handles server error', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createCustomersHarness();

  h.queryQueue.push({ rows: [{ id: 1, name: 'A' }] });
  let res = await h.runRoute({
    method: 'get',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body[0].name, 'A');

  h.queryQueue.push(new Error('db-fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});

test('GET /:id covers forbidden, not found, and success', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createCustomersHarness();

  h.queryQueue.push({ rows: [] });
  let res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: '5' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  h.queryQueue.push(
    { rows: [{ id: 5 }] },
    { rows: [] }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: '5' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push(
    { rows: [{ id: 5 }] },
    { rows: [{ id: 5, name: 'C5', role: 'customer' }] },
    { rows: [{ id: 77, customer_id: 5 }] },
    { rows: [{ id: 99, customer_id: 5 }] }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: '5' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.customer.name, 'C5');
  assert.equal(res.body.memberships.length, 1);
  assert.equal(res.body.recentAttendances.length, 1);

  h.queryQueue.push(
    { rows: [{ id: 5 }] },
    new Error('get-customer-fail')
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: '5' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);
});

test('POST / covers validation/missing id/duplicate/success/error', async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createCustomersHarness();

  let res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: '' },
  });
  assert.equal(res.status, 400);

  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'N', phone: '', email: '' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, '이메일 또는 전화번호 중 하나는 필수입니다.');

  const dupPhoneClient = h.createDbClientMock();
  dupPhoneClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [{ id: 1 }] }, // phone exists
    { rows: [], rowCount: 0 } // ROLLBACK
  );
  h.connectQueue.push(dupPhoneClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'N', phone: '010-1234-5678' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Phone already exists');
  assert.equal(dupPhoneClient.released, true);

  const dupLoginClient = h.createDbClientMock();
  dupLoginClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [], rowCount: 0 }, // phone check
    Object.assign(new Error('duplicate'), { code: '23505' }), // insert user
    { rows: [], rowCount: 0 } // ROLLBACK
  );
  h.connectQueue.push(dupLoginClient);
  t.mock.method(bcrypt, 'hash', async () => 'h');
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'N2', phone: '01099998888' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Login ID already exists');

  const okClient = h.createDbClientMock();
  okClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [], rowCount: 0 }, // phone check
    { rows: [{ id: 33 }] }, // insert user
    { rows: [{ id: 50, user_id: 33, name: 'N3' }] }, // insert customer
    { rows: [], rowCount: 0 } // COMMIT
  );
  h.connectQueue.push(okClient);
  t.mock.method(bcrypt, 'hash', async () => 'hash-12345');
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      name: 'N3',
      email: 'N3@EXAMPLE.COM',
      phone: '01022223333',
      birth_date: '1990-01-01',
      gender: 'F',
      address: 'Seoul',
      notes: 'memo',
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'N3');

  const okClient2 = h.createDbClientMock();
  okClient2.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [{ id: 34 }] }, // insert user
    { rows: [{ id: 51, user_id: 34, name: 'N3-2' }] }, // insert customer
    { rows: [], rowCount: 0 } // COMMIT
  );
  h.connectQueue.push(okClient2);
  t.mock.method(bcrypt, 'hash', async () => 'hash-12345-2');
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'N3-2', email: 'n32@example.com' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'N3-2');

  const errClient = h.createDbClientMock();
  errClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    new Error('unexpected'), // user insert flow fail
    { rows: [], rowCount: 0 } // ROLLBACK
  );
  h.connectQueue.push(errClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'N4', email: 'n4@example.com' },
  });
  assert.equal(res.status, 500);
});

test('PUT /:id and PUT /:id/password cover success/not-found/error', async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createCustomersHarness();

  h.queryQueue.push({ rows: [] });
  let res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'X' },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 11, name: 'X2' }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'X2' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'X2');

  h.queryQueue.push(new Error('update fail'));
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'X3' },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  t.mock.method(bcrypt, 'hash', async () => 'r-hash');
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 7 }] });
  t.mock.method(bcrypt, 'hash', async () => 'r-hash-ok');
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.defaultPassword, '12345');

  t.mock.method(bcrypt, 'hash', async () => {
    throw new Error('hash fail');
  });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});

test('DELETE /:id covers not-found, success, and error', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createCustomersHarness();

  const notFoundClient = h.createDbClientMock();
  notFoundClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [] }, // customer lookup
    { rows: [], rowCount: 0 } // ROLLBACK
  );
  h.connectQueue.push(notFoundClient);
  let res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '20' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  const okClient = h.createDbClientMock();
  okClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [{ user_id: 3 }] }, // customer lookup
    { rows: [], rowCount: 1 }, // delete user
    { rows: [], rowCount: 0 } // COMMIT
  );
  h.connectQueue.push(okClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '20' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Customer deleted successfully');

  const errClient = h.createDbClientMock();
  errClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    new Error('lookup fail'),
    { rows: [], rowCount: 0 } // ROLLBACK
  );
  h.connectQueue.push(errClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '20' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});
