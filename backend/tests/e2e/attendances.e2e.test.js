const test = require('node:test');
const assert = require('node:assert/strict');
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

const createAttendancesHarness = () => {
  const dbModulePath = require.resolve('../../dist/config/database');
  const routerModulePath = require.resolve('../../dist/routes/attendances');

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
      if (!client) throw new Error('No mock client queued');
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
  const router = require('../../dist/routes/attendances').default;

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
    if (!routeLayer) throw new Error(`Route not found: ${method} ${routePath}`);

    const reqHeaders = {};
    for (const [k, v] of Object.entries(headers)) reqHeaders[k.toLowerCase()] = v;

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
      if (!nextCalled) break;
    }

    return { status: res.statusCode, body: res.body };
  };

  return { queryQueue, queryCalls, connectQueue, createDbClientMock, runRoute };
};

const adminToken = () =>
  jwt.sign({ id: 1, login_id: 'admin@example.com', role: 'admin' }, process.env.JWT_SECRET);
const customerToken = () =>
  jwt.sign({ id: 10, login_id: 'c@example.com', role: 'customer' }, process.env.JWT_SECRET);

test('attendances list/update/today routes cover success and errors', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createAttendancesHarness();

  let res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { customer_id: '3' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  h.queryQueue.push({ rows: [{ id: 9 }] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { customer_id: '3' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Access denied');

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { customer_id: 'abc' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'customer_id must be a positive integer');

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { start_date: 'not-a-date' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'start_date must be a valid ISO date or datetime');

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { start_date: '2026-02-30T10:00:00Z' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'start_date must be a valid ISO date or datetime');

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { end_date: '2026/01/31' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'end_date must be a valid ISO date or datetime');

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { end_date: '2026-02-29T10:00:00+09:00' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'end_date must be a valid ISO date or datetime');

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { start_date: '2026-02-28T24:00:00' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'start_date must be a valid ISO date or datetime');

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { start_date: '2026-02-28T10:60:00' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'start_date must be a valid ISO date or datetime');

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { start_date: '2026-02-28T10:30:61' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'start_date must be a valid ISO date or datetime');

  h.queryQueue.push(
    { rows: [{ id: 9 }] },
    { rows: [{ id: 1 }] }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { start_date: '2026-01-01', end_date: '2026-01-31', limit: '10' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);

  h.queryQueue.push({ rows: [{ id: 1 }] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { customer_id: '3', start_date: '2026-01-01', end_date: '2026-01-31', limit: '10' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { start_date: '2026-01-02 03:04:05' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 0);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { start_date: '2026-01-02T03:04' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 0);

  h.queryQueue.push(new Error('list fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { limit: 'bad' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  const updateNotFoundClient = h.createDbClientMock();
  updateNotFoundClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateNotFoundClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_type: 'x' },
  });
  assert.equal(res.status, 404);

  const updateClassNotFoundClient = h.createDbClientMock();
  updateClassNotFoundClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 8, customer_id: 3, class_id: 1 }] },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateClassNotFoundClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_id: 77 },
  });
  assert.equal(res.status, 400);

  const updateCommentOnlyClient = h.createDbClientMock();
  updateCommentOnlyClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 8, customer_id: 3, class_id: 1 }] },
    { rows: [{ id: 8, class_type: 'x2', class_id: 1, customer_id: 3 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateCommentOnlyClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_type: 'x2' },
  });
  assert.equal(res.status, 200);

  const updateMoveClassClient = h.createDbClientMock();
  updateMoveClassClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 8, customer_id: 3, class_id: 1 }] },
    { rows: [{ id: 2, title: '빈야사' }] },
    { rows: [{ id: 900 }] },
    { rows: [] },
    { rows: [{ id: 8, class_id: 2, class_type: '빈야사', customer_id: 3 }] },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateMoveClassClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_id: 2, class_type: '직접입력2' },
  });
  assert.equal(res.status, 200);
  assert.match(String(updateMoveClassClient.queryCalls[6][0]), /UPDATE yoga_class_registrations r/i);
  assert.match(String(updateMoveClassClient.queryCalls[7][0]), /SET attendance_status = 'attended'/i);

  const updateMissingRegistrationClient = h.createDbClientMock();
  updateMissingRegistrationClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 8, customer_id: 3, class_id: 1 }] },
    { rows: [{ id: 2, title: '빈야사' }] },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateMissingRegistrationClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_id: 2 },
  });
  assert.equal(res.status, 400);

  const updateDuplicateAttendanceClient = h.createDbClientMock();
  updateDuplicateAttendanceClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 8, customer_id: 3, class_id: 1 }] },
    { rows: [{ id: 2, title: '빈야사' }] },
    { rows: [{ id: 900 }] },
    { rows: [{ id: 901 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateDuplicateAttendanceClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_id: 2 },
  });
  assert.equal(res.status, 409);

  const updateErrClient = h.createDbClientMock();
  updateErrClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 8, customer_id: 3, class_id: 1 }] },
    new Error('update fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateErrClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_type: 'x3' },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [{ id: 10 }] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/today',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('today fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/today',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});

