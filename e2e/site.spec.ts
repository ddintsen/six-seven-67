import { expect, test } from '@playwright/test';
import { MockChain } from './support/mockChain';

// Every page reads Onyx and Polymarket; tests that need a particular chain install their own mock on top.
test.beforeEach(async ({ page }) => { await new MockChain().installNetwork(page); });

test('how it works computes a purchase with the realm’s rounding', async ({ page }) => {
  await page.goto('/#/how');
  await expect(page.getByRole('heading', { level: 1, name: 'A share pays 1 GNOT if it’s right.' })).toBeVisible();
  const bench = page.getByRole('region', { name: 'Work it out' });
  // 10 GNOT at 0.42: floor(10e12 / 420000) micro-shares, cost rounded up to whole ugnot.
  await expect(bench.locator('.result-figure dd')).toHaveText('23.809523Yes');
  await expect(bench.getByRole('definition').filter({ hasText: 'GNOT' }).first()).toHaveText('10.00 GNOT');
  await bench.getByRole('radio', { name: 'No 0.58' }).check();
  await bench.getByLabel('You spend up to').fill('1');
  await expect(bench.locator('.result-figure dd')).toHaveText('1.724137No');
  await expect(bench.getByText('Payout if No wins')).toBeVisible();
  await bench.getByLabel('You spend up to').fill('abc');
  await expect(bench.getByText('Enter an amount above zero, up to six decimals.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'The collateral' })).toBeVisible();
});

test('the contract page states deployment and lists every call with its refusals', async ({ page }) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.goto('/#/contract');
  await expect(page.getByRole('heading', { level: 1, name: 'One realm, every rule.' })).toBeVisible();
  await expect(page.getByText('Deployed, 4 markets')).toBeVisible();
  const buy = page.getByRole('article', { name: 'Buy' });
  await expect(buy.getByRole('list', { name: 'Buy refuses with' }).getByRole('listitem')).toHaveText([
    'trading closed', 'price does not match review', 'send the exact quoted ugnot amount', 'insufficient market collateral',
  ]);
});

test('an undeployed realm is reported on the contract page', async ({ page }) => {
  const chain = new MockChain();
  chain.deployed = false;
  await chain.install(page);
  await page.goto('/#/contract');
  await expect(page.getByText('Not deployed yet')).toBeVisible();
});

test('the phone menu opens as a sheet, navigates and closes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/#/');
  const banner = page.getByRole('banner');
  await expect(banner.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  await banner.getByRole('button', { name: 'Menu', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Menu' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Every trade is a real transaction on Onyx testnet, paid in test GNOT through Adena.')).toBeVisible();
  await sheet.getByRole('link', { name: /How it works/ }).click();
  await expect(page).toHaveURL(/#\/how$/);
  await expect(sheet).toBeHidden();
  await banner.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await context.close();
});

test('desktop header splits the site and the exchange around the mark', async ({ page }) => {
  await page.goto('/#/contract');
  const banner = page.getByRole('banner');
  await expect(banner.getByRole('navigation', { name: 'About 67' }).getByRole('link', { name: 'Contract' })).toHaveAttribute('aria-current', 'page');
  await banner.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Markets' }).click();
  await expect(page).toHaveURL(/#\/markets$/);
  await expect(page.getByRole('searchbox', { name: 'Search questions' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Venue' })).toHaveCount(0); // one venue: the live testnet
});

test('the header stays above the home scene and its links stay clickable', async ({ page }) => {
  await page.goto('/#/');
  const link = page.getByRole('banner').getByRole('navigation', { name: 'About 67' }).getByRole('link', { name: 'How it works' });
  const box = await link.boundingBox();
  if (!box) throw new Error('no header link');
  const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.textContent, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(top).toBe('How it works');
  await link.click();
  await expect(page).toHaveURL(/#\/how$/);
});

test('who does what reads the operator and oracle from the realm', async ({ page }) => {
  const chain = new MockChain();
  chain.market('fed-hike-2026').finalized = true;
  chain.market('fed-hike-2026').winner = 'No';
  await chain.install(page);
  await page.goto('/#/');
  const section = page.getByRole('region', { name: 'Who does what' });
  await expect(section.getByRole('img', { name: /Polymarket feeds the operator/ })).toBeVisible();
  await expect(section.getByText(/g1z86x…uw9q, last quote/)).toBeVisible({ timeout: 15000 });
  await expect(section.getByText('g1jg8m…sqf5, 1 of 4 final')).toBeVisible({ timeout: 15000 });
});

test('who does what says plainly when the realm is not live', async ({ page }) => {
  const chain = new MockChain();
  chain.deployed = false;
  await chain.install(page);
  await page.goto('/#/');
  await expect(page.getByRole('region', { name: 'Who does what' }).getByText('The operator and the oracle start with the realm on Onyx testnet.')).toBeVisible();
});

test('story pictures are decorative, build once on scroll and stay still under reduced motion', async ({ browser }) => {
  const moving = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await moving.newPage();
  await page.goto('/#/how');
  const scenes = page.locator('svg.scene');
  await expect(scenes).toHaveCount(8);
  for (const scene of await scenes.all()) await expect(scene).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('svg.scene.is-armed')).not.toHaveCount(0);
  for (let y = 0; y <= 6000; y += 450) {
    await page.evaluate(top => window.scrollTo(0, top), y);
    await page.waitForTimeout(60);
  }
  await expect(page.locator('svg.scene.is-armed')).toHaveCount(0);
  await moving.close();

  const still = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const phone = await still.newPage();
  await phone.goto('/#/how');
  await expect(phone.locator('svg.scene')).toHaveCount(8);
  await expect(phone.locator('svg.scene.is-rest')).toHaveCount(8);
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await still.close();
});

test('the first screen holds the headline and Open markets on phones and tablets', async ({ browser }) => {
  test.setTimeout(90_000);
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 900, height: 1000 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto('/#/');
    const action = page.getByRole('link', { name: 'Open markets' }).first();
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(viewport.height - 16);
    await context.close();
  }
});

test('decorative motion is finite: one pass per visit, done within five seconds', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Read the animation each element is given, so the check does not depend
  // on how fast this machine plays it.
  const timings = (selector: string) => page.evaluate(sel => [...document.querySelectorAll(sel)].map(el => {
    const cs = getComputedStyle(el);
    const secs = (value: string) => value.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? 0.001 : 1));
    const names = cs.animationName.split(',').map(name => name.trim());
    const delays = secs(cs.animationDelay);
    const durations = secs(cs.animationDuration);
    const counts = cs.animationIterationCount.split(',').map(count => count.trim());
    return names.map((name, i) => ({ name, count: counts[i % counts.length], end: delays[i % delays.length] + durations[i % durations.length] * Number(counts[i % counts.length]) }));
  }).flat(), selector);

  await page.goto('/#/how');
  await expect(page.locator('.doc-hero-aside svg.scene')).toHaveClass(/is-live/, { timeout: 15000 });
  const signals = (await timings('.doc-hero-aside .scene-ray .block')).filter(t => t.name === 'signal');
  expect(signals.length).toBeGreaterThan(0);
  for (const t of signals) { expect(t.count).toBe('1'); expect(t.end).toBeLessThanOrEqual(5); }

  await page.goto('/#/');
  const parties = page.locator('.parties');
  await expect(async () => {
    await parties.scrollIntoViewIfNeeded();
    await expect(parties).toHaveClass(/is-live/, { timeout: 1000 });
  }).toPass({ timeout: 30000 });
  const flows = await timings('.parties .pulse');
  expect(flows.length).toBe(6);
  for (const t of flows) { expect(t.name).toBe('flow'); expect(t.count).toBe('1'); expect(t.end).toBeLessThanOrEqual(5); }
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter(a => a.playState === 'running' && (a as CSSAnimation).animationName === 'flow').length), { timeout: 15000 }).toBe(0);
});

test('empty and waiting states show one picture, one heading and one action, without dead controls', async ({ page }) => {
  const chain = new MockChain();
  chain.deployed = false;
  await chain.install(page);
  await page.goto('/#/markets');
  const state = page.locator('.empty-state');
  await expect(state.getByRole('heading', { name: 'The 67 contract is not on Onyx testnet yet' })).toBeVisible();
  await expect(state.locator('svg.scene')).toHaveAttribute('aria-hidden', 'true');
  await expect(state.getByRole('link')).toHaveCount(1);
  await expect(state.getByRole('button')).toHaveCount(0);
  // Nothing to search or filter until there are markets.
  await expect(page.getByRole('searchbox', { name: 'Search questions' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Market topics' })).toHaveCount(0);
  await page.goto('/#/market/no-such-question');
  await expect(page.getByRole('heading', { level: 1, name: 'Question not found' })).toBeVisible();
});

test('an unknown address says the page is missing, and shares carry a card', async ({ page }) => {
  await page.goto('/#/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page).toHaveTitle('Page not found | 67');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\.png$/);
  const card = await page.request.get('/og.png');
  expect(card.ok()).toBe(true);
  expect((await card.body()).length).toBeGreaterThan(10_000);
});
