import base from './playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  ...base,
  testDir: './e2e',
  outputDir: '/tmp/claude-0/pw-results',
  reporter: [['line']],
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 }, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } } }],
  webServer: { ...base.webServer, cwd: '.' },
});
