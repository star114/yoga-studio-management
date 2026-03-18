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

const createMembershipsHarness = () => {
  const dbModulePath = require.resolve('../../dist/config/database');
  const routerModulePath = require.resolve('../../dist/routes/memberships');

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
      if (client instanceof Error) {
        throw client;
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
  const router = require('../../dist/routes/memberships').default;

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

test('types routes cover success/not-found/validation/error', async () => {
  process.env.JWT_SECRET = 'test-secret';
  const h = createMembershipsHarness();

  h.queryQueue.push({ rows: [{ id: 1, name: '10회', reservable_class_titles: ['10회'] }] });
  let res = await h.runRoute({
    method: 'get',
    routePath: '/types',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body[0].name, '10회');
  assert.deepEqual(res.body[0].reservable_class_titles, ['10회']);

  h.queryQueue.push({
    rows: [{ id: 2, name: '중지권', is_active: false, reservable_class_titles: ['중지권'] }],
  });
  res = await h.runRoute({
    method: 'get',
    routePath: '/types',
    headers: { authorization: `Bearer ${adminToken()}` },
    query: { include_inactive: 'true' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body[0].is_active, false);
  assert.deepEqual(res.body[0].reservable_class_titles, ['중지권']);

  h.queryQueue.push(new Error('types fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/types',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [{ title: '아침 요가' }, { title: '저녁요가' }] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/types/class-titles',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, ['아침 요가', '저녁요가']);

  h.queryQueue.push(new Error('class titles fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/types/class-titles',
    headers: { authorization: `Bearer ${adminToken()}` },
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

  h.queryQueue.push({
    rows: [{ id: 2, name: '월회원권', reservable_class_titles: ['아침 요가', '저녁요가'] }],
  });
  res = await h.runRoute({
    method: 'post',
    routePath: '/types',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      name: '월회원권',
      total_sessions: 30,
      reservable_class_titles: ['  아침  요가 ', '', '저녁요가', '아침 요가'],
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 2);
  assert.deepEqual(res.body.reservable_class_titles, ['아침 요가', '저녁요가']);
  const createTypeQueryCall = h.queryCalls.find(([sql]) => String(sql).includes('INSERT INTO yoga_membership_types'));
  assert.ok(createTypeQueryCall);
  assert.deepEqual(createTypeQueryCall[1][3], ['아침 요가', '저녁요가']);
  const createTypeNormalizedQueryCall = h.queryCalls
    .slice()
    .reverse()
    .find((call) => String(call[0]).includes('INSERT INTO yoga_membership_types'));
  assert.ok(createTypeNormalizedQueryCall);
  assert.deepEqual(createTypeNormalizedQueryCall[1][3], ['아침 요가', '저녁요가']);

  h.queryQueue.push({
    rows: [{ id: 3, name: '아침 요가', reservable_class_titles: ['아침 요가'] }],
  });
  res = await h.runRoute({
    method: 'post',
    routePath: '/types',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      name: '  아침   요가  ',
      total_sessions: 20,
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 3);
  assert.deepEqual(res.body.reservable_class_titles, ['아침 요가']);
  const fallbackCreateQueryCall = h.queryCalls
    .slice()
    .reverse()
    .find((call) => String(call[0]).includes('INSERT INTO yoga_membership_types'));
  assert.ok(fallbackCreateQueryCall);
  assert.deepEqual(fallbackCreateQueryCall[1][3], ['아침 요가']);

  res = await h.runRoute({
    method: 'post',
    routePath: '/types',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: '빈 배열', total_sessions: 10, reservable_class_titles: [] },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push(new Error('create type fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/types',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'X', total_sessions: 5 },
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

  const typeUpdateNotFoundClient = h.createDbClientMock();
  typeUpdateNotFoundClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(typeUpdateNotFoundClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { name: 'updated' },
  });
  assert.equal(res.status, 404);

  const typeUpdateSuccessClient = h.createDbClientMock();
  typeUpdateSuccessClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 3, name: 'updated', reservable_class_titles: ['빈야사'] }] },
    { rows: [{ id: 3, name: 'updated', reservable_class_titles: ['빈야사'] }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(typeUpdateSuccessClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {
      name: 'updated',
      is_active: false,
      reservable_class_titles: ['빈야사', '아침요가'],
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'updated');
  assert.deepEqual(res.body.reservable_class_titles, ['빈야사']);

  const typeUpdateTitlesClient = h.createDbClientMock();
  typeUpdateTitlesClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{
      id: 3,
      name: 'updated',
      total_sessions: 12,
      reservable_class_titles: ['저녁요가'],
    }] },
    { rows: [{
      id: 3,
      name: 'updated',
      total_sessions: 12,
      reservable_class_titles: ['저녁요가'],
    }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(typeUpdateTitlesClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { total_sessions: 12, reservable_class_titles: ['저녁요가', '저녁요가', ''] },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.total_sessions, 12);
  assert.deepEqual(res.body.reservable_class_titles, ['저녁요가']);

  res = await h.runRoute({
    method: 'put',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { reservable_class_titles: [] },
  });
  assert.equal(res.status, 400);

  const typeUpdateErrorClient = h.createDbClientMock();
  typeUpdateErrorClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 3, name: 'x2', reservable_class_titles: ['아침요가'] }] },
    new Error('update type fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(typeUpdateErrorClient);
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
    method: 'post',
    routePath: '/types/:id/deactivate',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 3 }] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/types/:id/deactivate',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('deactivate type fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/types/:id/deactivate',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
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

  h.queryQueue.push(Object.assign(new Error('in use'), { code: '23503' }));
  res = await h.runRoute({
    method: 'delete',
    routePath: '/types/:id',
    params: { id: '3' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'Membership type cannot be deleted while memberships still reference it');

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

  let res = await h.runRoute({
    method: 'get',
    routePath: '/customer/:customerId',
    params: { customerId: '9' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  res = await h.runRoute({
    method: 'get',
    routePath: '/customer/:customerId',
    params: { customerId: 'abc' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid customerId');

  h.queryQueue.push({
    rows: [{ id: 9 }],
  });
  h.queryQueue.push({
    rows: [{
      id: 10,
      total_sessions: 10,
      reservable_class_titles: ['아침요가'],
      consumed_sessions: 5,
      remaining_sessions: 3,
      reserved_count: 2,
      available_sessions: 1,
    }],
  });
  res = await h.runRoute({
    method: 'get',
    routePath: '/customer/:customerId',
    params: { customerId: '9' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].total_sessions, 10);
  assert.deepEqual(res.body[0].reservable_class_titles, ['아침요가']);
  assert.equal(res.body[0].consumed_sessions, 5);
  assert.equal(res.body[0].reserved_count, 2);
  assert.equal(res.body[0].available_sessions, 1);
  const membershipQueryText = h.queryCalls
    .map((call) => String(call[0]))
    .find((text) => text.includes('SELECT') && text.includes('projection.expected_end_date'));
  assert.ok(membershipQueryText);
  assert.ok(membershipQueryText.includes('reserved_count'));
  assert.ok(membershipQueryText.includes('WHERE r.membership_id = m.id'));

  h.queryQueue.push(new Error('access check fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/customer/:customerId',
    params: { customerId: '9' },
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push(
    { rows: [{ id: 9 }] },
    new Error('customer memberships fail')
  );
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
    { rows: [{ id: 2, total_sessions: 0 }] }
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
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Membership type must have a positive total_sessions value');

  h.queryQueue.push(
    { rows: [{ id: 3, total_sessions: 4 }] },
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
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: 'x' },
  });
  assert.equal(res.status, 404);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: null,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Request body must be an object');

  const updateNotesClient = h.createDbClientMock();
  updateNotesClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 201, remaining_sessions: 5, is_active: true, notes: 'old' }] },
    { rows: [{ id: 201, remaining_sessions: 5, is_active: true, notes: 'x2' }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateNotesClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: 'x2' },
  });
  assert.equal(res.status, 200);
  assert.match(String(updateNotesClient.queryCalls[2][0]), /WHERE id = \$5::integer/);

  const updateNullNotesClient = h.createDbClientMock();
  updateNullNotesClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 201, remaining_sessions: 5, is_active: true, notes: 'x2' }] },
    { rows: [{ id: 201, remaining_sessions: 5, is_active: true, notes: null }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateNullNotesClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: null },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.notes, null);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '202' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { remaining_sessions: 5, is_active: false },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'is_active is managed automatically from remaining_sessions');

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '203' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { is_active: false },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'is_active is managed automatically from remaining_sessions');

  const updateMissingMembershipClient = h.createDbClientMock();
  updateMissingMembershipClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateMissingMembershipClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '999' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: 'x' },
  });
  assert.equal(res.status, 404);

  const updateEmptyBodyClient = h.createDbClientMock();
  updateEmptyBodyClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 205, remaining_sessions: 3, is_active: true, notes: 'memo' }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateEmptyBodyClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '205' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {},
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 205);

  const updateEmptyBodyMissingClient = h.createDbClientMock();
  updateEmptyBodyMissingClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateEmptyBodyMissingClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '206' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: {},
  });
  assert.equal(res.status, 404);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '202' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { is_active: 'false' },
  });
  assert.equal(res.status, 400);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '202' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { remaining_sessions: -1 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'remaining_sessions must be a non-negative integer');

  const updateBelowReservedClient = h.createDbClientMock();
  updateBelowReservedClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 207, remaining_sessions: 5, is_active: true, notes: null }] },
    { rows: [{ reserved_count: 2 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateBelowReservedClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '207' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { remaining_sessions: 1 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'remaining_sessions cannot be less than reserved registrations (2)');
  assert.equal(
    updateBelowReservedClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('UPDATE yoga_memberships')
    ),
    false
  );

  const updateAtReservedFloorClient = h.createDbClientMock();
  updateAtReservedFloorClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 208, remaining_sessions: 5, is_active: true, notes: null }] },
    { rows: [{ reserved_count: 2 }] },
    { rows: [{ id: 208, remaining_sessions: 2, is_active: true, notes: null }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateAtReservedFloorClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '208' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { remaining_sessions: 2 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.remaining_sessions, 2);

  const updateWithMissingReservedCountRowClient = h.createDbClientMock();
  updateWithMissingReservedCountRowClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 209, remaining_sessions: 5, is_active: true, notes: null }] },
    { rows: [] },
    { rows: [{ id: 209, remaining_sessions: 1, is_active: true, notes: null }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateWithMissingReservedCountRowClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '209' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { remaining_sessions: 1 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.remaining_sessions, 1);

  const updateErrorClient = h.createDbClientMock();
  updateErrorClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    { rows: [{ id: 201, remaining_sessions: 5, is_active: true, notes: null }] },
    new Error('update membership fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(updateErrorClient);
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { notes: 'x3' },
  });
  assert.equal(res.status, 500);
  assert.equal(
    updateErrorClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('ROLLBACK')
    ),
    true
  );

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
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  const deleteSuccessClient = h.createDbClientMock();
  deleteSuccessClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [{
        id: 201,
        has_reserved_registrations: false,
        has_consumed_registrations: false,
        has_attendance_history: false,
      }],
    },
    { rows: [], rowCount: 2 },
    { rows: [], rowCount: 3 },
    { rows: [], rowCount: 1 },
    { rows: [{ id: 201 }] },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(deleteSuccessClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(
    deleteSuccessClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('yoga_memberships')
      && String(queryText).includes('has_reserved_registrations')
      && String(queryText).includes('has_consumed_registrations')
      && String(queryText).includes('FOR UPDATE')
    ),
    true
  );
  assert.equal(
    deleteSuccessClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('UPDATE yoga_attendances')
    ),
    true
  );
  assert.equal(
    deleteSuccessClient.queryCalls.some(([queryText]) =>
      String(queryText).includes("DELETE FROM yoga_class_registrations")
    ),
    true
  );
  assert.equal(
    deleteSuccessClient.queryCalls.some(([queryText]) =>
      String(queryText).includes("attendance_status IN ('attended', 'absent')")
    ),
    true
  );

  const deleteErrorClient = h.createDbClientMock();
  deleteErrorClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [{
        id: 201,
        has_reserved_registrations: false,
        has_consumed_registrations: false,
        has_attendance_history: false,
      }],
    },
    new Error('delete membership fail'),
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(deleteErrorClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  h.connectQueue.push(new Error('pool connect fail'));
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/deactivate',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 201, is_active: false }] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/deactivate',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.is_active, false);

  h.queryQueue.push(new Error('deactivate membership fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/:id/deactivate',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  const deleteConsumedClient = h.createDbClientMock();
  deleteConsumedClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [{
        id: 201,
        has_reserved_registrations: false,
        has_consumed_registrations: true,
        has_attendance_history: true,
      }],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(deleteConsumedClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'Membership with registration history can only be deactivated');

  const deleteReservedClient = h.createDbClientMock();
  deleteReservedClient.queryQueue.push(
    { rows: [], rowCount: 0 },
    {
      rows: [{
        id: 201,
        has_reserved_registrations: true,
        has_consumed_registrations: false,
        has_attendance_history: false,
      }],
    },
    { rows: [], rowCount: 0 }
  );
  h.connectQueue.push(deleteReservedClient);
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '201' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'Membership with registration history can only be deactivated');
  assert.equal(
    deleteReservedClient.queryCalls.some(([queryText]) =>
      String(queryText).includes('DELETE FROM yoga_class_registrations')
    ),
    false
  );
});
