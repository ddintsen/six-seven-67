// The keyless watcher: node --experimental-strip-types ops/watcher/run.ts [--out dir]
// Reads the realm, Polymarket's API and Polygon; writes status.json, alerts.json
// and one evidence file per resolved market. It signs nothing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchMarkets, fetchStatus, type ChainMarket } from '../../src/live/gno.ts';
import { fetchClob, type ClobRead } from '../../src/live/polymarket.ts';
import { readAgreedSettlement } from '../../src/live/polygon.ts';
import { canonicalJson, decide, realmAddress, type Alert, type MarketStatus } from '../../src/live/oracle.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : process.env[`WATCH_${name.slice(2).toUpperCase()}`] ?? fallback; };
const RPC = option('--rpc', 'https://rpc.onyx.testnets.gno.land');
const CHAIN_ID = option('--chain', 'onyx-1');
const REALM = option('--realm', 'gno.land/r/nym-sixseven067/markets');
// Realm v2 beside v1, once deployed (--realm-v2 or WATCH_REALM-V2 is not portable, so WATCH_REALM_V2).
const REALM_V2 = args.includes('--realm-v2') ? args[args.indexOf('--realm-v2') + 1] : process.env.WATCH_REALM_V2 ?? '';
const OUT = option('--out', 'watch-out');

async function readClob(m: ChainMarket): Promise<ClobRead | null> {
  try { return await fetchClob(m.conditionId, m.yesTokenId); } catch { return null; }
}

async function bankBalance(address: string): Promise<bigint | null> {
  try {
    const response = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'abci_query', params: { path: `bank/balances/${address}`, data: '' } }) });
    const json = await response.json() as { result?: { response?: { ResponseBase?: { Data?: string } } } };
    const text = Buffer.from(json.result?.response?.ResponseBase?.Data ?? '', 'base64').toString('utf8');
    const match = /"(\d+)ugnot"/.exec(text);
    return match ? BigInt(match[1]) : 0n;
  } catch {
    return null;
  }
}

const now = Math.floor(Date.now() / 1000);
const alerts: Alert[] = [];
const report: Record<string, unknown> = { generatedAt: new Date(now * 1000).toISOString(), chainId: CHAIN_ID, realm: REALM, realmV2: REALM_V2 || null, rpc: RPC };
let markets: MarketStatus[] = [];

try {
  const chain = await fetchStatus(RPC);
  report.chain = chain;
  if (chain.chainId !== CHAIN_ID) alerts.push({ key: 'chain-id', severity: 'critical', title: `The RPC reports ${chain.chainId}, not ${CHAIN_ID}`, body: RPC });
  const banks: Record<string, unknown>[] = [];
  for (const [path, version] of [[REALM, 1], ...(REALM_V2 ? [[REALM_V2, 2]] : [])] as [string, 1 | 2][]) {
    let list: ChainMarket[] = [];
    try {
      list = await fetchMarkets(RPC, path, undefined, version);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (version === 1) report.realmState = code === 'REALM_NOT_FOUND' ? 'not deployed' : 'unreadable';
      if (code !== 'REALM_NOT_FOUND') alerts.push({ key: `realm-unreadable:${path}`, severity: 'action', title: `The markets realm ${path} could not be read`, body: String((error as Error).message) });
    }
    for (const m of list) {
      const [clob, polygon] = await Promise.all([readClob(m), readAgreedSettlement(m.conditionId)]);
      const status = await decide(path, m, chain.blockTime, clob, polygon);
      markets.push(status);
      alerts.push(...status.alerts);
    }
    if (list.length) {
      // What the realm owes: escrow, plus the fees v2 holds until each market is final.
      const address = await realmAddress(path);
      const balance = await bankBalance(address);
      const owed = list.reduce((sum, m) => sum + m.escrowUgnot + m.feesUgnot, 0n);
      banks.push({ realm: path, address, balanceUgnot: balance === null ? null : String(balance), totalEscrowUgnot: String(owed) });
      if (balance !== null && balance < owed) alerts.push({ key: `bank-below-escrow:${path}`, severity: 'critical', title: `${path} holds less than it owes`, body: `Balance ${balance}, owed ${owed} ugnot at ${address}.` });
    }
  }
  report.bank = banks[0] ?? null;
  report.banks = banks;
} catch (error) {
  alerts.push({ key: 'rpc-down', severity: 'action', title: 'The Gno RPC is unreachable', body: `${RPC}: ${(error as Error).message}` });
}

report.markets = markets;
report.alerts = alerts;
mkdirSync(join(OUT, 'evidence'), { recursive: true });
writeFileSync(join(OUT, 'status.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(OUT, 'alerts.json'), JSON.stringify(alerts, null, 2) + '\n');
for (const m of markets) {
  if (m.evidence) writeFileSync(join(OUT, 'evidence', `${m.id}.json`), canonicalJson(m.evidence) + '\n');
}

// A short table for logs and the GitHub job summary.
const ppm = (v: number | null) => v == null ? '–' : (v / 1_000_000).toFixed(3);
const lines = ['| Market | Realm | Our Yes | Polymarket Yes | Polygon | Actions |', '| --- | --- | --- | --- | --- | --- |'];
for (const m of markets) lines.push(`| ${m.id} | ${m.realm.state}${m.realm.winner ? ` (${m.realm.winner})` : ''} | ${ppm(m.realm.yesPricePpm)} | ${ppm(m.polymarket.midYesPpm)} | ${m.polygon.state} | ${m.actions.map(a => a.kind).join(', ') || '–'} |`);
const summary = [`Watcher ${report.generatedAt}: ${String(report.realmState ?? `${markets.length} markets`)}, ${alerts.length} alerts`, '', ...lines, '', ...alerts.map(a => `- ${a.severity}: ${a.title}`)].join('\n');
writeFileSync(join(OUT, 'summary.md'), summary + '\n');
console.log(summary);
