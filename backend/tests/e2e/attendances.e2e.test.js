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

test('attendances list/update/today routes cover success and errors', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createAttendancesHarness();

  h.queryQueue.push({ rows: [{ id: 1 }] });
  let res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { customer_id: '3', start_date: '2026-01-01', end_date: '2026-01-31', limit: '10' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);

  h.queryQueue.push(new Error('list fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    query: { limit: 'bad' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { instructor_comment: 'x' },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_id: 77 },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [{ id: 8, instructor_comment: 'x2' }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { instructor_comment: 'x2' },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(
    { rows: [{ id: 2, title: '빈야사' }] },
    { rows: [{ id: 8, instructor_comment: 'x2', class_id: 2, class_type: '빈야사' }] }
  );
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { class_id: 2 },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('update fail'));
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '8' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { instructor_comment: 'x3' },
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
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(invalidMembershipClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, membership_id: 9, class_id: 5 },
  });
  assert.equal(res.status, 400);

  const explicitMembershipClient = h.createDbClientMock();
  explicitMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '빈야사' }] },
    { rows: [{ id: 9, remaining_sessions: null, end_date: null }] },
    { rows: [{ id: 13, membership_id: 9 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(explicitMembershipClient);
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { customer_id: 3, membership_id: 9, class_id: 5 },
  });
  assert.equal(res.status, 201);

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

  const classMatchClient = h.createDbClientMock();
  classMatchClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
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
    body: { customer_id: 3, class_id: 5, instructor_comment: 'ok' },
  });
  assert.equal(res.status, 201);
  assert.match(String(successClient.queryCalls[2][0]), /yoga_membership_types/i);
  assert.equal(successClient.queryCalls[2][1][1], '아쉬탕가');

  const successNoRemainClient = h.createDbClientMock();
  successNoRemainClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
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

  const postErrClient = h.createDbClientMock();
  postErrClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 5, title: '아쉬탕가' }] },
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
    { rows: [{ id: 22, membership_id: 2 }] },
    { rows: [{ id: 2, remaining_sessions: 1 }] },
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
