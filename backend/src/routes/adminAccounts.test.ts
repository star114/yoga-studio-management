import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

type QueryResult = { rows?: any[]; rowCount?: number };

const createHarness = async () => {
  const dbModulePath = require.resolve('../config/database');

  const queryQueue: Array<QueryResult | Error> = [];
  const queryCalls: any[][] = [];
  const poolMock = {
    async query(...args: any[]) {
      queryCalls.push(args);
      const next = queryQueue.shift();
      if (next instanceof Error) throw next;
      return next ?? { rows: [], rowCount: 0 };
    },
  };

  delete (require.cache as any)[dbModulePath];
  (require.cache as any)[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: { __esModule: true, default: poolMock },
  };

  const router = (await import('./adminAccounts')).default;

  const runRoute = async ({
    method,
    routePath,
    params = {},
    body = {},
    headers = {},
  }: {
    method: string;
    routePath: string;
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  }) => {
    const routeLayer = router.stack.find(
      (layer: any) => layer.route
        && layer.route.path === routePath
        && layer.route.methods[method.toLowerCase()]
    );
    if (!routeLayer?.route) throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);

    const reqHeaders: Record<string, string> = {};
    Object.entries(headers).forEach(([k, v]) => {
      reqHeaders[k.toLowerCase()] = v;
    });

    const req: any = {
      method: method.toUpperCase(),
      path: routePath,
      params,
      body,
      headers: reqHeaders,
      get(name: string) {
        return this.headers[String(name).toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
    };

    const res: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      send(payload: unknown) {
        this.body = payload;
        return this;
      },
    };

    const handlers = routeLayer.route.stack.map((item: any) => item.handle);
    for (const fn of handlers) {
      let nextCalled = false;
      await new Promise<void>((resolve, reject) => {
        const next = (err?: Error) => {
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

const adminToken = () => jwt.sign(
  { id: 1, login_id: 'admin@example.com', role: 'admin' },
  process.env.JWT_SECRET!
);

const customerToken = () => jwt.sign(
  { id: 10, login_id: 'customer@example.com', role: 'customer' },
  process.env.JWT_SECRET!
);

test('admin account routes cover all branches', async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  const h = await createHarness();

  let res = await h.runRoute({ method: 'get', routePath: '/' });
  assert.equal(res.status, 401);

  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    headers: { authorization: `Bearer ${customerToken()}` },
  });
  assert.equal(res.status, 403);

  h.queryQueue.push({ rows: [{ id: 1, login_id: 'admin' }] });
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body[0].login_id, 'admin');

  h.queryQueue.push(new Error('get-fail'));
  res = await h.runRoute({
    method: 'get',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { login_id: '', password: '1' },
  });
  assert.equal(res.status, 400);
  assert.ok(Array.isArray(res.body.errors));

  t.mock.method(bcrypt, 'hash', async () => 'hashed');
  h.queryQueue.push(Object.assign(new Error('dup'), { code: '23505' }));
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { login_id: 'ops', password: '1234' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Login ID already exists');

  h.queryQueue.push({ rows: [{ id: 2, login_id: 'ops' }] });
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { login_id: ' ops ', password: '1234' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.login_id, 'ops');

  h.queryQueue.push(new Error('create-fail'));
  res = await h.runRoute({
    method: 'post',
    routePath: '/',
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { login_id: 'ops2', password: '1234' },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { password: '' },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push({ rows: [] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { password: 'abcd' },
  });
  assert.equal(res.status, 404);

  h.queryQueue.push({ rows: [{ id: 2 }] });
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { password: 'abcd' },
  });
  assert.equal(res.status, 200);

  h.queryQueue.push(new Error('reset-fail'));
  res = await h.runRoute({
    method: 'put',
    routePath: '/:id/password',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { password: 'abcd' },
  });
  assert.equal(res.status, 500);

  res = await h.runRoute({
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

  h.queryQueue.push({ rows: [{ admin_count: 1 }] });
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 400);

  h.queryQueue.push(
    { rows: [{ admin_count: 3 }] },
    { rows: [] }
  );
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '9' },
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

  h.queryQueue.push(new Error('delete-fail'));
  res = await h.runRoute({
    method: 'delete',
    routePath: '/:id',
    params: { id: '2' },
    headers: { authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(res.status, 500);
});
