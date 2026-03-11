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

const createClassesHarness = (options = {}) => {
  const dbModulePath = require.resolve('../../dist/config/database');
  const routerModulePath = require.resolve('../../dist/routes/classes');
  const classScheduleModulePath = require.resolve('../../dist/utils/classSchedule');

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

  if (options.classScheduleOverride) {
    delete require.cache[classScheduleModulePath];
    require.cache[classScheduleModulePath] = {
      id: classScheduleModulePath,
      filename: classScheduleModulePath,
      loaded: true,
      exports: options.classScheduleOverride,
    };
  }

  delete require.cache[routerModulePath];
  const router = require('../../dist/routes/classes').default;

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

test('classes list/detail/registrations/comment/update/delete cover main branches', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createClassesHarness();

  h.queryQueue.push({ rows: [{ id: 1 }] });
  let res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { date_from: '2026-01-01', date_to: '2026-01-31', is_open: 'true' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);

  h.queryQueue.push(new Error('list fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: 'bad' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 1, title: 'A' }] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('detail fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/registrations',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push(
    { rows: [{ id: 1, title: 'A' }] },
    {
      rows: [
        {
          id: 9,
          customer_id: 3,
        },
      ],
    }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/registrations',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].customer_id, 3);

  h.queryQueue.push(new Error('regs fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/registrations',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/comment',
    params: { id: '1', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { registration_comment: 'memo' },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 8, registration_comment: 'memo2' }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/comment',
    params: { id: '1', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { registration_comment: 'memo2' },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push({ rows: [{ id: 8, registration_comment: null }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/comment',
    params: { id: '1', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {},
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('comment fail'));
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/comment',
    params: { id: '1', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { registration_comment: 'memo3' },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { start_time: 'bad' },
  });
  assert.equal(res.status, 400);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { start_time: true },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'start_time must be a string');

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { end_time: 'bad' },
  });
  assert.equal(res.status, 400);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { end_time: true },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'end_time must be a string');

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { start_time: '10:00', end_time: '09:00' },
  });
  assert.equal(res.status, 400);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { max_capacity: 0 },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { title: 'u1' },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 1, title: 'u2' }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { title: 'u2' },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push({ rows: [{ id: 1, title: 'u2', notes: null }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: null },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.notes, null);

  h.queryQueue.push({ rows: [{ id: 1, title: 'u-array' }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: [],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'u-array');

  h.queryQueue.push(new Error('update fail'));
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { title: 'u3' },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 1 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('delete fail'));
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '1' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});

test('GET /registrations/me covers admin, missing customer, success, and error', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createClassesHarness();

  let res = await h.runRoute({
    method: 'get',
    routePath: '/registrations/me',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/registrations/me',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  h.queryQueue.push(
    { rows: [{ id: 7 }] },
    { rows: [{ registration_id: 1, class_id: 11, title: '아쉬탕가' }] }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/registrations/me',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);

  h.queryQueue.push({ rows: [{ id: 7 }] }, new Error('my registrations fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/registrations/me',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);
});

test('class registration and recurring routes cover core branches', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createClassesHarness();

  let res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {},
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
    body: {},
  });
  assert.equal(res.status, 403);

  const notFoundClient = h.createDbClientMock();
  notFoundClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(notFoundClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 404);

  const closedClient = h.createDbClientMock();
  closedClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          is_open: false,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(closedClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);

  const completedClient = h.createDbClientMock();
  completedClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2000-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(completedClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);

  const completedManualAttendanceClient = h.createDbClientMock();
  completedManualAttendanceClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: null,
          is_open: false,
          is_completed: true,
          max_capacity: 1,
          is_excluded: false,
          class_date: '2000-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ id: 501, remaining_sessions: 5, is_title_match: true }] },
    { rows: [{ id: 77, class_id: 11, customer_id: 1, membership_id: 501, attendance_status: 'attended' }] },
    { rows: [{ id: 501 }], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(completedManualAttendanceClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, mark_attended_after_register: true },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.attendance_status, 'attended');
  assert.equal(
    completedManualAttendanceClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('SELECT COUNT(*)::int AS count FROM yoga_class_registrations')
    ),
    false
  );
  assert.equal(
    completedManualAttendanceClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('INSERT INTO yoga_attendances')
    ),
    true
  );
  const completedAttendanceInsertCall = completedManualAttendanceClient.queryCalls.find(([queryText]) =>
    String(queryText).includes('INSERT INTO yoga_attendances')
  );
  assert.match(String(completedAttendanceInsertCall?.[0]), /session_deducted/i);
  assert.equal(completedAttendanceInsertCall?.[1]?.[3], '2000-01-01');
  assert.equal(completedAttendanceInsertCall?.[1]?.[4], '12:00:00');
  assert.equal(completedAttendanceInsertCall?.[1]?.[6], null);

  const fullClient = h.createDbClientMock();
  fullClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 1,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ id: 501, remaining_sessions: 5, is_title_match: true }] },
    { rows: [{ count: 1 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(fullClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);

  const prematureAttendanceClient = h.createDbClientMock();
  prematureAttendanceClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          is_completed: false,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(prematureAttendanceClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, mark_attended_after_register: true },
  });
  assert.equal(res.status, 400);

  const remainingSessionsClient = h.createDbClientMock();
  remainingSessionsClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ id: 501, remaining_sessions: 2, is_title_match: true }] },
    { rows: [{ count: 0 }] },
    { rows: [{ id: 188, class_id: 11, customer_id: 1, membership_id: 501 }] },
    { rows: [{ id: 501 }], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(remainingSessionsClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 201);
  const reservedCountQuery = remainingSessionsClient.queryCalls.find(
    ([queryText]) => typeof queryText === 'string' && queryText.includes('AS reserved_count')
  );
  assert.equal(reservedCountQuery, undefined);
  assert.equal(
    remainingSessionsClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('FOR UPDATE OF m')
    ),
    true
  );

  const explicitMembershipClient = h.createDbClientMock();
  explicitMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    {
      rows: [
        { id: 501, remaining_sessions: 5, is_title_match: true },
        { id: 777, remaining_sessions: 2, is_title_match: true },
      ],
    },
    { rows: [{ count: 0 }] },
    { rows: [{ id: 288, class_id: 11, customer_id: 1, membership_id: 777 }] },
    { rows: [{ id: 777 }], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(explicitMembershipClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, membership_id: 777 },
  });
  assert.equal(res.status, 201);
  const explicitMembershipInsertCall = explicitMembershipClient.queryCalls.find(
    ([queryText]) => typeof queryText === 'string' && queryText.includes('INSERT INTO yoga_class_registrations')
  );
  assert.equal(explicitMembershipInsertCall?.[1]?.[2], 777);

  const invalidMembershipClient = h.createDbClientMock();
  invalidMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ id: 501, remaining_sessions: 5, is_title_match: true }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(invalidMembershipClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, membership_id: 999 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid or unavailable membership');

  const exhaustedAfterSelectionClient = h.createDbClientMock();
  exhaustedAfterSelectionClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ id: 501, remaining_sessions: 1, is_title_match: true }] },
    { rows: [{ count: 0 }] },
    { rows: [{ id: 188, class_id: 11, customer_id: 1, membership_id: 501 }] },
    { rows: [], rowCount: 0 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(exhaustedAfterSelectionClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'Membership sessions exhausted');

  const crossMembershipConfirmClient = h.createDbClientMock();
  crossMembershipConfirmClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ id: 777, remaining_sessions: 3, is_title_match: false }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(crossMembershipConfirmClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'No valid membership for this class');
  assert.equal(res.body.reason, 'CROSS_MEMBERSHIP_CONFIRM_REQUIRED');
  assert.equal(res.body.checks.has_matching_membership_type, false);
  assert.equal(res.body.checks.has_alternative_membership, true);
  assert.equal(res.body.checks.requires_confirmation, true);

  const crossMembershipAllowedClient = h.createDbClientMock();
  crossMembershipAllowedClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ id: 778, remaining_sessions: 3, is_title_match: false }] },
    { rows: [{ count: 1 }] },
    { rows: [{ id: 199, class_id: 11, customer_id: 1, membership_id: 778 }] },
    { rows: [{ id: 778 }], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(crossMembershipAllowedClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, allow_cross_membership_registration: true },
  });
  assert.equal(res.status, 201);
  const crossMembershipReservedCountQuery = crossMembershipAllowedClient.queryCalls.find(
    ([queryText]) => typeof queryText === 'string' && queryText.includes('AS reserved_count')
  );
  assert.equal(crossMembershipReservedCountQuery, undefined);

  const dupClient = h.createDbClientMock();
  dupClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ id: 501, remaining_sessions: 5, is_title_match: true }] },
    { rows: [{ count: 0 }] },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(dupClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);

  const regErrClient = h.createDbClientMock();
  regErrClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    new Error('register fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(regErrClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 500);

  const successClient = h.createDbClientMock();
  successClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ id: 501, remaining_sessions: 5, is_title_match: true }] },
    { rows: [{ count: 1 }] },
    { rows: [{ id: 99, class_id: 11, customer_id: 1, membership_id: 501 }] },
    { rows: [{ id: 501 }], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(successClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 201);

  const cancelSelfNotFoundClient = h.createDbClientMock();
  cancelSelfNotFoundClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelSelfNotFoundClient);
  h.queryQueue.push({ rows: [{ id: 7 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 404);

  const cancelSelfSuccessClient = h.createDbClientMock();
  cancelSelfSuccessClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 1, membership_id: 501, attendance_status: 'reserved' }] },
    { rows: [] },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelSelfSuccessClient);
  h.queryQueue.push({ rows: [{ id: 7 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(
    cancelSelfSuccessClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('DELETE FROM yoga_attendances')
    ),
    false
  );

  const cancelSelfAttendedClient = h.createDbClientMock();
  cancelSelfAttendedClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 2, membership_id: 501, attendance_status: 'attended' }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelSelfAttendedClient);
  h.queryQueue.push({ rows: [{ id: 7 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(
    cancelSelfAttendedClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('DELETE FROM yoga_class_registrations')
    ),
    false
  );

  const cancelSelfAbsentClient = h.createDbClientMock();
  cancelSelfAbsentClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 3, membership_id: 501, attendance_status: 'absent' }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelSelfAbsentClient);
  h.queryQueue.push({ rows: [{ id: 7 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 400);

  const cancelSelfErrorClient = h.createDbClientMock();
  cancelSelfErrorClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    new Error('cancel self fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelSelfErrorClient);
  h.queryQueue.push({ rows: [{ id: 7 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  const cancelAdminNotFoundClient = h.createDbClientMock();
  cancelAdminNotFoundClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelAdminNotFoundClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/:customerId',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  const cancelAdminSuccessClient = h.createDbClientMock();
  cancelAdminSuccessClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 1, membership_id: 501, attendance_status: 'reserved' }] },
    { rows: [] },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelAdminSuccessClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/:customerId',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);

  const cancelAdminAttendedClient = h.createDbClientMock();
  cancelAdminAttendedClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 2, membership_id: 501, attendance_status: 'attended' }] },
    { rows: [{ id: 91, membership_id: 501 }] },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelAdminAttendedClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/:customerId',
    params: { id: '11', customerId: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(
    cancelAdminAttendedClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('DELETE FROM yoga_attendances')
    ),
    true
  );

  const cancelAdminNullMembershipClient = h.createDbClientMock();
  cancelAdminNullMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 3, membership_id: null, attendance_status: 'attended' }] },
    { rows: [{ id: 92, membership_id: null }] },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelAdminNullMembershipClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/:customerId',
    params: { id: '11', customerId: '4' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(
    cancelAdminNullMembershipClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('remaining_sessions = remaining_sessions + 1')
    ),
    false
  );

  const cancelAdminErrorClient = h.createDbClientMock();
  cancelAdminErrorClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    new Error('cancel admin fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(cancelAdminErrorClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/:customerId',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      title: '클래스',
      class_date: '2026-01-01',
      start_time: '10:00',
      end_time: '09:00',
      max_capacity: 10,
    },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [{ id: 123 }] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      title: '클래스',
      class_date: '2026-01-01',
      start_time: '10:00',
      end_time: '11:00',
      max_capacity: 10,
    },
  });
  assert.equal(res.status, 201);

  h.queryQueue.push(new Error('create class fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      title: '클래스',
      class_date: '2026-01-01',
      start_time: '10:00',
      end_time: '11:00',
      max_capacity: 10,
    },
  });
  assert.equal(res.status, 500);

});

