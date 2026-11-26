// Opens ../67.html from disk and exercises the live venue: the markets read
// from Onyx, a market page with its ticket, and the Polymarket mirror. Run
// from the project folder after packaging:
//   node scripts/verify-standalone.mjs [chromium executable]
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium, expect } = createRequire(path.join(process.cwd(), 'package.json'))('@playwright/test');
const output = path.resolve('..');
const url = pathToFileURL(path.join(output, '67.html')).href;
const evidence = path.resolve('.qa/qa-standalone');
await mkdir(evidence, { recursive: true });
const executablePath = process.argv[2];
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
// The page's only network use: Onyx's RPC and indexer, Polymarket's public APIs and images, and Polygon RPCs for settlement.
const allowedRemote = /^https:\/\/((rpc|indexer)\.onyx\.testnets\.gno\.land|gamma-api\.polymarket\.com|clob\.polymarket\.com|polymarket-upload\.s3\.us-east-2\.amazonaws\.com|polygon-bor-rpc\.publicnode\.com|polygon\.drpc\.org|1rpc\.io)\//;
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const problems = [];
    const remote = [];
    const local = [];
    page.on('pageerror', error => problems.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) problems.push(`${message.type()}: ${message.text().replace(/data:[^\s'"]+/g, '[embedded]')}`); });
    page.on('request', request => {
      if (/^https?:/i.test(request.url())) remote.push(request.url());
      if (/^file:/i.test(request.url()) && request.url().split('#')[0] !== url) local.push(request.url());
    });

    // The one venue: markets read from Onyx.
    await page.goto(`${url}#/markets`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { level: 1, name: 'Big questions. Questionable confidence.' })).toBeVisible();
    await expect(page.locator('.venue-note')).toContainText('markets on the 67 contract', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /More on Polymarket/ })).toBeVisible({ timeout: 20_000 });
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, font: document.fonts.check('16px "IBM Plex Sans"') }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width);

    // A market page: its question, its ticket, and the wallet prompt.
    const first = page.locator('.lead .question-link').first();
    const question = (await first.innerText()).trim();
    await first.click();
    await expect(page.getByRole('heading', { level: 1, name: question })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Take a position', exact: true }).getByRole('button', { name: 'Connect Adena', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(problems).toEqual([]);
    expect(local).toEqual([]);
    expect(remote.filter(request => !allowedRemote.test(request))).toEqual([]);
    results.push({ browser: browser.version(), width, metrics, remoteHosts: [...new Set(remote.map(request => new URL(request).host))], verified: ['markets read from Onyx', 'the Polymarket mirror', 'a market page with its ticket', 'only the allowed hosts', 'no horizontal overflow'] });
    console.log(`PASS ${width}: live markets, mirror and a market page; remote hosts ${[...new Set(remote.map(request => new URL(request).host))].join(', ') || 'none'}`);
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(path.join(evidence, 'report.json'), JSON.stringify(results, null, 2));
