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

test('ensureAdminUser hashes password and inserts admin account once', async (t) => {
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
  assert.match(String(queryArgs[0]), /ON CONFLICT \(login_id\) DO NOTHING/);
  assert.deepEqual(queryArgs[1], ['admin', 'hashed-secret']);

  assert.equal(logMock.mock.calls.length, 1);
  assert.match(String(logMock.mock.calls[0].arguments[0]), /Admin account ensured: admin/);
});

test('ensureAdminUser does not reset existing admin password on conflict', async (t) => {
  process.env.ADMIN_ID = 'admin';
  process.env.ADMIN_PASSWORD = 'secret';

  const logMock = t.mock.method(console, 'log', () => undefined);
  const hashMock = t.mock.method(bcrypt, 'hash', async () => 'hashed-secret');
  const queryMock = t.mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('INSERT INTO yoga_users')) {
      return { rowCount: 0 } as any;
    }
    if (sql.includes('UPDATE yoga_users')) {
      return { rowCount: 0 } as any;
    }
    return { rowCount: 0 } as any;
  });

  await ensureAdminUser();

  assert.equal(hashMock.mock.calls.length, 1);
  assert.equal(queryMock.mock.calls.length, 2);
  const queryArgs = queryMock.mock.calls[0].arguments as unknown as unknown[];
  assert.match(String(queryArgs[0]), /ON CONFLICT \(login_id\) DO NOTHING/);
  const updateQueryArgs = queryMock.mock.calls[1].arguments as unknown as unknown[];
  assert.match(String(updateQueryArgs[0]), /UPDATE yoga_users/);
  assert.match(String(updateQueryArgs[0]), /role <> 'admin'/);
  assert.equal(logMock.mock.calls.length, 1);
  assert.match(String(logMock.mock.calls[0].arguments[0]), /bootstrap skipped: admin/);
});

test('ensureAdminUser promotes existing bootstrap account role to admin on conflict', async (t) => {
  process.env.ADMIN_ID = 'admin';
  process.env.ADMIN_PASSWORD = 'secret';

  const logMock = t.mock.method(console, 'log', () => undefined);
  const hashMock = t.mock.method(bcrypt, 'hash', async () => 'hashed-secret');
  const queryMock = t.mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('INSERT INTO yoga_users')) {
      return { rowCount: 0 } as any;
    }
    if (sql.includes('UPDATE yoga_users')) {
      return { rowCount: 1 } as any;
    }
    return { rowCount: 0 } as any;
  });

  await ensureAdminUser();

  assert.equal(hashMock.mock.calls.length, 1);
  assert.equal(queryMock.mock.calls.length, 2);
  const insertArgs = queryMock.mock.calls[0].arguments as unknown as unknown[];
  assert.match(String(insertArgs[0]), /ON CONFLICT \(login_id\) DO NOTHING/);
  const updateArgs = queryMock.mock.calls[1].arguments as unknown as unknown[];
  assert.match(String(updateArgs[0]), /UPDATE yoga_users/);
  assert.deepEqual(updateArgs[1], ['admin']);
  assert.equal(logMock.mock.calls.length, 1);
  assert.match(String(logMock.mock.calls[0].arguments[0]), /role promoted: admin/);
});
