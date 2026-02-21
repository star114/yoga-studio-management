const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fsPromises = require('fs/promises');

const waitForAsync = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

const checksumOf = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');

const runMigrateScript = async ({
  readdirEntries,
  readFileMap,
  poolQueryQueue,
  clientQueryQueue = [],
}) => {
  const modulePath = require.resolve('../../dist/scripts/migrate');
  const dbModulePath = require.resolve('../../dist/config/database');
  delete require.cache[modulePath];
  delete require.cache[dbModulePath];

  const poolCalls = [];
  const clientCalls = [];
  let endCalls = 0;
  let released = false;
  const exitCodes = [];

  const clientMock = {
    async query(...args) {
      clientCalls.push(args);
      const next = clientQueryQueue.shift();
      if (next instanceof Error) throw next;
      return next ?? { rows: [], rowCount: 0 };
    },
    release() {
      released = true;
    },
  };

  const poolMock = {
    async query(...args) {
      poolCalls.push(args);
      const next = poolQueryQueue.shift();
      if (next instanceof Error) throw next;
      return next ?? { rows: [], rowCount: 0 };
    },
    async connect() {
      return clientMock;
    },
    async end() {
      endCalls += 1;
    },
  };

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: { __esModule: true, default: poolMock },
  };

  const readdirMock = () => readdirEntries;
  const readFileMock = (filePath) => {
    const filename = String(filePath).split('/').pop();
    const content = readFileMap[filename];
    if (content === undefined) throw new Error(`Unexpected read: ${filename}`);
    return content;
  };

  const restoreReaddir = fsPromises.readdir;
  const restoreReadFile = fsPromises.readFile;
  fsPromises.readdir = readdirMock;
  fsPromises.readFile = readFileMock;

  const originalExit = process.exit;
  process.exit = (code) => {
    exitCodes.push(code);
  };

  require('../../dist/scripts/migrate');
  await waitForAsync();

  fsPromises.readdir = restoreReaddir;
  fsPromises.readFile = restoreReadFile;
  process.exit = originalExit;

  return { poolCalls, clientCalls, endCalls, released, exitCodes };
};

test('migrate script exits 0 when no migration files exist', async () => {
  const result = await runMigrateScript({
    readdirEntries: [],
    readFileMap: {},
    poolQueryQueue: [{ rows: [] }, { rows: [] }],
  });

  assert.equal(result.endCalls, 1);
  assert.equal(result.exitCodes.includes(0), true);
  assert.equal(result.poolCalls.length >= 2, true);
});

test('migrate script exits 1 on checksum mismatch', async () => {
  const result = await runMigrateScript({
    readdirEntries: [{ name: '001.sql', isFile: () => true }],
    readFileMap: { '001.sql': 'CREATE TABLE t1();' },
    poolQueryQueue: [
      { rows: [] },
      { rows: [{ filename: '001.sql', checksum: 'wrong-checksum' }] },
    ],
  });

  assert.equal(result.endCalls, 1);
  assert.equal(result.exitCodes.includes(1), true);
});

test('migrate script applies pending migration and exits 0', async () => {
  const sql1 = 'CREATE TABLE one(id INT);';
  const sql2 = 'CREATE TABLE two(id INT);';
  const result = await runMigrateScript({
    readdirEntries: [
      { name: '001.sql', isFile: () => true },
      { name: '002.sql', isFile: () => true },
      { name: 'README.md', isFile: () => true },
    ],
    readFileMap: { '001.sql': sql1, '002.sql': sql2 },
    poolQueryQueue: [
      { rows: [] },
      { rows: [{ filename: '001.sql', checksum: checksumOf(sql1) }] },
    ],
    clientQueryQueue: [
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ],
  });

  assert.equal(result.exitCodes.includes(0), true);
  assert.equal(result.endCalls, 1);
  assert.equal(result.released, true);
  assert.equal(result.clientCalls.length, 4);
});

test('migrate script rolls back and exits 1 when applying migration fails', async () => {
  const sql1 = 'CREATE TABLE broken(id INT);';
  const result = await runMigrateScript({
    readdirEntries: [{ name: '001.sql', isFile: () => true }],
    readFileMap: { '001.sql': sql1 },
    poolQueryQueue: [{ rows: [] }, { rows: [] }],
    clientQueryQueue: [
      { rows: [], rowCount: 0 },
      new Error('sql failed'),
      { rows: [], rowCount: 0 },
    ],
  });

  assert.equal(result.exitCodes.includes(1), true);
  assert.equal(
    result.clientCalls.some((call) => call[0] === 'ROLLBACK'),
    true
  );
});
