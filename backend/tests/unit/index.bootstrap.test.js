const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const waitForAsync = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

const loadIndexWithMocks = ({
  ensureAdminError = null,
  closeError = null,
  closeHangs = false,
} = {}) => {
  const indexPath = require.resolve('../../dist/index');
  delete require.cache[indexPath];

  let stopWorkerCalls = 0;
  let signalHandlers = {};

  const routes = {};
  const app = {
    use() {},
    get(path, handler) {
      routes[path] = handler;
    },
    listen(_port, cb) {
      if (typeof cb === 'function') cb();
      return {
        close(done) {
          if (!closeHangs) {
            done(closeError || undefined);
          }
        },
      };
    },
  };

  const expressMock = () => app;
  expressMock.json = () => (...args) => args[2]();

  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === 'express') return expressMock;
    if (request === 'cors') return () => (...args) => args[2]();
    if (request === 'morgan') return () => (...args) => args[2]();
    if (request === 'dotenv') return { config: () => ({}) };

    if (request === './routes/auth') return { __esModule: true, default: {} };
    if (request === './routes/customers') return { __esModule: true, default: {} };
    if (request === './routes/memberships') return { __esModule: true, default: {} };
    if (request === './routes/attendances') return { __esModule: true, default: {} };
    if (request === './routes/classes') return { __esModule: true, default: {} };
    if (request === './middleware/errorHandler') {
      return { __esModule: true, errorHandler: () => {} };
    }
    if (request === './bootstrap/admin') {
      return {
        __esModule: true,
        ensureAdminUser: async () => {
          if (ensureAdminError) throw ensureAdminError;
        },
      };
    }
    if (request === './worker/classAutoCloseWorker') {
      return {
        __esModule: true,
        startClassAutoCloseWorker: () => () => {
          stopWorkerCalls += 1;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  return {
    requireIndex() {
      require('../../dist/index');
    },
    restore() {
      Module._load = originalLoad;
      signalHandlers = {};
    },
    getStopWorkerCalls() {
      return stopWorkerCalls;
    },
    setSignalHandlers(handlers) {
      signalHandlers = handlers;
    },
    getSignalHandlers() {
      return signalHandlers;
    },
    getRouteHandler(path) {
      return routes[path];
    },
  };
};

test('index bootstrap handles graceful shutdown success', async (t) => {
  const harness = loadIndexWithMocks();
  const exitCodes = [];
  const handlers = {};

  t.mock.method(process, 'on', (signal, handler) => {
    handlers[signal] = handler;
    return process;
  });
  t.mock.method(process, 'exit', (code) => {
    exitCodes.push(code);
  });
  t.mock.method(global, 'setTimeout', () => 123);
  t.mock.method(global, 'clearTimeout', () => {});

  harness.requireIndex();
  await waitForAsync();
  harness.setSignalHandlers(handlers);

  const healthHandler = harness.getRouteHandler('/health');
  const healthRes = { body: null, json(payload) { this.body = payload; return this; } };
  healthHandler({}, healthRes);
  assert.equal(healthRes.body.status, 'ok');

  assert.equal(typeof harness.getSignalHandlers().SIGTERM, 'function');
  harness.getSignalHandlers().SIGTERM();
  await waitForAsync();
  assert.equal(harness.getStopWorkerCalls(), 1);
  assert.equal(exitCodes.includes(0), true);

  harness.getSignalHandlers().SIGINT();
  await waitForAsync();
  assert.equal(harness.getStopWorkerCalls(), 1);
  harness.restore();
});

test('index bootstrap exits with error when server close fails', async (t) => {
  const harness = loadIndexWithMocks({ closeError: new Error('close failed') });
  const exitCodes = [];
  const handlers = {};

  t.mock.method(process, 'on', (signal, handler) => {
    handlers[signal] = handler;
    return process;
  });
  t.mock.method(process, 'exit', (code) => {
    exitCodes.push(code);
  });
  t.mock.method(global, 'setTimeout', () => 123);
  t.mock.method(global, 'clearTimeout', () => {});

  harness.requireIndex();
  await waitForAsync();
  handlers.SIGINT();
  await waitForAsync();

  assert.equal(exitCodes.includes(1), true);
  harness.restore();
});

test('index bootstrap forces exit when graceful shutdown times out', async (t) => {
  const harness = loadIndexWithMocks({ closeHangs: true });
  const exitCodes = [];
  const handlers = {};
  let forceExitCallback = null;

  t.mock.method(process, 'on', (signal, handler) => {
    handlers[signal] = handler;
    return process;
  });
  t.mock.method(process, 'exit', (code) => {
    exitCodes.push(code);
  });
  t.mock.method(global, 'setTimeout', (fn) => {
    forceExitCallback = fn;
    return 123;
  });
  t.mock.method(global, 'clearTimeout', () => {});

  harness.requireIndex();
  await waitForAsync();
  handlers.SIGTERM();
  assert.equal(typeof forceExitCallback, 'function');
  forceExitCallback();
  await waitForAsync();
  assert.equal(exitCodes.includes(1), true);
  harness.restore();
});

test('index bootstrap exits when ensureAdminUser fails', async (t) => {
  const harness = loadIndexWithMocks({ ensureAdminError: new Error('boot fail') });
  const exitCodes = [];

  t.mock.method(process, 'on', () => process);
  t.mock.method(process, 'exit', (code) => {
    exitCodes.push(code);
  });

  harness.requireIndex();
  await waitForAsync();
  assert.equal(exitCodes.includes(1), true);
  harness.restore();
});
