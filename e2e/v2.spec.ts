import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADDRESS, connectAdena, enableV2, MOCK_NOW, MockChain } from './support/mockChain';
import { MockSources } from './support/mockSources';
import { v2Market } from './support/mockV2';

// Realm v2 beside v1: the same interface, with the fee, two-sided prices,
// pause, quote expiry, a proposed outcome and Void.
const senate = 'Will the Democrats win the Senate in 2026?';
const ticket = (page: Page) => page.getByRole('complementary', { name: 'Take a position', exact: true });
const panel = (page: Page) => page.locator('#trade-panel');
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });
const value = (scope: ReturnType<Page['locator']>, label: string) => scope.getByText(label, { exact: true }).locator('..').getByRole('definition');

async function withV2(page: Page, markets: Parameters<typeof v2Market>[] = [['senate-2026', senate, '0x' + '5'.repeat(64), ADDRESS]]) {
  const chain = new MockChain();
  const v2 = await enableV2(page, chain);
  for (const args of markets) v2.markets.push(v2Market(...args));
  await chain.install(page);
  return { chain, v2 };
}

test('a v2 market lists beside v1 and a purchase sends cost plus the fee to realm v2', async ({ page }) => {
  const { chain, v2 } = await withV2(page);
  await page.goto('/#/markets');
  const row = page.getByRole('article').filter({ hasText: senate });
  await expect(row.getByRole('link', { name: 'Yes 0.42', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole('link', { name: 'No 0.60', exact: true })).toBeVisible();
  await expect(page.getByText('5 markets on the 67 contract, priced in test GNOT.')).toBeVisible();

  await page.goto('/#/market/senate-2026');
  await connectAdena(page);
  const form = ticket(page);
  await form.getByLabel('Amount', { exact: true }).fill('1');
  await expect(value(form.locator('dl'), 'Fee')).toHaveText('0.022674 GNOT');
  await expect(value(form.locator('dl'), 'You pay')).toHaveText('1.00 GNOT');
  await expect(form.getByText(/The fee is 0\.04 × shares × price × \(1 − price\)/)).toBeVisible();
  await form.getByRole('button', { name: 'Review trade', exact: true }).click();
  const review = dialog(page, 'Review your position');
  await expect(value(review.locator('dl'), 'Shares')).toHaveText('2.326966');
  await expect(value(review.locator('dl'), 'Shares cost')).toHaveText('0.977326 GNOT');
  await expect(value(review.locator('dl'), 'Service fee')).toHaveText('0.022674 GNOT');
  await expect(value(review.locator('dl'), 'You pay')).toHaveText('1.00 GNOT');
  await expect(value(review.locator('dl'), 'Contract')).toHaveText('gno.land/r/nym-sixseven067/markets/v2');
  const axe = await new AxeBuilder({ page }).include('.review-dialog').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await review.getByRole('button', { name: 'Confirm in Adena', exact: true }).click();
  await expect(dialog(page, 'Position confirmed').getByRole('status')).toHaveText('The contract shows your new position.', { timeout: 20_000 });
  expect(chain.calls).toEqual([{ func: 'Buy', args: ['senate-2026', 'Yes', '2326966', '420000'], send: '1000000ugnot', realm: 'v2' }]);
  expect(v2.position(ADDRESS, 'senate-2026')).toEqual({ yes: 2_326_966n, no: 0n, spent: 977_326n, fee: 22_674n });
});

test('paused, expired, proposed and void markets explain themselves, and a void position is refunded with its fee', async ({ page }) => {
  test.setTimeout(60_000); // seven pages under the full suite's load
  const id = (n: number) => '0x' + String(n).repeat(64);
  const { chain, v2 } = await withV2(page, [
    ['paused-2026', 'Will the pause hold?', id(6), ADDRESS, { state: 'paused' }],
    ['expired-2026', 'Will the quote expire?', id(7), ADDRESS, { quotedAt: MOCK_NOW - 7200 }],
    ['proposed-2026', 'Will a result be proposed?', id(8), ADDRESS, { state: 'proposed', outcome: 'Yes', proposedAt: MOCK_NOW - 3600, evidence: 'e'.repeat(64) }],
    ['void-2026', 'Will it end 50-50?', id(9), ADDRESS, { state: 'final', outcome: 'Void', finalizedAt: MOCK_NOW - 60, cost: 600_000n, feesCollected: 12_000n, fees: 12_000n, escrow: 6_600_000n, yes: 1_000_000n }],
  ]);
  v2.positions.set(ADDRESS, new Map([['void-2026', { yes: 1_000_000n, no: 0n, spent: 600_000n, fee: 12_000n }]]));

  await page.goto('/#/market/paused-2026');
  await expect(panel(page).getByRole('heading', { name: 'Trading paused' })).toBeVisible({ timeout: 15_000 });
  await expect(panel(page).getByText('New purchases are paused. Positions and claims are not affected.')).toBeVisible();
  await page.goto('/#/market/expired-2026');
  await expect(panel(page).getByRole('heading', { name: 'Price expired' })).toBeVisible({ timeout: 15_000 });
  await page.goto('/#/market/proposed-2026');
  await expect(panel(page).getByRole('heading', { name: 'Result proposed' })).toBeVisible({ timeout: 15_000 });
  await expect(panel(page).getByText(/The oracle proposed Yes\. Anyone can make it final from .* unless the guardian cancels it first\./)).toBeVisible();
  await page.goto('/#/market/void-2026');
  await expect(page.getByText('Every holder takes back what they paid, the fee included.').first()).toBeVisible({ timeout: 15_000 });
  await expect(panel(page).getByRole('link', { name: 'Take your refund in Portfolio' })).toHaveAttribute('href', '#/portfolio');

  await page.goto('/#/markets');
  await expect(page.getByRole('article').filter({ hasText: 'Will the pause hold?' }).getByText('Paused', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('article').filter({ hasText: 'Will a result be proposed?' }).getByText('Yes proposed', { exact: true })).toBeVisible();

  await connectAdena(page);
  await page.goto('/#/portfolio');
  await page.getByRole('button', { name: 'Take refund 0.61 GNOT', exact: true }).click({ timeout: 15_000 });
  // v2 removes a claimed position, so its row (and the row's own status line) goes
  // away once positions refresh; the page-level notice stays.
  await expect(page.locator('.inline-notice.success')).toContainText('Claimed 0.612 GNOT from “Will it end 50-50?”.', { timeout: 20_000 });
  // Someone who just claimed their last position is not a first visitor.
  await expect(page.getByRole('heading', { name: 'Nothing open right now' })).toBeVisible();
  await expect(page.getByText('Your first question is waiting')).toHaveCount(0);
  expect(chain.calls).toEqual([{ func: 'Claim', args: ['void-2026'], send: '', realm: 'v2' }]);
  expect(v2.position(ADDRESS, 'void-2026')).toBeUndefined();
  expect(v2.market('void-2026').fees).toBe(0n);
});

test('the status page proposes v2 results, makes them final after the window and quotes both sides', async ({ page }) => {
  test.setTimeout(60_000);
  const id = (n: number) => '0x' + String(n).repeat(64);
  const chain = new MockChain();
  const v2 = await enableV2(page, chain);
  v2.quoter = ADDRESS;
  v2.markets.push(
    v2Market('settled-2026', 'Was it settled Yes?', id(1), ADDRESS),
    v2Market('fifty-2026', 'Was it 50-50?', id(2), ADDRESS),
    v2Market('waited-2026', 'Has the window passed?', id(3), ADDRESS, { state: 'proposed', outcome: 'No', proposedAt: MOCK_NOW - 2 * 86_400, evidence: 'e'.repeat(64) }),
    v2Market('drift-2026', 'Did the price move?', id(4), ADDRESS),
  );
  const sources = new MockSources(chain);
  sources.settle('settled-2026', 'Yes');
  sources.void('fifty-2026');
  sources.set('drift-2026', { mid: 0.45 });
  await chain.install(page);
  await sources.install(page);
  await page.goto('/#/status');
  await expect(page.getByRole('heading', { name: 'Markets', level: 2 })).toBeVisible({ timeout: 20_000 });
  await connectAdena(page);

  await page.getByRole('button', { name: 'Propose Yes in Adena', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Yes is proposed for “Was it settled Yes?”.' })).toBeVisible({ timeout: 20_000 });
  const propose = chain.calls.find(c => c.func === 'ProposeOutcome')!;
  expect(propose.realm).toBe('v2');
  expect(propose.args.slice(0, 2)).toEqual(['settled-2026', id(1)]);
  expect(propose.args[5]).toBe('Yes');
  expect(v2.market('settled-2026').state).toBe('proposed');

  await expect(page.getByText('Settled 50-50 on Polygon, so the market is void and every holder is refunded.')).toBeVisible();
  await page.getByRole('button', { name: 'Propose Void in Adena', exact: true }).click();
  await expect.poll(() => v2.market('fifty-2026').outcome, { timeout: 20_000 }).toBe('Void');

  await expect(page.getByRole('heading', { name: 'Ready to make final', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Make it final in Adena', exact: true }).click();
  await expect.poll(() => v2.market('waited-2026').state, { timeout: 20_000 }).toBe('final');
  expect(chain.calls.find(c => c.func === 'Finalize')).toEqual({ func: 'Finalize', args: ['waited-2026'], send: '', realm: 'v2' });

  await page.getByRole('button', { name: 'Update 1 price in Adena', exact: true }).click();
  await expect(page.getByText('The new price is live.')).toBeVisible({ timeout: 20_000 });
  expect(chain.calls.find(c => c.func === 'SetQuote')).toEqual({ func: 'SetQuote', args: ['drift-2026', '450000', '550000', '1'], send: '', realm: 'v2' });
  expect(v2.market('drift-2026').noPricePpm).toBe(550_000);
});

test('a match market names its teams everywhere and still trades and settles Yes and No by token', async ({ page }) => {
  test.setTimeout(60_000);
  const match = 'Lakers vs. Celtics';
  const chain = new MockChain();
  const v2 = await enableV2(page, chain);
  v2.quoter = ADDRESS;
  v2.markets.push(v2Market('lakers-celtics', match, '0x' + '6'.repeat(64), ADDRESS, { yesLabel: 'Lakers', noLabel: 'Celtics', topic: 'Sports', yesPricePpm: 550_000, noPricePpm: 470_000 }));
  const sources = new MockSources(chain);
  sources.settle('lakers-celtics', 'Yes');
  await chain.install(page);
  await sources.install(page);

  await page.goto('/#/markets?topic=Sports');
  const row = page.getByRole('article').filter({ hasText: match }).or(page.locator('.lead').filter({ hasText: match }));
  await expect(row.getByRole('link', { name: 'Lakers 0.55', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole('link', { name: 'Celtics 0.47', exact: true })).toBeVisible();

  await page.goto('/#/market/lakers-celtics?outcome=No');
  await connectAdena(page);
  const form = ticket(page);
  await expect(form.getByRole('radio', { name: 'Celtics 0.47', exact: true })).toBeChecked({ timeout: 15_000 });
  await form.getByRole('radio', { name: 'Lakers 0.55', exact: true }).check();
  await expect(form.getByText('If Lakers wins', { exact: true })).toBeVisible();
  await form.getByLabel('Amount', { exact: true }).fill('1');
  await form.getByRole('button', { name: 'Review trade', exact: true }).click();
  const review = dialog(page, 'Review your position');
  await expect(value(review.locator('dl'), 'Outcome')).toHaveText('Lakers');
  await review.getByRole('button', { name: 'Confirm in Adena', exact: true }).click();
  await expect(dialog(page, 'Position confirmed').getByRole('status')).toHaveText('The contract shows your new position.', { timeout: 20_000 });
  expect(chain.calls[0].func).toBe('Buy');
  expect(chain.calls[0].args[1]).toBe('Yes');
  await page.keyboard.press('Escape');

  await page.goto('/#/status');
  await page.getByRole('button', { name: 'Propose Lakers (Yes) in Adena', exact: true }).click({ timeout: 20_000 });
  await expect.poll(() => v2.market('lakers-celtics').state, { timeout: 20_000 }).toBe('proposed');
  expect(v2.market('lakers-celtics').outcome).toBe('Yes');
  await page.goto('/#/market/lakers-celtics');
  await expect(panel(page).getByText(/The oracle proposed Lakers\./)).toBeVisible({ timeout: 15_000 });
});
