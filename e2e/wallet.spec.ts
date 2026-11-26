import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MockChain } from './support/mockChain';

// Every page reads Onyx and Polymarket; keep the suite off the network.
test.beforeEach(async ({ page }) => { await new MockChain().installNetwork(page); });
const address = 'g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5';
async function installProvider(page: Page, behavior = 'success') {
  await page.addInitScript(({ address, behavior }) => {
    const listeners: Record<string, (value: string) => void> = {};
    let chainId = 'onyx-1';
    let declined = behavior === 'declined';
    const result = (data: unknown) => ({ code: 0, type: 'SUCCESS', status: 'success', message: 'Success', data });
    let resolveEstablish: () => void = () => undefined;
    const pending = new Promise(resolve => { resolveEstablish = () => resolve(result(null)); });
    Object.assign(window, { adena: {
      AddEstablish: async () => { if (behavior === 'delayed') return pending; if (declined) { declined = false; return { code: 4000, type: 'CONNECTION_REJECTED', status: 'failure', message: 'Rejected', data: null }; } return behavior === 'already' ? { code: 4001, type: 'ALREADY_CONNECTED', status: 'failure', message: 'Already connected', data: null } : result(null); },
      GetAccount: async () => result({ address, coins: behavior === 'inactive' ? '' : '3618115104ugnot', chainId, accountNumber: behavior === 'inactive' ? '0' : '1', sequence: behavior === 'inactive' ? '0' : '2', status: behavior === 'inactive' ? 'IN_ACTIVE' : 'ACTIVE' }),
      GetNetwork: async () => result({ chainId, networkName: chainId === 'onyx-1' ? 'Onyx' : 'Mainnet', addressPrefix: 'g', rpcUrl: 'https://rpc.onyx.testnets.gno.land', indexerUrl: null }),
      On: (event: string, callback: (value: string) => void) => { listeners[event] = callback; },
    }, resolveEstablish, changeWalletNetwork: () => { chainId = 'gnoland-1'; listeners.changedNetwork?.('gnoland-1'); } });
  }, { address, behavior });
}
test('missing Adena has a useful installation path without a fabricated account', async ({ page }) => {
  await page.goto('/#/markets');
  await page.getByRole('button', { name: 'Connect Adena', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Wallet', exact: true });
  await expect(dialog.getByRole('link', { name: 'Get Adena', exact: true })).toHaveAttribute('href', 'https://www.adena.app/');
  await expect(dialog.getByText('Wallet balance', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Connect Adena', exact: true })).toBeFocused();
});
for (const behavior of ['success', 'already']) {
  test(`${behavior} connection reads the account and its GNOT`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await installProvider(page, behavior);
    await page.goto('/#/market/btc-vs-gold-2026');
    await page.getByRole('banner').getByRole('button', { name: 'Connect Adena', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Wallet', exact: true });
    await dialog.getByRole('button', { name: 'Connect Adena', exact: true }).click();
    await expect(dialog.getByText(address, { exact: true })).toBeVisible();
    await expect(dialog.locator('.adena-balance')).toHaveText('3618.115104 GNOT');
    await expect(dialog.getByRole('button', { name: 'Refresh account', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: 'Disconnect Adena', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Connect Adena', exact: true })).toBeFocused();
    await expect(dialog.locator('.adena-balance')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
test('declined permission can be retried; a network change is shown', async ({ page }) => {
  await installProvider(page, 'declined');
  await page.goto('/#/markets');
  await page.getByRole('banner').getByRole('button', { name: 'Connect Adena', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Wallet', exact: true });
  await dialog.getByRole('button', { name: 'Connect Adena', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('declined');
  await expect(dialog.getByRole('button', { name: 'Retry Adena connection', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Retry Adena connection', exact: true }).click();
  await expect(dialog.locator('.adena-balance')).toHaveText('3618.115104 GNOT');
  await expect(dialog.getByRole('button', { name: 'Refresh account', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Disconnect Adena', exact: true }).focus();
  await page.evaluate(() => (window as unknown as { changeWalletNetwork: () => void }).changeWalletNetwork());
  await expect(dialog.getByRole('definition').filter({ hasText: 'Mainnet (gnoland-1)' })).toHaveText('Mainnet (gnoland-1)');
  await expect(dialog.getByRole('status').filter({ hasText: /^Connected to Mainnet\.$/ })).toHaveText('Connected to Mainnet.');
  await expect(dialog.locator('.adena-network-notice')).toContainText('onyx-1');
  await expect(dialog.getByRole('button', { name: 'Disconnect Adena', exact: true })).toBeFocused();
});
test('an unused Adena account connects with zero GNOT and an activation notice', async ({ page }) => {
  await installProvider(page, 'inactive');
  await page.goto('/#/markets');
  await page.getByRole('banner').getByRole('button', { name: 'Connect Adena', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Wallet', exact: true });
  await dialog.getByRole('button', { name: 'Connect Adena', exact: true }).click();
  await expect(dialog.locator('.adena-balance')).toHaveText('0 GNOT');
  await expect(dialog.getByText(/not been used on this network yet/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Refresh account', exact: true })).toBeFocused();
});
test('closing the wallet during connection preserves focus when the response arrives', async ({ page }) => {
  await installProvider(page, 'delayed');
  await page.goto('/#/markets');
  await page.getByRole('banner').getByRole('button', { name: 'Connect Adena', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Wallet', exact: true });
  await dialog.getByRole('button', { name: 'Connect Adena', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Close wallet', exact: true }).click();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Connect Adena', exact: true })).toBeFocused();
  await page.evaluate(() => (window as unknown as { resolveEstablish: () => void }).resolveEstablish());
  await expect(page.getByRole('banner').getByRole('button', { name: 'Open Adena wallet', exact: true })).toBeFocused();
  await expect(dialog).not.toBeVisible();
});
test('a market page links its source plainly and the ticket shows prices per share', async ({ page }) => {
  await page.goto('/#/market/btc-vs-gold-2026');
  await expect(page.getByRole('radio', { name: 'Yes 0.42', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: /Source market on Polymarket/ })).toHaveAttribute('rel', /noopener/);
  await page.getByRole('link', { name: 'All markets', exact: true }).click();
  await expect(page).toHaveURL(/#\/markets$/);
});
