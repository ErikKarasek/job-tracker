import { defineConfig } from '@playwright/test'

// End-to-end tests of the board in a real browser, against the test server (tests/serve.sh):
// its own D1 state, admin key "e2e", no Workers AI. Locally they drive the installed Google
// Chrome; CI installs Playwright's Chromium instead.
export default defineConfig({
  testDir: 'tests/e2e',
  // One shared test database: run the files one after another.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8799',
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'sh tests/serve.sh',
    url: 'http://localhost:8799/api/health',
    // CI starts the server itself so the Postman run can share it (.github/workflows/test.yml).
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
