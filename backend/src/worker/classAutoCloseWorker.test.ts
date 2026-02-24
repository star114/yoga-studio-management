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
  const queryMock = t.mock.method(pool, 'query', async (sql: string) => {
    if (/WITH eligible/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          eligible_count: 2,
          no_attendance_count: 2,
          selected_count: 2,
          inserted_count: 2,
          updated_registration_count: 2,
          updated_membership_count: 2,
        }],
      } as any;
    }
    return { rowCount: 2 } as any;
  });

  const stop = startClassAutoCloseWorker();
  await flushAsync();

  assert.equal(queryMock.mock.calls.length, 2);
  const firstQuery = String(queryMock.mock.calls[0].arguments[0]);
  assert.match(firstQuery, /INSERT INTO yoga_attendances/i);
  assert.equal(typeof capturedCallback, 'function');
  const initialLogs = logMock.mock.calls.map((call) => String(call.arguments[0]));
  assert.equal(initialLogs.some((line) => /Auto-processed 2 attendance/.test(line)), true);
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
  const queryMock = t.mock.method(pool, 'query', async (sql: string) => {
    if (/WITH eligible/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          eligible_count: 0,
          no_attendance_count: 0,
          selected_count: 0,
          inserted_count: 0,
          updated_registration_count: 0,
          updated_membership_count: 0,
        }],
      } as any;
    }
    return { rowCount: 0 } as any;
  });

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

  const queryMock = t.mock.method(pool, 'query', async (sql: string) => {
    if (isFirstCall) {
      isFirstCall = false;
      await firstPending;
      return {
        rowCount: 1,
        rows: [{
          eligible_count: 0,
          no_attendance_count: 0,
          selected_count: 0,
          inserted_count: 0,
          updated_registration_count: 0,
          updated_membership_count: 0,
        }],
      } as any;
    }
    if (/WITH eligible/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          eligible_count: 0,
          no_attendance_count: 0,
          selected_count: 0,
          inserted_count: 0,
          updated_registration_count: 0,
          updated_membership_count: 0,
        }],
      } as any;
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

test('worker uses fallback attendance summary when sync query returns no rows', async (t) => {
  process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED = 'true';
  process.env.CLASS_AUTO_CLOSE_INTERVAL_MS = '10';

  global.setInterval = (((_cb: () => void) => ({} as NodeJS.Timeout))) as typeof setInterval;
  global.clearInterval = (((_timer: NodeJS.Timeout) => undefined)) as typeof clearInterval;

  const logMock = t.mock.method(console, 'log', () => undefined);
  const warnMock = t.mock.method(console, 'warn', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  const queryMock = t.mock.method(pool, 'query', async (sql: string) => {
    if (/WITH eligible/i.test(sql)) {
      return { rowCount: 0, rows: [] } as any;
    }
    return { rowCount: 0 } as any;
  });

  startClassAutoCloseWorker();
  await flushAsync();

  assert.equal(queryMock.mock.calls.length, 2);
  assert.equal(
    logMock.mock.calls.some((call) => /Auto-processed/.test(String(call.arguments[0]))),
    false
  );
  assert.equal(warnMock.mock.calls.length, 0);
});

test('worker warns skipped registrations with no eligible membership count', async (t) => {
  process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED = 'true';
  process.env.CLASS_AUTO_CLOSE_INTERVAL_MS = '10';

  global.setInterval = (((_cb: () => void) => ({} as NodeJS.Timeout))) as typeof setInterval;
  global.clearInterval = (((_timer: NodeJS.Timeout) => undefined)) as typeof clearInterval;

  t.mock.method(console, 'log', () => undefined);
  const warnMock = t.mock.method(console, 'warn', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(pool, 'query', async (sql: string) => {
    if (/WITH eligible/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          eligible_count: 4,
          no_attendance_count: 3,
          selected_count: 1,
          inserted_count: 1,
          updated_registration_count: 1,
          updated_membership_count: 1,
        }],
      } as any;
    }
    return { rowCount: 0 } as any;
  });

  startClassAutoCloseWorker();
  await flushAsync();

  assert.equal(warnMock.mock.calls.length, 1);
  const warnMessage = String(warnMock.mock.calls[0].arguments[0]);
  assert.match(warnMessage, /skipped 2 registration/);
  assert.match(warnMessage, /no eligible membership: 2/);
});

test('worker warns skipped registrations without membership suffix when all were selectable', async (t) => {
  process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED = 'true';
  process.env.CLASS_AUTO_CLOSE_INTERVAL_MS = '10';

  global.setInterval = (((_cb: () => void) => ({} as NodeJS.Timeout))) as typeof setInterval;
  global.clearInterval = (((_timer: NodeJS.Timeout) => undefined)) as typeof clearInterval;

  t.mock.method(console, 'log', () => undefined);
  const warnMock = t.mock.method(console, 'warn', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(pool, 'query', async (sql: string) => {
    if (/WITH eligible/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          eligible_count: 4,
          no_attendance_count: 3,
          selected_count: 3,
          inserted_count: 1,
          updated_registration_count: 1,
          updated_membership_count: 1,
        }],
      } as any;
    }
    return { rowCount: 0 } as any;
  });

  startClassAutoCloseWorker();
  await flushAsync();

  assert.equal(warnMock.mock.calls.length, 1);
  const warnMessage = String(warnMock.mock.calls[0].arguments[0]);
  assert.match(warnMessage, /skipped 2 registration/);
  assert.doesNotMatch(warnMessage, /no eligible membership/);
});

test('worker handles partial attendance summary fields with nullish fallbacks', async (t) => {
  process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED = 'true';
  process.env.CLASS_AUTO_CLOSE_INTERVAL_MS = '10';

  global.setInterval = (((_cb: () => void) => ({} as NodeJS.Timeout))) as typeof setInterval;
  global.clearInterval = (((_timer: NodeJS.Timeout) => undefined)) as typeof clearInterval;

  const logMock = t.mock.method(console, 'log', () => undefined);
  const warnMock = t.mock.method(console, 'warn', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(pool, 'query', async (sql: string) => {
    if (/WITH eligible/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          inserted_count: 1,
        }],
      } as any;
    }
    return { rowCount: 0 } as any;
  });

  startClassAutoCloseWorker();
  await flushAsync();

  assert.equal(warnMock.mock.calls.length, 0);
  const logs = logMock.mock.calls.map((call) => String(call.arguments[0]));
  assert.equal(logs.some((line) => /Auto-processed 1 attendance/.test(line)), true);
  assert.equal(logs.some((line) => /registrations: 0, memberships: 0/.test(line)), true);
});

test('worker treats missing inserted_count as zero', async (t) => {
  process.env.CLASS_AUTO_CLOSE_WORKER_ENABLED = 'true';
  process.env.CLASS_AUTO_CLOSE_INTERVAL_MS = '10';

  global.setInterval = (((_cb: () => void) => ({} as NodeJS.Timeout))) as typeof setInterval;
  global.clearInterval = (((_timer: NodeJS.Timeout) => undefined)) as typeof clearInterval;

  const logMock = t.mock.method(console, 'log', () => undefined);
  const warnMock = t.mock.method(console, 'warn', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(pool, 'query', async (sql: string) => {
    if (/WITH eligible/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{
          no_attendance_count: 0,
          selected_count: 0,
        }],
      } as any;
    }
    return { rowCount: 0 } as any;
  });

  startClassAutoCloseWorker();
  await flushAsync();

  assert.equal(warnMock.mock.calls.length, 0);
  assert.equal(
    logMock.mock.calls.some((call) => /Auto-processed/.test(String(call.arguments[0]))),
    false
  );
});
