import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADDRESS, connectAdena, MockChain } from './support/mockChain';

const apple = 'Will Apple release a new product line before 2027?';
const ticket = (page: Page) => page.getByRole('complementary', { name: 'Take a position', exact: true });
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });

async function open(page: Page, chain: MockChain, route = '/#/markets') {
  await chain.install(page);
  await page.goto(route);
}

async function reviewNo(page: Page, amount = '1') {
  const panel = ticket(page);
  await panel.getByRole('radio', { name: 'No 0.21', exact: true }).check();
  await panel.getByLabel('Amount', { exact: true }).fill(amount);
  await panel.getByRole('button', { name: 'Review trade', exact: true }).click();
  return dialog(page, 'Review your position');
}

test('an undeployed contract is stated plainly, with one way on', async ({ page }) => {
  const chain = new MockChain();
  chain.deployed = false;
  await open(page, chain);
  await expect(page.getByRole('heading', { name: 'The 67 contract is not on Onyx testnet yet', exact: true })).toBeVisible();
  await expect(page.locator('.empty-state').getByRole('link', { name: 'How it works', exact: true })).toHaveAttribute('href', '#/how');
  await expect(page.getByRole('group', { name: 'Venue', exact: true })).toHaveCount(0);
});

test('testnet markets come from the contract with topics, prices and volume', async ({ page }) => {
  const chain = new MockChain();
  chain.market('fed-hike-2026').volume = 12_400_000n;
  await open(page, chain);
  await expect(page.getByText('4 markets on the 67 contract, priced in test GNOT.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Will Bitcoin outperform Gold in 2026?' })).toBeVisible();
  const fed = page.locator('.row').filter({ hasText: 'Another Fed rate hike in 2026?' });
  await expect(fed.getByText('12.40 GNOT')).toBeVisible();
  await expect(fed.getByRole('link', { name: 'No 0.25', exact: true })).toHaveAttribute('href', '#/market/fed-hike-2026?outcome=No');
  await page.getByRole('navigation', { name: 'Market topics' }).getByRole('button', { name: 'Science', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'SpaceX Starship fully reusable before 2027?' })).toBeVisible();
  await expect(page.locator('.row')).toHaveCount(0);
});

test('a purchase is confirmed only from contract state and then appears in the portfolio', async ({ page }) => {
  const chain = new MockChain();
  await open(page, chain, '/#/market/apple-new-line-2026');
  await expect(ticket(page).getByRole('button', { name: 'Connect Adena', exact: true })).toBeVisible();
  await connectAdena(page);
  await expect(page.getByRole('banner').getByRole('button', { name: '25 GNOT in Adena' })).toBeVisible();
  const review = await reviewNo(page, '0.42');
  await expect(review.getByText('Shares', { exact: true }).locator('..').getByRole('definition')).toHaveText('2.00');
  await expect(review.getByText('You pay', { exact: true }).locator('..').getByRole('definition')).toHaveText('0.42 GNOT');
  await expect(review.getByText('Payout if No wins', { exact: true }).locator('..').getByRole('definition')).toHaveText('2.00 GNOT');
  await review.getByRole('button', { name: 'Confirm in Adena', exact: true }).click();
  const confirmed = dialog(page, 'Position confirmed');
  await expect(confirmed.getByRole('status')).toHaveText('The contract shows your new position.');
  expect(chain.calls).toEqual([{ func: 'Buy', args: ['apple-new-line-2026', 'No', '2000000', '210000'], send: '420000ugnot' }]);
  await confirmed.getByRole('link', { name: 'View portfolio', exact: true }).click();
  const row = page.getByRole('article', { name: apple, exact: true });
  await expect(row.getByText('2.00 No shares', { exact: true })).toBeVisible();
  await expect(page.getByText('Open cost', { exact: true }).locator('..').getByRole('definition')).toHaveText('0.42 GNOT');
  await page.goto('/#/market/apple-new-line-2026');
  await expect(page.getByText('Volume', { exact: true }).locator('..').getByRole('definition')).toHaveText('0.42 GNOT');
});

