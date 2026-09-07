// Playwright configuration is included for portfolio-grade browser QA.
// Install @playwright/test before running: npx playwright test.
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './playwright',
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  webServer: { command: 'node server.js', url: 'http://127.0.0.1:3000', reuseExistingServer: true },
});
