import { defineConfig } from '@playwright/test';

// Browser tests for the staff app, at phone and desktop size. They start their own copy of the web app on port 3100,
// never the one you may have running on port 3000, so they cannot disturb your development session.
const TEST_PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${TEST_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'phone',
      use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true },
    },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run dev -w @toobler-one/web -- --port ${TEST_PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${TEST_PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
