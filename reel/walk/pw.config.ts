// Records the walkthrough's screen layer (reel/walk/record.spec.ts).
//   npm run dev; npx playwright test -c reel/walk/pw.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'record.spec.ts', reporter: [['line']], workers: 1, outputDir: '/tmp/67-walk-results', timeout: 1_800_000,
  projects: [{ name: 'chromium', use: { browserName: 'chromium', actionTimeout: 30_000, launchOptions: { executablePath: process.env.REEL_BROWSER || '/opt/pw-browsers/chromium' } } }],
});