test('a wallet on another network switches before any review', async ({ page }) => {
  const chain = new MockChain();
  chain.network = 'test5';
  await open(page, chain, '/#/market/apple-new-line-2026');
  await connectAdena(page);
  await expect(page.getByRole('banner').getByRole('button', { name: 'Adena is on test5. Open wallet', exact: true })).toBeVisible();
  await expect(ticket(page).getByRole('button', { name: 'Review trade', exact: true })).toHaveCount(0);
  await ticket(page).getByRole('button', { name: 'Switch to Onyx testnet', exact: true }).click();
  await expect(ticket(page).getByRole('button', { name: 'Review trade', exact: true })).toBeVisible();
  expect(chain.calls).toEqual([]);
});

test('rejection, contract refusals and a quote change never create a position', async ({ page }) => {
  const chain = new MockChain();
  await open(page, chain, '/#/market/apple-new-line-2026');
  await connectAdena(page);

  chain.doContract = 'reject';
  let review = await reviewNo(page);
  await review.getByRole('button', { name: 'Confirm in Adena', exact: true }).click();
  await expect(dialog(page, 'Transaction rejected').getByRole('status')).toHaveText('You rejected the transaction in Adena. Nothing was sent.');
  await dialog(page, 'Transaction rejected').getByRole('button', { name: 'Return to trade', exact: true }).click();
  await expect(ticket(page).getByRole('button', { name: 'Review trade', exact: true })).toBeFocused();

  chain.doContract = { fail: 'panic: insufficient market collateral' };
  review = await reviewNo(page);
  await review.getByRole('button', { name: 'Confirm in Adena', exact: true }).click();
  await expect(dialog(page, 'Review required again').getByRole('status')).toHaveText('The market cannot cover that many shares right now. Try a smaller amount.');
  await dialog(page, 'Review required again').getByRole('button', { name: 'Return to trade', exact: true }).click();

  chain.doContract = 'execute';
  review = await reviewNo(page);
  chain.requote('apple-new-line-2026', 800_000);
  await review.getByRole('button', { name: 'Confirm in Adena', exact: true }).click();
  await expect(dialog(page, 'Review required again').getByRole('status')).toHaveText('The quote changed since your review. Review the new price before trying again.');
  expect(chain.calls.filter(call => call.func === 'Buy')).toHaveLength(2);
  expect(chain.positions.get(ADDRESS)?.get('apple-new-line-2026')?.spent ?? 0n).toBe(0n);
  await dialog(page, 'Review required again').getByRole('button', { name: 'Return to trade', exact: true }).click();
  await expect(ticket(page).getByRole('radio', { name: 'No 0.20', exact: true })).toBeChecked();
});

test('a broadcast that never lands ends as an unknown result with a reconcile path', async ({ page }) => {
  const chain = new MockChain();
  await page.clock.install();
  await open(page, chain, '/#/market/apple-new-line-2026');
  await connectAdena(page);
  chain.doContract = 'broadcast-only';
  const review = await reviewNo(page);
  await review.getByRole('button', { name: 'Confirm in Adena', exact: true }).click();
  await expect(dialog(page, 'Review your position').getByRole('status')).toHaveText('Sent. Waiting for the contract to show your position.');
  await page.clock.runFor(50_000);
  const unknown = dialog(page, 'Result not confirmed yet');
  await expect(unknown.getByRole('status')).toHaveText('The contract does not show this purchase yet. It may still be pending, or it may not have been included.');
  // The transaction lands late: checking again confirms it from contract state.
  chain.execute(ADDRESS, 'Buy', ['apple-new-line-2026', 'No', '4761904', '210000'], '1000000ugnot');
  await unknown.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(dialog(page, 'Position confirmed').getByRole('status')).toHaveText('The contract shows your new position.');
});

