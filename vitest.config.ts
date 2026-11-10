import { defineConfig } from 'vitest/config';

// Two groups of tests: the API (needs the Docker database) and the repository tooling (lint rules, the gate script).
export default defineConfig({
  test: {
    projects: [
      'apps/api',
      {
        test: {
          name: 'tooling',
          include: ['tools/**/*.test.ts', 'scripts/**/*.test.ts', 'packages/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
