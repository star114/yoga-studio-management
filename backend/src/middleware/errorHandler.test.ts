import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from './errorHandler';

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

test('errorHandler uses provided status and message', () => {
  const { res, payload } = createResponse();
  const err = { status: 409, message: 'Conflict' };
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  errorHandler(err, {} as any, res as any, (() => {}) as any);

  process.env.NODE_ENV = prevEnv;
  assert.equal(payload.status, 409);
  assert.deepEqual(payload.body, { error: 'Conflict' });
});

test('errorHandler falls back to 500 and default message', () => {
  const { res, payload } = createResponse();
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  errorHandler({}, {} as any, res as any, (() => {}) as any);

  process.env.NODE_ENV = prevEnv;
  assert.equal(payload.status, 500);
  assert.deepEqual(payload.body, { error: 'Internal Server Error' });
});

test('errorHandler includes stack in development mode', () => {
  const { res, payload } = createResponse();
  const err = { status: 400, message: 'Bad', stack: 'trace' };
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  errorHandler(err, {} as any, res as any, (() => {}) as any);

  process.env.NODE_ENV = prevEnv;
  assert.equal(payload.status, 400);
  assert.deepEqual(payload.body, { error: 'Bad', stack: 'trace' });
});
