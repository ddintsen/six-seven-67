// Full-stack check against a local gnoland node running the 67 realm. Run with
// GNO_LOCAL_RPC, GNO_LOCAL_REALM and GNOMCP set; skipped otherwise. The Adena
// stand-in forwards each DoContract message to gnomcp, which signs with the
// dev chain's test1 key and broadcasts it for real.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GnoMcp } from './support/gnomcp';

// Prices come from the seed the local chain was listed with, so the test follows a refreshed seed.
const seed = JSON.parse(readFileSync(new URL('../ops/markets.seed.json', import.meta.url), 'utf8')) as { id: string; openingYesPricePpm: number }[];
const apple = seed.find(m => m.id === 'apple-new-line-2026')!;
const noPpm = 1_000_000 - apple.openingYesPricePpm;
const text = (ppm: number) => { const v = ppm / 1_000_000; for (const d of [2, 3, 4, 5, 6]) if (Math.abs(Number(v.toFixed(d)) - v) < 1e-9) return v.toFixed(d); return v.toFixed(6); };

const rpc = process.env.GNO_LOCAL_RPC;
const realm = process.env.GNO_LOCAL_REALM;
const binary = process.env.GNOMCP;
const TEST1 = 'g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5';
test.skip(!rpc || !realm || !binary, 'local chain not configured');

async function accountCoins(): Promise<string> {
  const response = await fetch(rpc!, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'abci_query', params: { path: `auth/accounts/${TEST1}`, data: '' } }) });
  const json = await response.json() as { result: { response: { ResponseBase: { Data: string } } } };
  const account = JSON.parse(Buffer.from(json.result.response.ResponseBase.Data, 'base64').toString());
  return account.BaseAccount.coins as string;
}

test('buying on the local chain is confirmed from contract state and appears in the portfolio', async ({ page }) => {
  test.setTimeout(120_000);
  const mcp = new GnoMcp(binary!);
  await mcp.init();
  await page.exposeFunction('__accountCoins', accountCoins);
  await page.exposeFunction('__doContract', async (request: { messages: { value: { pkg_path: string; func: string; args: string[]; send: string } }[] }) => {
    const message = request.messages[0].value;
    const result = await mcp.tool('gno_call', { profile: 'local', realm: message.pkg_path, func: message.func, args: message.args, ...(message.send ? { send: message.send } : {}) });
    if (result.isError) return { code: 4001, status: 'failure', type: 'TRANSACTION_FAILED', message: result.text, data: null };
    return { code: 0, status: 'success', type: 'TRANSACTION_SENT', message: 'sent', data: { hash: String(result.data.tx_hash ?? ''), height: String(result.data.height ?? '1') } };
  });
  await page.addInitScript(({ rpc, realm, account }) => {
    localStorage.setItem('67.chain.override', JSON.stringify({ id: 'local', chainId: 'dev', chainName: 'Local chain', rpcUrl: rpc, indexerUrl: null, realm, explorerUrl: null, txExplorerUrl: null, faucetUrl: null }));
    const ok = (type: string, data: unknown) => ({ code: 0, status: 'success', type, message: '', data });
    (window as unknown as { adena: unknown }).adena = {
      AddEstablish: async () => ok('CONNECTION_SUCCESS', {}),
      GetAccount: async () => ok('GET_ACCOUNT', { address: account, coins: await (window as unknown as { __accountCoins: () => Promise<string> }).__accountCoins(), chainId: 'dev', accountNumber: '0', sequence: '1', status: 'ACTIVE' }),
      GetNetwork: async () => ok('GET_NETWORK', { chainId: 'dev', networkName: 'Local', addressPrefix: 'g', rpcUrl: rpc, indexerUrl: null }),
      On: () => undefined,
      DoContract: (request: unknown) => (window as unknown as { __doContract: (r: unknown) => Promise<unknown> }).__doContract(request),
    };
  }, { rpc: rpc!, realm: realm!, account: TEST1 });

  try {
    await page.goto('/#/market/apple-new-line-2026?outcome=No');
    await expect(page.getByRole('heading', { level: 1, name: 'Will Apple release a new product line before 2027?' })).toBeVisible();
    const panel = page.getByRole('complementary', { name: 'Take a position' });
    await panel.getByRole('button', { name: 'Connect Adena' }).click();
    const wallet = page.getByRole('dialog', { name: 'Wallet' });
    await wallet.getByRole('button', { name: 'Connect Adena' }).click();
    await expect(wallet.getByText('Connected to Local.')).toBeVisible();
    await wallet.getByRole('button', { name: 'Close wallet' }).click();
    await expect(panel.getByRole('radio', { name: `No ${text(noPpm)}` })).toBeChecked();
    await panel.getByLabel('Amount', { exact: true }).fill(text(2 * noPpm));
    await panel.getByRole('button', { name: 'Review trade' }).click();
    const review = page.getByRole('dialog', { name: 'Review your position' });
    await expect(review.getByText('2.00', { exact: true })).toBeVisible();
    await expect(review.getByText(`${text(2 * noPpm)} GNOT`, { exact: true }).first()).toBeVisible();
    await review.getByRole('button', { name: 'Confirm in Adena' }).click();
    const confirmed = page.getByRole('dialog', { name: 'Position confirmed' });
    await expect(confirmed.getByRole('status')).toHaveText('The contract shows your new position.', { timeout: 60_000 });
    await confirmed.getByRole('link', { name: 'View portfolio' }).click();
    const row = page.getByRole('article', { name: 'Will Apple release a new product line before 2027?' });
    await expect(row).toBeVisible();
    await expect(row.getByText(/No shares/)).toBeVisible();
  } finally {
    mcp.close();
  }
});
