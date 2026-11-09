import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Test files share one throwaway database, so they run one after another
    fileParallelism: false,
    env: { NODE_ENV: 'test' },
    testTimeout: 15_000,
  },
});
