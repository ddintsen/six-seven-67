import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MOCK_NOW, MockChain } from './support/mockChain';
import { MockSources } from './support/mockSources';

// The on-chain quote and the independently fetched reference have separate times.

const btc = 'Will Bitcoin outperform Gold in 2026?';

test.use({ reducedMotion: 'reduce' });

test('the market page distinguishes the quote from the timestamped reference', async ({ page }) => {
  await page.clock.setFixedTime(new Date((MOCK_NOW + 3600) * 1000));
  const chain = new MockChain();
  const sources = new MockSources(chain);
  await chain.install(page);
  await sources.install(page);
  await page.goto('/#/market/btc-vs-gold-2026');
  await expect(page.getByRole('heading', { name: btc, level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.detail-chart .quote-fresh')).toHaveText('67 quote updated on 11 Oct 2026. Polymarket reference for Yes was 42% (checked 12 Oct 2026, 11:13 UTC).');
  await expect(page.getByText(/The designated oracle records the final outcome on chain/)).toBeVisible();

  sources.set('btc-vs-gold-2026', { mid: 0.47 });
  await page.reload();
  await expect(page.locator('.detail-chart .quote-fresh')).toHaveText('67 quote updated on 11 Oct 2026. Polymarket reference for Yes was 47% (checked 12 Oct 2026, 11:13 UTC).', { timeout: 15_000 });
  await expect(page.getByText(/Polymarket’s price over the last month as a separate reference/)).toBeVisible();
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
  await expect(page.locator('.detail-chart .quote-fresh')).toHaveText(/^67 quote updated (just now|\d+ min ago|\d+ h ago)\.$/);
});

test('the lead market on the list carries the same line', async ({ page }) => {
  await page.clock.setFixedTime(new Date((MOCK_NOW + 3600) * 1000));
  const chain = new MockChain();
  const sources = new MockSources(chain);
  await chain.install(page);
  await sources.install(page);
  await page.goto('/#/markets');
  await expect(page.locator('.lead-quote .quote-fresh')).toHaveText(/^67 quote updated .*\. Polymarket reference for Yes was 42% \(checked .* UTC\)\.$/, { timeout: 15_000 });
});

test('a final market shows its result without the line', async ({ page }) => {
  const chain = new MockChain();
  chain.finalize('btc-vs-gold-2026', 'Yes');
  await chain.install(page);
  await page.goto('/#/market/btc-vs-gold-2026');
  await expect(page.locator('#quote-heading')).toHaveText('Result', { timeout: 15_000 });
  await expect(page.locator('.quote-fresh')).toHaveCount(0);
});
