import test from 'node:test';
import assert from 'node:assert/strict';
import { body } from 'express-validator';
import { validateRequest } from './validateRequest';

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

test('validateRequest returns 400 when validation errors exist', async () => {
  const req = { body: { email: 'invalid-email' } } as any;
  await body('email').isEmail().run(req);

  const { res, payload } = createResponse();
  let called = false;
  const next = () => {
    called = true;
  };

  validateRequest(req, res as any, next as any);

  assert.equal(called, false);
  assert.equal(payload.status, 400);
  assert.ok(Array.isArray((payload.body as { errors: unknown[] }).errors));
});

test('validateRequest calls next when request is valid', async () => {
  const req = { body: { email: 'valid@example.com' } } as any;
  await body('email').isEmail().run(req);

  const { res, payload } = createResponse();
  let called = false;
  const next = () => {
    called = true;
  };

  validateRequest(req, res as any, next as any);

  assert.equal(called, true);
  assert.equal(payload.status, undefined);
});
