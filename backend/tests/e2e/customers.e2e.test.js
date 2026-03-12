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
    query = {},
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
      query,
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
  jwt.sign({ id: 1, login_id: 'admin@example.com', role: 'admin' }, process.env.JWT_SECRET);
const customerToken = () =>
  jwt.sign({ id: 10, login_id: 'c@example.com', role: 'customer' }, process.env.JWT_SECRET);

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

  res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: 'abc' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid customerId');

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

  h.queryQueue.push(new Error('access-check-fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: '5' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

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

test('GET /:id/class-activities covers forbidden, success, filters, and error', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createCustomersHarness();

  h.queryQueue.push({ rows: [] });
  let res = await h.runRoute({
    method: 'get',
    routePath: '/:id/class-activities',
    params: { id: '5' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/class-activities',
    params: { id: 'abc' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid customerId');

  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/class-activities',
    params: { id: '5' },
    query: { date_from: '2026-99-99' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'date_from must be a valid YYYY-MM-DD date');

  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/class-activities',
    params: { id: '5' },
    query: { date_to: '2026/03/01' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'date_to must be a valid YYYY-MM-DD date');

  h.queryQueue.push(new Error('access check fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/class-activities',
    params: { id: '5' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push(
    { rows: [{ id: 5 }] },
    { rows: [{ total: 2 }] },
    {
      rows: [
        {
          activity_type: 'reserved',
          activity_id: 11,
          class_id: 7,
          class_title: '아쉬탕가',
          class_type: '아쉬탕가',
          class_date: '2026-03-01',
          class_start_time: '09:00:00',
          class_end_time: '10:00:00',
          attendance_date: null,
          registered_at: '2026-02-28T00:00:00.000Z',
        },
      ],
    }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/class-activities',
    params: { id: '5' },
    query: {
      page: '2',
      page_size: '5',
      activity_type: 'reserved',
      search: '아쉬',
      date_from: '2026-02-01',
      date_to: '2026-03-31',
    },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.pagination.page, 2);
  assert.equal(res.body.filter.activity_type, 'reserved');
  assert.equal(res.body.filter.search, '아쉬');
  assert.equal(res.body.filter.date_to, '2026-03-31');
  const classActivitiesQueryText = h.queryCalls
    .map((call) => String(call[0]))
    .find((text) => text.includes('WITH history AS'));
  assert.ok(classActivitiesQueryText);
  assert.ok(classActivitiesQueryText.includes('COALESCE(cls.class_date::date, a.attendance_date::date)'));

  h.queryQueue.push(
    { rows: [] },
    { rows: [] }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/class-activities',
    params: { id: '5' },
    query: { page: '0', page_size: '0', activity_type: 'weird' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.page, 1);
  assert.equal(res.body.pagination.page_size, 10);
  assert.equal(res.body.pagination.total, 0);
  assert.equal(res.body.filter.activity_type, 'all');
  assert.equal(res.body.filter.date_from, null);
  assert.equal(res.body.filter.date_to, null);

  h.queryQueue.push(
    { rows: [{ id: 5 }] },
    new Error('activities fail')
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/class-activities',
    params: { id: '5' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);
});

test('GET /:id/recommended-classes covers validation, forbidden, success, and error', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createCustomersHarness();

  let res = await h.runRoute({
    method: 'get',
    routePath: '/:id/recommended-classes',
    params: { id: '5' },
    query: {},
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/recommended-classes',
    params: { id: 'abc' },
    query: { membership_name: '아쉬탕가' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid customerId');

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/recommended-classes',
    params: { id: '5' },
    query: { membership_name: '아쉬탕가' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  h.queryQueue.push(new Error('access check fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/recommended-classes',
    params: { id: '5' },
    query: { membership_name: '아쉬탕가' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push(
    { rows: [{ id: 5 }] },
    { rows: [{ id: 9, title: '아쉬탕가', is_registered: true, existing_status: 'attended' }] }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/recommended-classes',
    params: { id: '5' },
    query: { membership_name: '아쉬탕가', limit: '10' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, '아쉬탕가');
  assert.equal(res.body[0].is_registered, true);
  assert.equal(res.body[0].existing_status, 'attended');

  h.queryQueue.push({ rows: [{ id: 10, title: '빈야사' }] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/recommended-classes',
    params: { id: '5' },
    query: { membership_name: '빈야사', limit: '0' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  const recommendedQueryCall = h.queryCalls
    .slice()
    .reverse()
    .find((call) => String(call[0]).includes('FROM yoga_classes c'));
  assert.ok(recommendedQueryCall);
  assert.equal(recommendedQueryCall[1][2], 20);

  h.queryQueue.push(new Error('recommended fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/recommended-classes',
    params: { id: '5' },
    query: { membership_name: '아쉬탕가' },
    headers: { authorization: `Bearer ${adminToken()}` },
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
    body: { name: 'N', phone: '' },
  });
  assert.equal(res.status, 400);
  assert.ok(Array.isArray(res.body.errors));

  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'N', phone: '010-1234-567' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, '전화번호 형식은 000-0000-0000 이어야 합니다.');

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
      phone: '01022223333',
      notes: 'memo',
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'N3');

  const okClient2 = h.createDbClientMock();
  okClient2.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [], rowCount: 0 }, // phone check
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
    body: { name: 'N3-2', phone: '01077778888' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'N3-2');

  const errClient = h.createDbClientMock();
  errClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [], rowCount: 0 }, // phone check
    new Error('unexpected'), // user insert flow fail
    { rows: [], rowCount: 0 } // ROLLBACK
  );
  h.connectQueue.push(errClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'N4', phone: '01066667777' },
  });
  assert.equal(res.status, 500);
});

test('PUT /:id and PUT /:id/password cover success/not-found/error', async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createCustomersHarness();

  const notFoundUpdateClient = h.createDbClientMock();
  notFoundUpdateClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [] }, // customer update
    { rows: [], rowCount: 0 } // ROLLBACK
  );
  h.connectQueue.push(notFoundUpdateClient);
  let res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'X' },
  });
  assert.equal(res.status, 404);

  const syncLoginClient = h.createDbClientMock();
  syncLoginClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [{ id: 11, name: 'X2', phone: '01012345678' }] }, // customer update
    { rows: [], rowCount: 1 }, // login_id sync
    { rows: [], rowCount: 0 } // COMMIT
  );
  h.connectQueue.push(syncLoginClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'X2', phone: '01012345678' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'X2');
  assert.match(String(syncLoginClient.queryCalls[2][0]), /UPDATE yoga_users u/);
  assert.equal(syncLoginClient.queryCalls[2][1][0], '010-1234-5678');

  const updateErrClient = h.createDbClientMock();
  updateErrClient.queryQueue.push(
    { rows: [], rowCount: 0 }, // BEGIN
    new Error('update fail'),
    { rows: [], rowCount: 0 } // ROLLBACK
  );
  h.connectQueue.push(updateErrClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'X3' },
  });
  assert.equal(res.status, 500);

  const duplicateLoginUpdateClient = h.createDbClientMock();
  duplicateLoginUpdateClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    Object.assign(new Error('duplicate update'), { code: '23505' }),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(duplicateLoginUpdateClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'dup', phone: '01012345678' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Login ID already exists');

  const invalidPhoneClient = h.createDbClientMock();
  h.connectQueue.push(invalidPhoneClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { phone: '   ' },
  });
  assert.equal(res.status, 400);
  assert.equal(invalidPhoneClient.queryCalls.length, 0);

  const invalidFormatClient = h.createDbClientMock();
  h.connectQueue.push(invalidFormatClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { phone: '010-1234-567' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, '전화번호 형식은 000-0000-0000 이어야 합니다.');
  assert.equal(invalidFormatClient.queryCalls.length, 0);

  h.connectQueue.length = 0;

  const nullBodyClient = h.createDbClientMock();
  nullBodyClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 11, name: 'Existing', phone: '010-1234-5678', notes: null }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(nullBodyClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: null,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Existing');
  assert.equal(
    nullBodyClient.queryCalls.some(([queryText]) => String(queryText).includes('UPDATE yoga_users u')),
    false
  );

  const clearNotesClient = h.createDbClientMock();
  clearNotesClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 11, name: 'Existing', phone: '010-1234-5678', notes: null }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(clearNotesClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: null },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.notes, null);

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
