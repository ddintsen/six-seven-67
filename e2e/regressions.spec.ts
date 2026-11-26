import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MockChain } from './support/mockChain';
import { MockSources } from './support/mockSources';

// General regressions, ported from the Practice suite to the live venue on the
// testnet mock: filtered URLs survive a round trip, keyboard focus returns to
// the question it left, an interrupted view transition still routes, and the
// catalogue reflows at 320px with doubled text.

const apple = 'Will Apple release a new product line before 2027?';
const fed = 'Another Fed rate hike in 2026?';
const runtimeProblems = new WeakMap<Page, string[]>();
const panel = (page: Page) => page.getByRole('complementary', { name: 'Take a position', exact: true });

test.use({ viewport: { width: 1280, height: 600 }, reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`); });
  // A request the browser itself aborts on navigation is not a failure.
  page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`); });
  page.on('response', response => { if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`); });
  runtimeProblems.set(page, problems);
  const chain = new MockChain();
  await chain.install(page);
  await new MockSources(chain).install(page);
});

test.afterEach(async ({ page }, testInfo) => {
  const problems = runtimeProblems.get(page) ?? [];
  if (problems.length) await testInfo.attach('regression-runtime-problems', { body: problems.join('\n'), contentType: 'text/plain' });
  expect(problems, 'No browser errors, warnings, failed requests or HTTP errors').toEqual([]);
});

test('a No link selects No and the filtered URL survives the return and a reload', async ({ page }) => {
  await page.goto('/#/markets?q=Apple&topic=Technology');
  const catalogueUrl = page.url();
  await page.getByRole('region', { name: apple, exact: true }).getByRole('link', { name: 'No 0.21', exact: true }).click({ timeout: 15_000 });
  await expect(page).toHaveURL(/#\/market\/apple-new-line-2026\?outcome=No$/);
  await expect(panel(page).getByRole('radio', { name: 'No 0.21', exact: true })).toBeChecked();
  await page.getByRole('link', { name: 'All markets', exact: true }).click();
  await expect(page).toHaveURL(catalogueUrl);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search questions', exact: true })).toHaveValue('Apple');
  await expect(page.getByRole('navigation', { name: 'Market topics', exact: true }).getByRole('button', { name: 'Technology', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard return to a lower question restores visible focus inside the viewport', async ({ page }) => {
  await page.goto('/#/markets');
  const question = page.locator('.market-list').getByRole('link', { name: fed, exact: true });
  await expect(question).toBeVisible({ timeout: 15_000 });
  await expect(question).not.toBeInViewport();
  await question.focus();
  await question.press('Enter');
  await expect(page.getByRole('heading', { name: fed, exact: true })).toBeFocused();
  const back = page.getByRole('link', { name: 'All markets', exact: true });
  await back.focus();
  await back.press('Enter');
  await expect(question).toBeFocused();
  await expect(question).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Tab');
  await expect(page.locator('.market-list .row').filter({ hasText: fed }).getByRole('link', { name: 'Yes 0.75', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(question).toBeFocused();
  const indicator = await question.evaluate(element => {
    const style = getComputedStyle(element);
    return { visible: element.matches(':focus-visible'), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(indicator.visible).toBe(true);
  expect(indicator.style).not.toBe('none');
  expect(indicator.width).toBeGreaterThanOrEqual(2);
});

test('an interrupted native view transition updates the route without an unhandled rejection', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/markets');
  await expect(page.getByRole('link', { name: apple, exact: true })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const nativeTransition = document.startViewTransition.bind(document);
    document.startViewTransition = ((update: Parameters<typeof nativeTransition>[0]) => {
      const transition = nativeTransition(update);
      transition.skipTransition();
      return transition;
    }) as typeof document.startViewTransition;
  });
  await page.getByRole('link', { name: apple, exact: true }).click();
  await expect(page.getByRole('heading', { name: apple, exact: true })).toBeFocused();
  await expect(panel(page)).toBeVisible();
  await page.getByRole('link', { name: 'All markets', exact: true }).click();
  await expect(page).toHaveURL(/#\/markets$/);
  await expect(page.getByRole('link', { name: apple, exact: true })).toBeFocused();
});

test('markets reflow at 320px when computed text sizes are doubled', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/#/markets');
  await expect(page.locator('.rows-catalogue .row').first()).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll('body *')].filter((element): element is HTMLElement => element instanceof HTMLElement);
    const sizes = elements.map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize) }));
    sizes.forEach(({ element, size }) => { element.style.fontSize = `${size * 2}px`; });
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
