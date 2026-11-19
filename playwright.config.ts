import { defineConfig } from '@playwright/test';

// Browser tests for the staff app, at phone and desktop size. They start their own copy of the web app on port 3100,
// never the one you may have running on port 3000, so they cannot disturb your development session.
// 3100 unless E2E_WEB_PORT says otherwise (for when something of yours already uses 3100)
const TEST_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);

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
  webServer: [
    {
      command: `npm run dev -w @toobler-one/web -- --port ${TEST_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${TEST_PORT}`,
      // With E2E_WEB_PORT set (to a port where the staff app already runs, such as 3000) that running app is used as it is
      reuseExistingServer: Boolean(process.env.E2E_WEB_PORT),
      timeout: 60_000,
    },
    {
      // The website chat: the real loader and chat window (built first) behind a pretend chat service and two pretend customer websites
      command: 'npm run build:widget && npx tsx e2e/widget-fixture/server.ts',
      url: 'http://127.0.0.1:3200/widget/loader.js',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