test('attendance check/create and delete routes cover transaction branches', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createAttendancesHarness();

  let res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 'bad' },
  });
  assert.equal(res.status, 400);

  const invalidMembershipClient = h.createDbClientMock();
  invalidMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '빈야사' }] },
    { rows: [] },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(invalidMembershipClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, membership_id: 9, class_id: 5, class_type: '직접입력' },
  });
  assert.equal(res.status, 400);

  const explicitMembershipClient = h.createDbClientMock();
  explicitMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '빈야사' }] },
    { rows: [] },
    { rows: [{ id: 9, remaining_sessions: null, end_date: null }] },
    { rows: [{ id: 13, membership_id: 9 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(explicitMembershipClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, membership_id: 9, class_id: 5, class_type: '직접입력' },
  });
  assert.equal(res.status, 201);

  const blankTitleClient = h.createDbClientMock();
  blankTitleClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: null }] },
    { rows: [] },
    { rows: [{ id: 9, remaining_sessions: null, end_date: null }] },
    { rows: [{ id: 14, membership_id: 9, class_type: null }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(blankTitleClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, membership_id: 9, class_id: 5, class_type: '   ' },
  });
  assert.equal(res.status, 201);
  assert.equal(blankTitleClient.queryCalls[4][1][4], null);

  const classMismatchClient = h.createDbClientMock();
  classMismatchClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(classMismatchClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, membership_id: 9, class_id: 999 },
  });
  assert.equal(res.status, 400);

  const duplicateAttendanceClient = h.createDbClientMock();
  duplicateAttendanceClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
    { rows: [{ id: 31 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(duplicateAttendanceClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, class_id: 5 },
  });
  assert.equal(res.status, 409);

  const classMatchClient = h.createDbClientMock();
  classMatchClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
    { rows: [] },
    { rows: [{ id: 9, remaining_sessions: null, end_date: null }] },
    { rows: [{ id: 15, membership_id: 9, class_id: 5, class_type: '아쉬탕가' }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(classMatchClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, membership_id: 9, class_id: 5 },
  });
  assert.equal(res.status, 201);

  const noActiveClient = h.createDbClientMock();
  noActiveClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
    { rows: [] },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(noActiveClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, class_id: 5 },
  });
  assert.equal(res.status, 400);

  const zeroRemainClient = h.createDbClientMock();
  zeroRemainClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
    { rows: [] },
    { rows: [{ id: 1, remaining_sessions: 0, end_date: null }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(zeroRemainClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, class_id: 5 },
  });
  assert.equal(res.status, 400);

  const expiredClient = h.createDbClientMock();
  expiredClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
    { rows: [] },
    { rows: [{ id: 1, remaining_sessions: null, end_date: '2000-01-01' }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(expiredClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, class_id: 5 },
  });
  assert.equal(res.status, 201);

  const successClient = h.createDbClientMock();
  successClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
    { rows: [] },
    { rows: [{ id: 1, remaining_sessions: 5, end_date: null }] },
    { rows: [{ id: 11, membership_id: 1 }] },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(successClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, class_id: 5 },
  });
  assert.equal(res.status, 201);
  assert.match(String(successClient.queryCalls[3][0]), /yoga_membership_types/i);
  assert.equal(successClient.queryCalls[3][1][1], '아쉬탕가');

  const successNoRemainClient = h.createDbClientMock();
  successNoRemainClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
    { rows: [] },
    { rows: [{ id: 2, remaining_sessions: null, end_date: null }] },
    { rows: [{ id: 12, membership_id: 2 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(successNoRemainClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, class_id: 5 },
  });
  assert.equal(res.status, 201);

  const reservedMembershipClient = h.createDbClientMock();
  reservedMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가', membership_id: 77 }] },
    { rows: [] },
    { rows: [{ id: 77, remaining_sessions: 0, is_active: false }] },
    { rows: [{ id: 16, membership_id: 77, class_id: 5, class_type: '아쉬탕가' }] },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(reservedMembershipClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, class_id: 5 },
  });
  assert.equal(res.status, 201);
  assert.equal(
    reservedMembershipClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('remaining_sessions = remaining_sessions - 1')
    ),
    false
  );

  const reservedMembershipMissingClient = h.createDbClientMock();
  reservedMembershipMissingClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가', membership_id: 77 }] },
    { rows: [] },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(reservedMembershipMissingClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, class_id: 5 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body?.error, 'Reserved membership not found');

  const postErrClient = h.createDbClientMock();
  postErrClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
    { rows: [] },
    new Error('check fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(postErrClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, class_id: 5 },
  });
  assert.equal(res.status, 500);

  const blankTitleUpdateClient = h.createDbClientMock();
  blankTitleUpdateClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 9, customer_id: 3, class_id: 1 }] },
    { rows: [{ id: 6, title: null }] },
    { rows: [{ id: 91 }] },
    { rows: [] },
    { rows: [{ id: 9, class_type: null, class_id: 6 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(blankTitleUpdateClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '9' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_id: 6, class_type: '   ' },
  });
  assert.equal(res.status, 200);
  const blankTitleUpdateCall = blankTitleUpdateClient.queryCalls.find((call) =>
    String(call[0]).includes('UPDATE yoga_attendances')
  );
  assert.ok(blankTitleUpdateCall);

  const deleteNotFoundClient = h.createDbClientMock();
  deleteNotFoundClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(deleteNotFoundClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '22' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  const deleteSuccessClient = h.createDbClientMock();
  deleteSuccessClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 22, membership_id: 2, class_id: 5, customer_id: 3, session_deducted: true }] },
    { rows: [{ id: 2, remaining_sessions: 1 }] },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(deleteSuccessClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '22' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(
    deleteSuccessClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('remaining_sessions = remaining_sessions + 1')
    ),
    true
  );
  assert.match(String(deleteSuccessClient.queryCalls[4][0]), /UPDATE yoga_class_registrations/i);

  const deleteReservedMembershipClient = h.createDbClientMock();
  deleteReservedMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 23, membership_id: 4, class_id: 8, customer_id: 9, session_deducted: false }] },
    { rows: [{ id: 4, remaining_sessions: 0 }] },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(deleteReservedMembershipClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '23' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(
    deleteReservedMembershipClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('remaining_sessions = remaining_sessions + 1')
    ),
    false
  );

  const deleteErrClient = h.createDbClientMock();
  deleteErrClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    new Error('delete fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(deleteErrClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '22' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});