test('registration status change reconciles attendance row and membership usage', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createClassesHarness();
  const client = h.createDbClientMock();
  client.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 90,
          class_id: 11,
          customer_id: 2,
          membership_id: 77,
          attendance_status: 'attended',
          registration_comment: null,
          registered_at: '2026-02-20T00:00:00.000Z',
        },
      ],
    },
    { rows: [{ id: 501, membership_id: 77 }] },
    { rows: [], rowCount: 1 },
    {
      rows: [
        {
          id: 90,
          class_id: 11,
          customer_id: 2,
          attendance_status: 'absent',
          registration_comment: null,
          registered_at: '2026-02-20T00:00:00.000Z',
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(client);

  const res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/status',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { attendance_status: 'absent' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance_status, 'absent');
  assert.equal(
    client.queryCalls.some(
      ([sql]) =>
        typeof sql === 'string'
        && sql.includes('UPDATE yoga_memberships')
    ),
    false
  );
  assert.ok(
    client.queryCalls.some(
      ([sql]) =>
        typeof sql === 'string'
        && sql.includes('DELETE FROM yoga_attendances')
    )
  );

  const sameStatusClient = h.createDbClientMock();
  sameStatusClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 91,
          class_id: 11,
          customer_id: 2,
          attendance_status: 'reserved',
          registration_comment: null,
          registered_at: '2026-02-20T00:00:00.000Z',
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(sameStatusClient);
  const sameStatusRes = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/status',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { attendance_status: 'reserved' },
  });
  assert.equal(sameStatusRes.status, 200);
  assert.equal(sameStatusRes.body.attendance_status, 'reserved');

  const attendedWithoutAttendanceClient = h.createDbClientMock();
  attendedWithoutAttendanceClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 92,
          class_id: 11,
          customer_id: 2,
          attendance_status: 'reserved',
          registration_comment: null,
          registered_at: '2026-02-20T00:00:00.000Z',
        },
      ],
    },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(attendedWithoutAttendanceClient);
  const attendedWithoutAttendanceRes = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/status',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { attendance_status: 'attended' },
  });
  assert.equal(attendedWithoutAttendanceRes.status, 400);

  const revertToReservedClient = h.createDbClientMock();
  revertToReservedClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 94,
          class_id: 11,
          customer_id: 2,
          membership_id: 501,
          attendance_status: 'attended',
          registration_comment: null,
          registered_at: '2026-02-20T00:00:00.000Z',
        },
      ],
    },
    {
      rows: [
        { id: 601, membership_id: 77, session_deducted: true },
        { id: 602, membership_id: 501, session_deducted: false },
      ],
    },
    { rows: [{ id: 77, remaining_sessions: 2 }] },
    { rows: [], rowCount: 1 },
    {
      rows: [
        {
          id: 94,
          class_id: 11,
          customer_id: 2,
          membership_id: 501,
          attendance_status: 'reserved',
          registration_comment: null,
          registered_at: '2026-02-20T00:00:00.000Z',
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(revertToReservedClient);
  const revertToReservedRes = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/status',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { attendance_status: 'reserved' },
  });
  assert.equal(revertToReservedRes.status, 200);
  assert.ok(
    revertToReservedClient.queryCalls.some(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE yoga_memberships')
    )
  );

  const absentWithNullMembershipClient = h.createDbClientMock();
  absentWithNullMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 95,
          class_id: 11,
          customer_id: 2,
          membership_id: 88,
          attendance_status: 'attended',
          registration_comment: null,
          registered_at: '2026-02-20T00:00:00.000Z',
        },
      ],
    },
    {
      rows: [
        { id: 701, membership_id: null, session_deducted: false },
        { id: 702, membership_id: 88, session_deducted: false },
      ],
    },
    { rows: [], rowCount: 1 },
    {
      rows: [
        {
          id: 95,
          class_id: 11,
          customer_id: 2,
          membership_id: 88,
          attendance_status: 'absent',
          registration_comment: null,
          registered_at: '2026-02-20T00:00:00.000Z',
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(absentWithNullMembershipClient);
  const absentWithNullMembershipRes = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/status',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { attendance_status: 'absent' },
  });
  assert.equal(absentWithNullMembershipRes.status, 200);
  assert.equal(
    absentWithNullMembershipClient.queryCalls.some(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE yoga_memberships')
    ),
    false
  );

  const noRegistrationClient = h.createDbClientMock();
  noRegistrationClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(noRegistrationClient);
  const noRegistrationRes = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/status',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { attendance_status: 'absent' },
  });
  assert.equal(noRegistrationRes.status, 404);

  const statusErrorClient = h.createDbClientMock();
  statusErrorClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    new Error('status change fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(statusErrorClient);
  const statusErrorRes = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/:customerId/status',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { attendance_status: 'absent' },
  });
  assert.equal(statusErrorRes.status, 500);
});

