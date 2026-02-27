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
    body: { end_time: 'bad' },
  });
  assert.equal(res.status, 400);

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

  const fullClient = h.createDbClientMock();
  fullClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          is_open: true,
          max_capacity: 1,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
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

  const dupClient = h.createDbClientMock();
  dupClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [
        {
          id: 11,
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
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
          is_open: true,
          max_capacity: 10,
          is_excluded: false,
          class_date: '2999-01-01',
          end_time: '12:00:00',
        },
      ],
    },
    { rows: [{ count: 1 }] },
    { rows: [{ id: 99, class_id: 11, customer_id: 1 }] },
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

  h.queryQueue.push({ rows: [{ id: 7 }] }, { rows: [] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 7 }] }, { rows: [{ id: 1 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/me',
    params: { id: '11' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('cancel self fail'));
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

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/:customerId',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 1 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id/registrations/:customerId',
    params: { id: '11', customerId: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('cancel admin fail'));
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
          attendance_status: 'attended',
          registration_comment: null,
          registered_at: '2026-02-20T00:00:00.000Z',
        },
      ],
    },
    { rows: [{ id: 501, membership_id: 77 }] },
    { rows: [], rowCount: 1 },
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
  assert.ok(
    client.queryCalls.some(
      ([sql]) =>
        typeof sql === 'string'
        && sql.includes('UPDATE yoga_memberships')
    )
  );
  assert.ok(
    client.queryCalls.some(
      ([sql]) =>
        typeof sql === 'string'
        && sql.includes('DELETE FROM yoga_attendances')
    )
  );
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
