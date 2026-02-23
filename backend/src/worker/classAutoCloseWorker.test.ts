import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database';
import { startClassAutoCloseWorker } from './classAutoCloseWorker';

const originalEnv = { ...process.env };
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;

const flushAsync = async () => new Promise((resolve) => setImmediate(resolve));

test.afterEach(() => {
  process.env = { ...originalEnv };
  global.setInterval = originalSetInterval;
  global.clearInterval = originalClearInterval;
});

test('worker returns noop and logs when disabled', (t) => {
  process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED = 'false';

  const logMock = t.mock.method(console, 'log', () => undefined);
  const queryMock = t.mock.method(pool, 'query', async () => ({ rowCount: 1 }) as any);

  const stop = startClassAutoCloseWorker();

  assert.equal(typeof stop, 'function');
  stop();
  assert.equal(queryMock.mock.calls.length, 0);
  assert.equal(logMock.mock.calls.length, 1);
  assert.match(String(logMock.mock.calls[0].arguments[0]), /disabled/);
});

test('worker starts with fallback interval, runs query, and stops', async (t) => {
  process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED = 'true';
  process.env.CLASS_AUTO_CLOSE_INTERVAL_MS = 'invalid';

  const fakeTimer = {} as NodeJS.Timeout;
  let capturedCallback: (() => void) | undefined;

  global.setInterval = ((cb: () => void) => {
    capturedCallback = cb as () => void;
    return fakeTimer;
  }) as typeof setInterval;

  let clearedWith: NodeJS.Timeout | null = null;
  global.clearInterval = ((timer: NodeJS.Timeout) => {
    clearedWith = timer;
  }) as typeof clearInterval;

  const logMock = t.mock.method(console, 'log', () => undefined);
  const queryMock = t.mock.method(pool, 'query', async () => ({ rowCount: 2 }) as any);

  const stop = startClassAutoCloseWorker();
  await flushAsync();

  assert.equal(queryMock.mock.calls.length, 2);
  assert.equal(typeof capturedCallback, 'function');
  const initialLogs = logMock.mock.calls.map((call) => String(call.arguments[0]));
  assert.equal(initialLogs.some((line) => /Auto-marked 2 registration/.test(line)), true);
  assert.equal(initialLogs.some((line) => /Auto-closed 2 completed class/.test(line)), true);
  assert.equal(initialLogs.some((line) => /interval: 60000ms/.test(line)), true);

  (capturedCallback as () => void)();
  await flushAsync();
  assert.equal(queryMock.mock.calls.length, 4);

  stop();
  stop();
  assert.equal(clearedWith, fakeTimer);
  const allLogs = logMock.mock.calls.map((call) => String(call.arguments[0]));
  assert.equal(allLogs.some((line) => /worker stopped/.test(line)), true);
});

test('worker logs error when query fails', async (t) => {
  process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED = 'true';
  process.env.CLASS_AUTO_CLOSE_INTERVAL_MS = '10';

  global.setInterval = (((_cb: () => void) => ({} as NodeJS.Timeout))) as typeof setInterval;
  global.clearInterval = (((_timer: NodeJS.Timeout) => undefined)) as typeof clearInterval;

  const errorMock = t.mock.method(console, 'error', () => undefined);
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(pool, 'query', async () => {
    throw new Error('db down');
  });

  startClassAutoCloseWorker();
  await flushAsync();

  assert.equal(errorMock.mock.calls.length, 1);
  assert.match(String(errorMock.mock.calls[0].arguments[0]), /worker failed/);
});

test('worker uses default env values when variables are missing', async (t) => {
  delete process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED;
  delete process.env.CLASS_AUTO_CLOSE_INTERVAL_MS;

  let capturedIntervalMs = 0;
  global.setInterval = (((_cb: () => void, ms?: number) => {
    capturedIntervalMs = Number(ms);
    return {} as NodeJS.Timeout;
  }) as unknown) as typeof setInterval;
  global.clearInterval = (((_timer: NodeJS.Timeout) => undefined)) as typeof clearInterval;

  t.mock.method(console, 'log', () => undefined);
  const queryMock = t.mock.method(pool, 'query', async () => ({ rowCount: 0 }) as any);

  startClassAutoCloseWorker();
  await flushAsync();

  assert.equal(capturedIntervalMs, 60000);
  assert.equal(queryMock.mock.calls.length, 2);
});

test('worker prevents overlapping run execution when already running', async (t) => {
  process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED = 'true';
  process.env.CLASS_AUTO_CLOSE_INTERVAL_MS = '10';

  let capturedCallback: (() => void) | undefined;
  global.setInterval = ((cb: () => void) => {
    capturedCallback = cb as () => void;
    return {} as NodeJS.Timeout;
  }) as typeof setInterval;
  global.clearInterval = (((_timer: NodeJS.Timeout) => undefined)) as typeof clearInterval;

  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', () => undefined);

  let resolveFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => {
    resolveFirst = resolve;
  });
  let isFirstCall = true;

  const queryMock = t.mock.method(pool, 'query', async () => {
    if (isFirstCall) {
      isFirstCall = false;
      await firstPending;
      return { rowCount: 0 } as any;
    }
    return { rowCount: 0 } as any;
  });

  startClassAutoCloseWorker();
  await flushAsync();
  assert.equal(queryMock.mock.calls.length, 1);

  (capturedCallback as () => void)();
  await flushAsync();
  assert.equal(queryMock.mock.calls.length, 1);

  resolveFirst();
  await flushAsync();
  assert.equal(queryMock.mock.calls.length, 2);

  (capturedCallback as () => void)();
  await flushAsync();
  assert.equal(queryMock.mock.calls.length, 4);
});