test('a finalized winning position is claimed once and the payout is recorded', async ({ page }) => {
  const chain = new MockChain();
  chain.execute(ADDRESS, 'Buy', ['fed-hike-2026', 'Yes', '2000000', '750000'], '1500000ugnot');
  chain.execute(ADDRESS, 'Buy', ['btc-vs-gold-2026', 'Yes', '1000000', '420000'], '420000ugnot');
  chain.finalize('fed-hike-2026', 'Yes');
  chain.finalize('btc-vs-gold-2026', 'No');
  await open(page, chain, '/#/portfolio');
  await expect(page.getByRole('heading', { name: 'Connect Adena to see your positions', exact: true })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Connect Adena', exact: true }).click();
  const wallet = dialog(page, 'Wallet');
  await wallet.getByRole('button', { name: 'Connect Adena', exact: true }).click();
  await wallet.getByRole('button', { name: 'Close wallet', exact: true }).click();
  const fed = page.getByRole('article', { name: 'Another Fed rate hike in 2026?', exact: true });
  await expect(page.getByText('Ready to claim', { exact: true }).locator('..').getByRole('definition')).toHaveText('2.00 GNOT');
  await expect(page.getByRole('article', { name: 'Will Bitcoin outperform Gold in 2026?', exact: true }).getByText('No payout', { exact: true })).toBeVisible();
  await fed.getByRole('button', { name: 'Claim 2.00 GNOT', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Claimed 2.00 GNOT from “Another Fed rate hike in 2026?”.' })).toBeVisible();
  await expect(fed.getByText('2.00 GNOT claimed')).toBeVisible();
  expect(chain.calls).toEqual([{ func: 'Claim', args: ['fed-hike-2026'], send: '' }]);
  await expect(page.getByText('Claimed', { exact: true }).locator('..').getByRole('definition')).toHaveText('2.00 GNOT');
});

test('on a phone the trade bar selects an outcome and hands over to the ticket', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const chain = new MockChain();
  await open(page, chain, '/#/market/btc-vs-gold-2026');
  const bar = page.locator('.trade-bar');
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Buy No 0.58', exact: true }).click();
  await expect(ticket(page).getByRole('radio', { name: 'No 0.58', exact: true })).toBeChecked();
  await expect(ticket(page).getByLabel('Amount', { exact: true })).toBeFocused();
  await expect(bar).toHaveClass(/is-hidden/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('the landing weighs the live Yes price and switches questions', async ({ page }) => {
  const chain = new MockChain();
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type()) && !/GL Driver Message/.test(message.text())) problems.push(message.text()); });
  await open(page, chain, '/');
  await expect(page.getByRole('heading', { level: 1, name: 'Six. Seven. Take a side.' })).toBeVisible();
  const caption = page.locator('.scale-caption');
  await expect(caption.getByRole('link', { name: 'Will Bitcoin outperform Gold in 2026?' })).toBeVisible();
  await expect(caption).toContainText('42% Yes at 0.42');
  await expect(page.locator('.scale-stage')).toHaveClass(/is-ready|is-flat/);
  await page.getByRole('group', { name: 'Weigh another question' }).getByRole('button', { name: 'Fed hike', exact: true }).click();
  await expect(caption).toContainText('75% Yes at 0.75');
  await expect(caption).toContainText('25% No at 0.25');
  await expect(page.getByRole('heading', { name: 'Four calls settle a market' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'The four calls' }).locator('code')).toHaveText(['CreateMarket', 'Buy', 'FinalizeByOracle', 'Claim']);
  await page.getByRole('link', { name: 'Open markets', exact: true }).click();
  await expect(page).toHaveURL(/#\/markets$/);
  expect(problems).toEqual([]);
});

test('the landing keeps the price readable without WebGL and on a phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const chain = new MockChain();
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await open(page, chain, '/');
  await expect(page.locator('.scale-stage')).toHaveClass(/is-flat/);
  await expect(page.locator('.scale-stage')).toBeVisible();
  expect(await page.locator('.scale-stage').evaluate(node => getComputedStyle(node).backgroundImage)).toContain('forest-night');
  await expect(page.locator('.scale-caption')).toContainText('42% Yes at 0.42');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await context.close();
});