test('class registration diagnostics and recurring creation cover remaining branches', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createClassesHarness({
    classScheduleOverride: {
      getRecurringClassDates: (...args) => {
        const [startDate] = args;
        if (startDate === '2026-03-15') {
          throw new Error('Invalid recurrence rule');
        }
        if (startDate === '2026-03-17') {
          throw 'bad recurrence';
        }
        if (startDate === '2026-03-16') {
          return [];
        }
        return ['2026-03-03', '2026-03-05'];
      },
      isValidTime: (value) => /^\d{2}:\d{2}$/.test(value),
      timeToMinutes: (value) => {
        const [hour, minute] = value.split(':').map(Number);
        return hour * 60 + minute;
      },
    },
  });

  const noMembershipDiagnosticClient = h.createDbClientMock();
  noMembershipDiagnosticClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: null,
          is_open: true,
          max_capacity: 10,
          class_date: '2999-01-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
        },
      ],
    },
    { rows: [] },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(noMembershipDiagnosticClient);
  let res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.reason, 'NO_MEMBERSHIP');

  const noActiveDiagnosticClient = h.createDbClientMock();
  noActiveDiagnosticClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          class_date: '2999-01-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
        },
      ],
    },
    { rows: [] },
    {
      rows: [
        {
          total_memberships: 1,
          active_memberships: 0,
          remaining_memberships: 1,
          eligible_memberships: 0,
          title_matched_memberships: 1,
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(noActiveDiagnosticClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.reason, 'NO_ACTIVE_MEMBERSHIP');

  const noRemainingDiagnosticClient = h.createDbClientMock();
  noRemainingDiagnosticClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          class_date: '2999-01-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
        },
      ],
    },
    { rows: [] },
    {
      rows: [
        {
          total_memberships: 1,
          active_memberships: 1,
          remaining_memberships: 0,
          eligible_memberships: 0,
          title_matched_memberships: 1,
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(noRemainingDiagnosticClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.reason, 'NO_REMAINING_SESSIONS');

  const alternativeDiagnosticClient = h.createDbClientMock();
  alternativeDiagnosticClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: null,
          is_open: true,
          max_capacity: 10,
          class_date: '2999-01-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
        },
      ],
    },
    { rows: [] },
    {
      rows: [
        {
          total_memberships: 1,
          active_memberships: 1,
          remaining_memberships: 1,
          eligible_memberships: 1,
          title_matched_memberships: 0,
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(alternativeDiagnosticClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.reason, 'CLASS_TITLE_MISMATCH');
  assert.equal(res.body.checks.has_alternative_membership, true);

  const noEligibleDiagnosticClient = h.createDbClientMock();
  noEligibleDiagnosticClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          class_date: '2999-01-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
        },
      ],
    },
    { rows: [] },
    {
      rows: [
        {
          total_memberships: 2,
          active_memberships: 1,
          remaining_memberships: 1,
          eligible_memberships: 0,
          title_matched_memberships: 1,
        },
      ],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(noEligibleDiagnosticClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.reason, 'NO_ELIGIBLE_MEMBERSHIP');
  assert.deepEqual(res.body.failed_checks, []);

  const crossMembershipRemainingClient = h.createDbClientMock();
  crossMembershipRemainingClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: null,
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
        },
      ],
    },
    { rows: [{ id: 801, remaining_sessions: 1, is_title_match: false }] },
    { rows: [{ count: 0 }] },
    { rows: [{ id: 501, class_id: 11, customer_id: 1, membership_id: 801 }] },
    { rows: [{ id: 801 }], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(crossMembershipRemainingClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, allow_cross_membership_registration: true },
  });
  assert.equal(res.status, 201);

  const unlimitedCrossMembershipClient = h.createDbClientMock();
  unlimitedCrossMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          title: '아쉬탕가',
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          start_time: '09:00:00',
          end_time: '10:00:00',
        },
      ],
    },
    { rows: [{ id: 802, remaining_sessions: null, is_title_match: false }] },
    { rows: [{ count: 1 }] },
    { rows: [{ id: 299, class_id: 11, customer_id: 1 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(unlimitedCrossMembershipClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 1, allow_cross_membership_registration: true },
  });
  assert.equal(res.status, 201);

  res = await h.runRoute({
    method: 'post',
    routePath: '/recurring',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      title: '반복수업',
      recurrence_start_date: '2026-03-01',
      recurrence_end_date: '2026-03-31',
      weekdays: [1],
      start_time: '11:00',
      end_time: '10:00',
      max_capacity: 10,
    },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'End time must be after start time');

  res = await h.runRoute({
    method: 'post',
    routePath: '/recurring',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      title: '반복수업',
      recurrence_start_date: '2026-03-15',
      recurrence_end_date: '2026-03-31',
      weekdays: [1],
      start_time: '09:00',
      end_time: '10:00',
      max_capacity: 10,
    },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid recurrence rule');

  res = await h.runRoute({
    method: 'post',
    routePath: '/recurring',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      title: '반복수업',
      recurrence_start_date: '2026-03-17',
      recurrence_end_date: '2026-03-31',
      weekdays: [1],
      start_time: '09:00',
      end_time: '10:00',
      max_capacity: 10,
    },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid recurrence rule');

  res = await h.runRoute({
    method: 'post',
    routePath: '/recurring',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      title: '반복수업',
      recurrence_start_date: '2026-03-16',
      recurrence_end_date: '2026-03-31',
      weekdays: [1],
      start_time: '09:00',
      end_time: '10:00',
      max_capacity: 10,
    },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'No classes to create for the given recurrence rule');

  const recurringSuccessClient = h.createDbClientMock();
  recurringSuccessClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(recurringSuccessClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/recurring',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      title: '반복수업',
      recurrence_start_date: '2026-03-01',
      recurrence_end_date: '2026-03-31',
      weekdays: [1, 1, 3],
      start_time: '09:00',
      end_time: '10:00',
      max_capacity: 10,
      is_open: false,
      notes: 'memo',
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.created_count, 2);

  const recurringErrorClient = h.createDbClientMock();
  recurringErrorClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    new Error('recurring fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(recurringErrorClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/recurring',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      title: '반복수업',
      recurrence_start_date: '2026-03-01',
      recurrence_end_date: '2026-03-31',
      weekdays: [1],
      start_time: '09:00',
      end_time: '10:00',
      max_capacity: 10,
    },
  });
  assert.equal(res.status, 500);
});

