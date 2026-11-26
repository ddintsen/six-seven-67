import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADDRESS, connectAdena, MockChain } from './support/mockChain';
import { MockSources } from './support/mockSources';

const fed = 'Another Fed rate hike in 2026?';
const btc = 'Will Bitcoin outperform Gold in 2026?';

async function open(page: Page, chain: MockChain, sources: MockSources, route = '/#/status') {
  await chain.install(page);
  await sources.install(page);
  await page.goto(route);
  await expect(page.getByRole('heading', { name: 'Markets', level: 2 })).toBeVisible({ timeout: 15_000 });
}

test('the status page compares the realm, Polymarket and Polygon for every market', async ({ page }) => {
  const chain = new MockChain();
  const sources = new MockSources(chain);
  sources.set('btc-vs-gold-2026', { mid: 0.45 });
  await open(page, chain, sources);
  const row = page.getByRole('article', { name: btc, exact: true });
  await expect(row.getByText('0.42', { exact: true })).toBeVisible();
  await expect(row.getByText('0.45', { exact: true })).toBeVisible();
  await expect(row.getByText('Not settled', { exact: true })).toBeVisible();
  await expect(page.getByText('The realm holds 32.00 GNOT against 32.00 GNOT of escrow.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Results to sign' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /in Adena/ })).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
});

test('the oracle signs a result settled on Polygon with the evidence the page prepared', async ({ page }) => {
  const chain = new MockChain();
  const sources = new MockSources(chain);
  sources.settle('fed-hike-2026', 'No');
  await open(page, chain, sources);
  const card = page.getByRole('article', { name: fed, exact: true }).first();
  await expect(page.getByRole('heading', { name: 'Results to sign', level: 2 })).toBeVisible();
  await expect(card.getByText('Only this market’s oracle')).toBeVisible();
  await connectAdena(page);
  await expect(page.getByText(/This account is the oracle of 4 markets\./)).toBeVisible();
  await page.getByRole('button', { name: 'Sign No in Adena', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `“${fed}” is final: No won. Holders can claim now.` })).toBeVisible({ timeout: 20_000 });
  expect(chain.calls).toHaveLength(1);
  const call = chain.calls[0];
  expect(call.func).toBe('FinalizeByOracle');
  expect(call.args.slice(0, 6)).toEqual(['fed-hike-2026', chain.market('fed-hike-2026').conditionId, expect.stringMatching(/^[0-9a-f]{64}$/), '41', '42', 'No']);
  expect(call.args[6]).toMatch(/^[0-9a-f]{64}$/);
  expect(chain.market('fed-hike-2026').winner).toBe('No');
  await expect(page.getByRole('article', { name: fed, exact: true }).getByText('Final, No won')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Results to sign' })).toHaveCount(0);
});

test('the oracle signs every settled result with one signature', async ({ page }) => {
  const chain = new MockChain();
  const sources = new MockSources(chain);
  sources.settle('fed-hike-2026', 'No');
  sources.settle('btc-vs-gold-2026', 'Yes');
  await open(page, chain, sources);
  await connectAdena(page);
  await page.getByRole('button', { name: 'Sign all 2 in Adena', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 results are signed.' }).first()).toBeVisible({ timeout: 20_000 });
  expect(chain.calls.map(c => [c.func, c.args[0], c.args[5]])).toEqual(expect.arrayContaining([['FinalizeByOracle', 'fed-hike-2026', 'No'], ['FinalizeByOracle', 'btc-vs-gold-2026', 'Yes']]));
  expect(chain.calls).toHaveLength(2);
  expect(chain.market('fed-hike-2026').winner).toBe('No');
  expect(chain.market('btc-vs-gold-2026').winner).toBe('Yes');
  await expect(page.getByRole('heading', { name: 'Results to sign' })).toHaveCount(0);
});

test('the administrator updates every drifting price in one signature, and a stale view changes nothing', async ({ page }) => {
  const chain = new MockChain();
  chain.administrator = ADDRESS;
  const sources = new MockSources(chain);
  sources.set('btc-vs-gold-2026', { mid: 0.45 });
  sources.set('apple-new-line-2026', { mid: 0.9 });
  await open(page, chain, sources);
  await connectAdena(page);
  await expect(page.getByRole('heading', { name: '2 prices to change' })).toBeVisible();
  // Someone else moves a price after the page read it: the whole transaction is refused.
  chain.requote('apple-new-line-2026', 800_000);
  await page.getByRole('button', { name: 'Update 2 prices in Adena', exact: true }).click();
  await expect(page.getByText('A price changed in the meantime. Nothing was applied; review the new prices and try again.')).toBeVisible();
  expect(chain.market('btc-vs-gold-2026').yesPricePpm).toBe(420_000);
  expect(chain.calls.map(c => c.func)).toEqual(['SetQuote', 'SetQuote']);
  // Read again: both prices are proposed from the new versions and applied together.
  await page.reload();
  await connectAdena(page);
  chain.calls = [];
  await page.getByRole('button', { name: 'Update 2 prices in Adena', exact: true }).click();
  await expect(page.getByText('2 new prices are live.')).toBeVisible({ timeout: 20_000 });
  expect(chain.calls).toEqual([
    { func: 'SetQuote', args: ['btc-vs-gold-2026', '450000', '1'], send: '' },
    { func: 'SetQuote', args: ['apple-new-line-2026', '900000', '2'], send: '' },
  ]);
  expect(chain.market('btc-vs-gold-2026').yesPricePpm).toBe(450_000);
});

test('a proposed administrator accepts the role from the status page', async ({ page }) => {
  const chain = new MockChain();
  chain.pendingAdministrator = ADDRESS;
  const sources = new MockSources(chain);
  await open(page, chain, sources);
  await connectAdena(page);
  await page.getByRole('button', { name: 'Accept in Adena', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'This account is the administrator now.' })).toBeVisible({ timeout: 20_000 });
  expect(chain.administrator).toBe(ADDRESS);
});

test('a market page says when Polygon has settled and the oracle has not, and shows the result once final', async ({ page }) => {
  const chain = new MockChain();
  const sources = new MockSources(chain);
  sources.settle('fed-hike-2026', 'Yes');
  chain.finalize('btc-vs-gold-2026', 'No');
  await chain.install(page);
  await sources.install(page);
  await page.goto('/#/market/fed-hike-2026');
  await expect(page.getByText('Yes, settled on Polygon. Waiting for the oracle to record it here.')).toBeVisible({ timeout: 15_000 });
  await page.goto('/#/market/btc-vs-gold-2026');
  await expect(page.getByRole('heading', { name: 'Result', level: 2 }).first()).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Result', exact: true });
  await expect(panel.getByText(/won\. Each No share pays 1 GNOT/)).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Claim in Portfolio' })).toHaveAttribute('href', '#/portfolio');
  await expect(panel.getByRole('button', { name: 'Review trade' })).toHaveCount(0);
});
