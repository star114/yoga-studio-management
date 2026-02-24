import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const coverageScope = process.env.COVERAGE_SCOPE || 'api-error';

const scopeConfigMap = {
  'api-error': {
    include: ['src/utils/apiError.ts'],
    exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  'core': {
    include: ['src/utils/**/*.ts', 'src/services/**/*.ts', 'src/contexts/**/*.tsx'],
    exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  'shell': {
    include: ['src/App.tsx', 'src/components/**/*.tsx', 'src/index.tsx'],
    exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  'admin-pages': {
    include: [
      'src/pages/AdminDashboard.tsx',
      'src/pages/ClassManagement.tsx',
      'src/pages/ClassDetail.tsx',
      'src/pages/CustomerManagement.tsx',
      'src/pages/CustomerDetail.tsx',
      'src/pages/MembershipManagement.tsx',
      'src/pages/MembershipTypeManagement.tsx',
    ],
    exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  'customer-pages': {
    include: [
      'src/pages/CustomerDashboard.tsx',
      'src/pages/CustomerProfile.tsx',
      'src/pages/Login.tsx',
    ],
    exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  'all-src': {
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
};

const selectedScope = scopeConfigMap[coverageScope] || scopeConfigMap['api-error'];

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: selectedScope.include,
      exclude: selectedScope.exclude,
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
