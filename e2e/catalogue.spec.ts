import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { IMAGE_ORIGIN, MockChain } from './support/mockChain';

async function open(page: Page, chain: MockChain, route = '/#/markets') {
  await chain.install(page);
  await page.goto(route);
}
const catalogue = (page: Page) => page.getByRole('region', { name: /on Polymarket/ });

test('the markets page mirrors Polymarket below the markets listed on 67', async ({ page }) => {
  const chain = new MockChain();
  await open(page, chain);
  await expect(page.getByRole('heading', { name: 'Will Bitcoin outperform Gold in 2026?', level: 2 })).toBeVisible({ timeout: 15_000 });
  const mirror = catalogue(page);
  await expect(mirror.getByRole('heading', { name: /More on Polymarket/ })).toBeVisible();
  const rows = mirror.getByRole('article');
  await expect(rows).toHaveCount(3); // the fourth Polymarket market is already listed on 67
  await expect(mirror.getByRole('heading', { name: 'Will Bitcoin outperform Gold in 2026?' })).toHaveCount(0);
  const senate = rows.filter({ hasText: 'Will the Democrats win the Senate in 2026?' });
  await expect(senate.getByLabel('Yes 48%, No 52%')).toBeVisible();
  await expect(senate.getByText('$9.4M')).toBeVisible();
  await expect(rows.filter({ hasText: 'Will Ethereum reach $5,000 in 2026?' }).getByLabel('Yes <1%, No >99%')).toBeVisible();
  await expect(rows.filter({ hasText: 'Lakers vs. Celtics' }).getByLabel('Lakers 55%, Celtics 45%')).toBeVisible();
  await expect(mirror.getByRole('button', { name: 'Show more' })).toHaveCount(0);
  // Each market carries its own picture from Polymarket, the listed ones on 67 too.
  await expect(senate.locator('.market-thumb img')).toHaveAttribute('src', `${IMAGE_ORIGIN}/11111111.png`);
  const leadPicture = page.locator('.lead .market-thumb img');
  await expect(leadPicture).toHaveAttribute('src', `${IMAGE_ORIGIN}/dcae9573.png`);
  await expect.poll(() => leadPicture.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(chain.gammaRequests.some(r => r.includes('condition_ids=0xdcae9573'))).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
});

test('topics and search narrow the mirror through Polymarket itself', async ({ page }) => {
  const chain = new MockChain();
  await open(page, chain, '/#/markets?topic=Crypto');
  const mirror = catalogue(page);
  await expect(mirror.getByRole('article')).toHaveCount(1, { timeout: 15_000 });
  await expect(mirror.getByRole('heading', { name: 'Will Ethereum reach $5,000 in 2026?' })).toBeVisible();
  expect(chain.gammaRequests.some(r => r.includes('tag_id=21'))).toBe(true);
  await page.getByRole('searchbox', { name: 'Search questions' }).fill('lakers');
  await expect(mirror.getByRole('heading', { name: /Matching on Polymarket/ })).toBeVisible();
  await expect(mirror.getByRole('article')).toHaveCount(1);
  await expect(mirror.getByRole('heading', { name: 'Lakers vs. Celtics' })).toBeVisible();
  expect(chain.gammaRequests.some(r => r.startsWith('/public-search?q=lakers'))).toBe(true);
  // Nothing on 67 matches, so the 67 part says so in one line.
  await expect(page.getByRole('heading', { name: 'Nothing on 67 matches yet' })).toBeVisible();
});

test('a market not on 67 opens read-only, and a listed one goes to its trading page', async ({ page }) => {
  const chain = new MockChain();
  await open(page, chain);
  await catalogue(page).getByRole('link', { name: 'Will the Democrats win the Senate in 2026?' }).click({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Will the Democrats win the Senate in 2026?', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Not on 67 yet' })).toBeVisible();
  await expect(page.getByText('48%')).toBeVisible();
  await expect(page.locator('.market-title .market-thumb img')).toHaveAttribute('src', `${IMAGE_ORIGIN}/11111111.png`);
  await expect(page.locator('.polymarket-prices figure.chart')).toBeVisible();
  await expect(page.getByText(/^Yes price on Polymarket over the last month\./)).toBeVisible();
  await expect(page.getByRole('link', { name: 'See it on Polymarket' })).toHaveAttribute('href', 'https://polymarket.com/event/will-the-democrats-win-the-senate-in-2026');
  await expect(page.getByRole('button', { name: /Buy|Review trade/ })).toHaveCount(0);
  await expect(page).toHaveTitle('Will the Democrats win the Senate in 2026? | 67');
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await page.goto('/#/polymarket/0xdcae9573d5680a2c958cca4676ed28df7a06861572124f3396cc60ab6b92b9c2');
  await expect(page).toHaveURL(/#\/market\/btc-vs-gold-2026$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Will Bitcoin outperform Gold in 2026?', level: 1 })).toBeVisible();
});

test('when Polymarket cannot be read, the 67 markets stay and the mirror offers a retry', async ({ page }) => {
  const chain = new MockChain();
  chain.gamma = 'down';
  await open(page, chain);
  await expect(page.getByRole('heading', { name: 'Will Bitcoin outperform Gold in 2026?', level: 2 })).toBeVisible({ timeout: 15_000 });
  await expect(catalogue(page).getByText('Polymarket could not be read just now.')).toBeVisible();
  chain.gamma = [];
  await catalogue(page).getByRole('button', { name: 'Try again' }).click();
  await expect(catalogue(page).getByText('Every open market in this topic is already on 67.')).toBeVisible();
});
