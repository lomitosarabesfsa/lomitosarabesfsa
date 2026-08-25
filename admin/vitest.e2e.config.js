import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['./worker/test/e2e.test.js'],
    globalSetup: './worker/test/e2e.global-setup.js',
    testTimeout: 30000,
    hookTimeout: 60000,
    singleFork: true,
    forceExit: true,
  },
});
