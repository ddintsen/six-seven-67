import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MOCK_NOW, MockChain } from './support/mockChain';
import { MockSources } from './support/mockSources';

// 67's price is a fixed quote, not a live feed: each market says when it was
// set and, when Polymarket has moved two points or more, where Polymarket is now.

const btc = 'Will Bitcoin outperform Gold in 2026?';

test.use({ reducedMotion: 'reduce' });

test('the market page says when the price was set and where Polymarket is now', async ({ page }) => {
  await page.clock.setFixedTime(new Date((MOCK_NOW + 3600) * 1000));
  const chain = new MockChain();
  const sources = new MockSources(chain);
  await chain.install(page);
  await sources.install(page);
  await page.goto('/#/market/btc-vs-gold-2026');
  await expect(page.getByRole('heading', { name: btc, level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Updated on 11 Oct 2026, in line with Polymarket.', { exact: true })).toBeVisible();

  sources.set('btc-vs-gold-2026', { mid: 0.47 });
  await page.reload();
  await expect(page.getByText('Updated on 11 Oct 2026. Polymarket is at 47% now.', { exact: true })).toBeVisible({ timeout: 15_000 });
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
});

test('without a Polymarket midpoint the page says only when the price was set', async ({ page }) => {
  await page.clock.setFixedTime(new Date((MOCK_NOW + 3600) * 1000));
  const chain = new MockChain();
  chain.requote('btc-vs-gold-2026', 450_000);
  await chain.install(page);
  await page.goto('/#/market/btc-vs-gold-2026');
  await expect(page.getByRole('heading', { name: btc, level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.detail-chart .quote-fresh')).toHaveText(/^Updated (just now|\d+ min ago|\d+ h ago)\.$/);
});

test('the lead market on the list carries the same line', async ({ page }) => {
  await page.clock.setFixedTime(new Date((MOCK_NOW + 3600) * 1000));
  const chain = new MockChain();
  const sources = new MockSources(chain);
  await chain.install(page);
  await sources.install(page);
  await page.goto('/#/markets');
  await expect(page.locator('.lead-quote .quote-fresh')).toHaveText(/^Updated .*, in line with Polymarket\.$/, { timeout: 15_000 });
});

test('a final market shows its result without the line', async ({ page }) => {
  const chain = new MockChain();
  chain.finalize('btc-vs-gold-2026', 'Yes');
  await chain.install(page);
  await page.goto('/#/market/btc-vs-gold-2026');
  await expect(page.locator('#quote-heading')).toHaveText('Result', { timeout: 15_000 });
  await expect(page.locator('.quote-fresh')).toHaveCount(0);
});