test('customer class detail endpoint covers main branches', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createClassesHarness();

  let res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  h.queryQueue.push({ rows: [{ id: 7 }] }, { rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push(
    { rows: [{ id: 7 }] },
    { rows: [{ id: 11, title: '빈야사' }] }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, '빈야사');

  h.queryQueue.push({ rows: [{ id: 7 }] }, new Error('my detail fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);
});

test('attendance comment-thread routes cover customer/admin success and failures', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createClassesHarness();

  let res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    body: { message: '메시지' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  h.queryQueue.push({ rows: [{ id: 7 }] }, { rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push(
    { rows: [{ id: 7 }] },
    { rows: [{ id: 501 }] },
    { rows: [{ id: 1, message: 'hello' }] }
  );
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.attendance_id, 501);
  assert.equal(res.body.messages.length, 1);

  h.queryQueue.push({ rows: [{ id: 7 }] }, { rows: [{ id: 501 }] }, new Error('thread fetch fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    body: { message: '' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [{ id: 7 }] }, { rows: [{ id: 501 }] }, { rows: [{ id: 55, message: '메시지' }] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    body: { message: ' 메시지 ' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.message, '메시지');

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    body: { message: '메시지' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  h.queryQueue.push({ rows: [{ id: 7 }] }, { rows: [] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    body: { message: '메시지' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 7 }] }, { rows: [{ id: 501 }] }, new Error('customer thread write fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/me/comment-thread',
    params: { id: '11' },
    body: { message: '메시지' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [{ id: 501 }] }, { rows: [{ id: 61, message: 'admin 메시지' }] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations/:customerId/comment-thread',
    params: { id: '11', customerId: '7' },
    body: { message: 'admin 메시지' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 201);

  h.queryQueue.push({ rows: [{ id: 501 }] }, { rows: [{ id: 1, message: 'admin view' }] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/registrations/:customerId/comment-thread',
    params: { id: '11', customerId: '7' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.messages.length, 1);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/registrations/:customerId/comment-thread',
    params: { id: '11', customerId: '7' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 501 }] }, new Error('admin thread fetch fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/:id/registrations/:customerId/comment-thread',
    params: { id: '11', customerId: '7' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations/:customerId/comment-thread',
    params: { id: '11', customerId: '7' },
    body: { message: 'admin 메시지' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 501 }] }, new Error('admin thread write fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/registrations/:customerId/comment-thread',
    params: { id: '11', customerId: '7' },
    body: { message: 'admin 메시지' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});

test('customer registration comment routes cover self-service branches', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createClassesHarness();

  let res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/me/comment',
    params: { id: '11' },
    body: { registration_comment: '메모' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/me/comment',
    params: { id: '11' },
    body: { registration_comment: '메모' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  h.queryQueue.push({ rows: [{ id: 7 }] }, { rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/me/comment',
    params: { id: '11' },
    body: { registration_comment: '메모' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push(
    { rows: [{ id: 7 }] },
    { rows: [{ id: 1, class_id: 11, customer_id: 7, registration_comment: null }] }
  );
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/me/comment',
    params: { id: '11' },
    body: {},
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(h.queryCalls.at(-1)[1][2], null);

  h.queryQueue.push(
    { rows: [{ id: 7 }] },
    { rows: [{ id: 1, class_id: 11, customer_id: 7, registration_comment: null }] }
  );
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/me/comment',
    params: { id: '11' },
    body: { registration_comment: '   ' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(h.queryCalls.at(-1)[1][2], null);

  h.queryQueue.push(
    { rows: [{ id: 7 }] },
    { rows: [{ id: 1, class_id: 11, customer_id: 7, registration_comment: null }] }
  );
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/me/comment',
    params: { id: '11' },
    body: { registration_comment: '  셀프 메모  ' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.registration_comment, null);
  assert.equal(h.queryCalls.at(-1)[1][2], '셀프 메모');

  h.queryQueue.push({ rows: [{ id: 7 }] }, new Error('self comment fail'));
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/registrations/me/comment',
    params: { id: '11' },
    body: { registration_comment: '메모' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);
});
