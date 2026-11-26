// Captures the real interface frames the reel shows (reel/ui.spec.ts).
//   npx playwright test -c reel/pw.ui.config.ts      (needs npm run dev)
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'ui.spec.ts', reporter: [['line']], workers: 1, outputDir: '/tmp/67-reel-ui-results',
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.REEL_BROWSER || '/opt/pw-browsers/chromium' } } }],
});
