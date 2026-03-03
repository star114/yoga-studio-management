import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import pg from 'pg';
import dotenv from 'dotenv';

const localRequire = createRequire(__filename);

test('database module configures parser and registers pool handlers', (t) => {
  const setTypeParserMock = t.mock.method(pg.types, 'setTypeParser', () => undefined);
  const dotenvMock = t.mock.method(dotenv, 'config', () => ({ parsed: {} }));
  const onHandlers: Record<string, (...args: any[]) => void> = {};
  const onMock = t.mock.method(pg.Pool.prototype, 'on', function (this: any, event: string, handler: (...args: any[]) => void) {
    onHandlers[event] = handler;
    return this;
  });

  const dbModulePath = localRequire.resolve('./database');
  delete localRequire.cache[dbModulePath];
  const imported = localRequire('./database');

  assert.ok(imported.default);
  assert.equal(dotenvMock.mock.calls.length, 1);
  assert.equal(setTypeParserMock.mock.calls.length, 1);
  assert.deepEqual(setTypeParserMock.mock.calls[0].arguments[0], 1082);

  assert.equal(onMock.mock.calls.length, 2);
  assert.equal(typeof onHandlers.connect, 'function');
  assert.equal(typeof onHandlers.error, 'function');
});

test('database connect/error handlers log and exit', async (t) => {
  const onHandlers: Record<string, (...args: any[]) => void> = {};
  t.mock.method(pg.types, 'setTypeParser', () => undefined);
  t.mock.method(dotenv, 'config', () => ({ parsed: {} }));
  t.mock.method(pg.Pool.prototype, 'on', function (this: any, event: string, handler: (...args: any[]) => void) {
    onHandlers[event] = handler;
    return this;
  });
  const queryMock = t.mock.fn(async (_sql: string) => ({ rows: [] }));
  const logMock = t.mock.method(console, 'log', () => undefined);
  const errorMock = t.mock.method(console, 'error', () => undefined);
  const exitMock = t.mock.method(process, 'exit', (() => undefined) as any);

  const dbModulePath = localRequire.resolve('./database');
  delete localRequire.cache[dbModulePath];
  localRequire('./database');

  await onHandlers.connect({ query: queryMock } as any);
  assert.equal(queryMock.mock.calls.length, 1);
  const queryArgs = queryMock.mock.calls[0].arguments as unknown as unknown[];
  assert.match(String(queryArgs[0]), /set_config\('TIMEZONE'/);
  assert.equal(logMock.mock.calls.length > 0, true);
  assert.match(String(logMock.mock.calls[0].arguments[0]), /Database connected/);

  const err = new Error('boom');
  onHandlers.error(err);
  assert.equal(errorMock.mock.calls.length > 0, true);
  assert.match(String(errorMock.mock.calls[0].arguments[0]), /Unexpected database error/);
  assert.equal(exitMock.mock.calls.length, 1);
  assert.equal(exitMock.mock.calls[0].arguments[0], -1);
});

test('database connect handler exits when timezone setup fails', async (t) => {
  const onHandlers: Record<string, (...args: any[]) => void> = {};
  t.mock.method(pg.types, 'setTypeParser', () => undefined);
  t.mock.method(dotenv, 'config', () => ({ parsed: {} }));
  t.mock.method(pg.Pool.prototype, 'on', function (this: any, event: string, handler: (...args: any[]) => void) {
    onHandlers[event] = handler;
    return this;
  });

  const errorMock = t.mock.method(console, 'error', () => undefined);
  const exitMock = t.mock.method(process, 'exit', (() => undefined) as any);
  const queryMock = t.mock.fn(async () => {
    throw new Error('tz set failed');
  });

  const dbModulePath = localRequire.resolve('./database');
  delete localRequire.cache[dbModulePath];
  localRequire('./database');

  await onHandlers.connect({ query: queryMock } as any);
  assert.equal(errorMock.mock.calls.length > 0, true);
  assert.match(String(errorMock.mock.calls[0].arguments[0]), /Failed to set database timezone/);
  assert.equal(exitMock.mock.calls.length, 1);
  assert.equal(exitMock.mock.calls[0].arguments[0], -1);
});
