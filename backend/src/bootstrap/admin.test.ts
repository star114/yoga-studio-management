import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pool from '../config/database';
import { ensureAdminUser } from './admin';

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test('ensureAdminUser skips when admin env is missing', async (t) => {
  delete process.env.ADMIN_ID;
  delete process.env.ADMIN_PASSWORD;

  const warnMock = t.mock.method(console, 'warn', () => undefined);
  const hashMock = t.mock.method(bcrypt, 'hash', async () => 'hashed');
  const queryMock = t.mock.method(pool, 'query', async () => ({ rowCount: 1 }) as any);

  await ensureAdminUser();

  assert.equal(warnMock.mock.calls.length, 1);
  assert.equal(hashMock.mock.calls.length, 0);
  assert.equal(queryMock.mock.calls.length, 0);
});

test('ensureAdminUser hashes password and upserts admin account', async (t) => {
  process.env.ADMIN_ID = 'admin';
  process.env.ADMIN_PASSWORD = 'secret';

  const logMock = t.mock.method(console, 'log', () => undefined);
  const hashMock = t.mock.method(bcrypt, 'hash', async () => 'hashed-secret');
  const queryMock = t.mock.method(pool, 'query', async () => ({ rowCount: 1 }) as any);

  await ensureAdminUser();

  assert.equal(hashMock.mock.calls.length, 1);
  assert.deepEqual(hashMock.mock.calls[0].arguments, ['secret', 10]);

  assert.equal(queryMock.mock.calls.length, 1);
  const queryArgs = queryMock.mock.calls[0].arguments as unknown as unknown[];
  assert.match(String(queryArgs[0]), /INSERT INTO yoga_users/);
  assert.deepEqual(queryArgs[1], ['admin', 'hashed-secret']);

  assert.equal(logMock.mock.calls.length, 1);
  assert.match(String(logMock.mock.calls[0].arguments[0]), /Admin account ensured: admin/);
});
