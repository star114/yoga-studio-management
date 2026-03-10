const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);

const shouldSuppressRouterWarning = (args: unknown[]) =>
  typeof args[0] === 'string' && args[0].includes('React Router Future Flag Warning');

const shouldSuppressFrontendError = (args: unknown[]) =>
  typeof args[0] === 'string' && args[0].startsWith('Failed to ');

console.error = (...args: unknown[]) => {
  if (shouldSuppressRouterWarning(args) || shouldSuppressFrontendError(args)) {
    return;
  }
  originalConsoleError(...args);
};

console.warn = (...args: unknown[]) => {
  if (shouldSuppressRouterWarning(args)) {
    return;
  }
  originalConsoleWarn(...args);
};
