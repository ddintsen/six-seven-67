import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', outputDir: '.qa/test-results', fullyParallel: true, workers: 3, retries: 0,
  reporter: [['list'], ['html', { outputFolder: '.qa/playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:6767', trace: 'retain-on-failure', screenshot: 'only-on-failure',
    // Practice is the deterministic venue for the regression suite; testnet
    // flows set their own venue and chain in their specs.
    storageState: { cookies: [], origins: [{ origin: 'http://127.0.0.1:6767', localStorage: [{ name: '67.venue', value: 'practice' }] }] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: { command: 'npm run build && npm run preview -- --strictPort', port: 6767, reuseExistingServer: true, timeout: 120000 },
});
