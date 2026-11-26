// The real interface for the reel's two product shots, at 2x, through
// MockChain (the e2e stand-in for Onyx and Adena): the ticket for Bitcoin vs
// gold with Yes at 0.42 and 5 GNOT (the market's capacity on Yes is 5.79),
// the review and the confirmation; then the position on the portfolio once
// the oracle has recorded Yes, before and after the claim.
// Each element is saved as a PNG with the rectangle of the control the reel
// presses (reel/ui/frames.json, in CSS pixels of the element).
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connectAdena, MockChain } from '../e2e/support/mockChain';

const base = process.env.REEL_SITE || 'http://127.0.0.1:6767/';
const out = 'reel/ui';

test('reel interface frames', async ({ browser }) => {
  test.setTimeout(180_000);
  mkdirSync(out, { recursive: true });
  const frames: Record<string, { width: number; height: number; press?: { x: number; y: number; width: number; height: number } }> = {};
  async function shot(name: string, element: Locator, press?: Locator) {
    await element.evaluate(el => (el as HTMLElement).scrollIntoView({ block: 'center' }));
    await element.page().waitForTimeout(400);
    const box = (await element.boundingBox())!;
    const target = press ? (await press.boundingBox())! : null;
    await element.screenshot({ path: `${out}/${name}.png` });
    frames[name] = {
      width: Math.round(box.width), height: Math.round(box.height),
      ...(target ? { press: { x: Math.round(target.x - box.x), y: Math.round(target.y - box.y), width: Math.round(target.width), height: Math.round(target.height) } } : {}),
    };
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const chain = new MockChain();
  await chain.install(page);
  await page.goto(`${base}#/market/btc-vs-gold-2026`);
  await connectAdena(page);
  const ticket = page.getByRole('complementary', { name: 'Take a position', exact: true });
  await ticket.getByRole('radio', { name: 'Yes 0.42', exact: true }).check();
  await ticket.getByLabel('Amount', { exact: true }).fill('5');
  await page.mouse.click(4, 400);
  const review = ticket.getByRole('button', { name: 'Review trade', exact: true });
  await shot('ticket', ticket, review);
  await review.click();
  const dialog = page.getByRole('dialog', { name: 'Review your position', exact: true });
  const confirm = dialog.getByRole('button', { name: 'Confirm in Adena', exact: true });
  await expect(confirm).toBeVisible();
  await shot('review', dialog, confirm);
  await confirm.click();
  const confirmed = page.getByRole('dialog', { name: 'Position confirmed', exact: true });
  await expect(confirmed.getByRole('status')).toHaveText('The contract shows your new position.');
  await shot('confirmed', confirmed);

  await context.close();

  // The oracle records Yes. The portfolio at phone width, where a position is
  // one compact card: before the claim, then after it with the status line.
  chain.finalize('btc-vs-gold-2026', 'Yes');
  const phone = await browser.newContext({ viewport: { width: 430, height: 1000 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
  const portfolio = await phone.newPage();
  await chain.install(portfolio);
  await portfolio.goto(`${base}#/portfolio`);
  await portfolio.getByRole('main').getByRole('button', { name: 'Connect Adena', exact: true }).click();
  const wallet = portfolio.getByRole('dialog', { name: 'Wallet', exact: true });
  await wallet.getByRole('button', { name: 'Connect Adena', exact: true }).click();
  await wallet.getByRole('button', { name: 'Close wallet', exact: true }).click();
  const position = portfolio.getByRole('article', { name: 'Will Bitcoin outperform Gold in 2026?', exact: true });
  const claim = position.getByRole('button', { name: /^Claim / });
  await expect(claim).toBeVisible({ timeout: 15000 });
  await shot('position', position, claim);
  await claim.click();
  const status = portfolio.getByRole('status').filter({ hasText: /^Claimed / });
  await expect(status).toBeVisible({ timeout: 15000 });
  // Off the card, so it is shot without its hover surface.
  await portfolio.mouse.move(2, 2);
  await shot('claimed', position);
  await shot('claimed-status', status);
  await phone.close();

  writeFileSync(`${out}/frames.json`, `${JSON.stringify(frames, null, 1)}\n`);
});
