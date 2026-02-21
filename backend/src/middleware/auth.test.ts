import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticate, requireAdmin, type AuthRequest } from './auth';

const createResponse = () => {
  const payload: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      payload.status = code;
      return this;
    },
    json(body: unknown) {
      payload.body = body;
      return this;
    },
  };
  return { res, payload };
};

test('authenticate returns 401 when token is missing', () => {
  const { res, payload } = createResponse();
  const req = { headers: {} } as AuthRequest;
  let called = false;
  const next = () => {
    called = true;
  };

  authenticate(req, res as any, next);

  assert.equal(called, false);
  assert.equal(payload.status, 401);
  assert.deepEqual(payload.body, { error: 'No token provided' });
});

test('authenticate returns 401 when token is invalid', (t) => {
  const verifyMock = t.mock.method(jwt, 'verify', () => {
    throw new Error('invalid');
  });
  const { res, payload } = createResponse();
  const req = { headers: { authorization: 'Bearer bad-token' } } as AuthRequest;
  let called = false;
  const next = () => {
    called = true;
  };

  authenticate(req, res as any, next);

  assert.equal(verifyMock.mock.calls.length, 1);
  assert.equal(called, false);
  assert.equal(payload.status, 401);
  assert.deepEqual(payload.body, { error: 'Invalid token' });
});

test('authenticate sets user and calls next on valid token', (t) => {
  const verifyMock = t.mock.method(jwt, 'verify', () => ({
    id: 7,
    email: 'admin@example.com',
    role: 'admin',
  }));
  const { res, payload } = createResponse();
  const req = { headers: { authorization: 'Bearer good-token' } } as AuthRequest;
  let called = false;
  const next = () => {
    called = true;
  };

  authenticate(req, res as any, next);

  assert.equal(verifyMock.mock.calls.length, 1);
  assert.equal(called, true);
  assert.deepEqual(req.user, {
    id: 7,
    email: 'admin@example.com',
    role: 'admin',
  });
  assert.equal(payload.status, undefined);
});

test('requireAdmin blocks non-admin users', () => {
  const { res, payload } = createResponse();
  const req = { user: { id: 1, email: 'user@example.com', role: 'customer' } } as AuthRequest;
  let called = false;
  const next = () => {
    called = true;
  };

  requireAdmin(req, res as any, next);

  assert.equal(called, false);
  assert.equal(payload.status, 403);
  assert.deepEqual(payload.body, { error: 'Admin access required' });
});

test('requireAdmin allows admin user', () => {
  const { res } = createResponse();
  const req = { user: { id: 9, email: 'root@example.com', role: 'admin' } } as AuthRequest;
  let called = false;
  const next = () => {
    called = true;
  };

  requireAdmin(req, res as any, next);

  assert.equal(called, true);
});
