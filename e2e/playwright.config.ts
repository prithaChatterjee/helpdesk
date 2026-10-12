import { defineConfig, devices } from '@playwright/test';
import { apiEnv, E2E_API_URL, E2E_WEB_PORT, E2E_WEB_URL } from './test-env';

const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './tests',
  // Tests share one database, so run them one at a time
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Never reuse a running server: it could be pointed at another database, and every run must
  // start from a freshly reset one.
  webServer: [
    {
      name: 'api',
      // Resets and seeds the e2e database, then starts the API
      command: 'npm run serve:api',
      url: `${E2E_API_URL}/api/health`,
      env: apiEnv,
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 120_000,
    },
    {
      name: 'web',
      command: `npm run dev -- --port ${E2E_WEB_PORT} --strictPort`,
      cwd: '../apps/web',
      url: E2E_WEB_URL,
      env: { API_PROXY_TARGET: E2E_API_URL },
      reuseExistingServer: false,
    },
  ],
});
