const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleLog = console.log.bind(console);
const originalConsoleInfo = console.info.bind(console);

const startsWithAny = (value, prefixes) =>
  typeof value === 'string' && prefixes.some((prefix) => value.startsWith(prefix));

const shouldSuppressBackendError = (args) => startsWithAny(args[0], [
  'Error:',
  'Require admin check error:',
  'Check ',
  'Get ',
  'Create ',
  'Update ',
  'Delete ',
  'Deactivate ',
  'Reset ',
  'Cancel ',
  'Register ',
  'Login error:',
  'Change password error:',
  '❌ Graceful shutdown timed out.',
  '❌ Error while closing HTTP server:',
  '❌ Failed to start server:',
  '❌ Migration failed:',
]);

const shouldSuppressBackendWarn = (args) => startsWithAny(args[0], [
  'Class registration blocked by membership validation',
]);

const shouldSuppressBackendInfo = (args) => startsWithAny(args[0], [
  '🧘 Yoga Studio Backend running on port',
  '⚠️ Received SIG',
  '✅ HTTP server closed. Exiting.',
  'ℹ️ No migration files found.',
  '🚀 Applying migration:',
  '✅ Applied migration:',
  '⏭️  Skipping already applied migration:',
]);

console.error = (...args) => {
  if (shouldSuppressBackendError(args)) {
    return;
  }
  originalConsoleError(...args);
};

console.warn = (...args) => {
  if (shouldSuppressBackendWarn(args)) {
    return;
  }
  originalConsoleWarn(...args);
};

console.log = (...args) => {
  if (shouldSuppressBackendInfo(args)) {
    return;
  }
  originalConsoleLog(...args);
};

console.info = (...args) => {
  if (shouldSuppressBackendInfo(args)) {
    return;
  }
  originalConsoleInfo(...args);
};
