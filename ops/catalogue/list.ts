// node --experimental-strip-types ops/catalogue/list.ts --profile testnet --oracle g1… --reserve 6000000 [--dry]
//
// Lists the markets in ops/catalogue/candidates.json on the markets realm
// through gnomcp (GNOMCP=path), skipping any ID the realm already has. Each
// market is created with the given oracle and funded with --reserve ugnot.
// Before each listing the midpoint is read again, so the opening price is
// current. On success the market is appended to ops/markets.seed.json,
// server/bindings.json and src/live/catalog.json.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchMarkets } from '../../src/live/gno.ts';
import { fetchClob } from '../../src/live/polymarket.ts';
import type { Candidate } from './select.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const PROFILE = option('--profile', 'testnet');
const RPC = option('--rpc', 'https://rpc.onyx.testnets.gno.land');
const REALM = option('--realm', 'gno.land/r/nym-sixseven067/markets');
const ORACLE = option('--oracle', '');
const RESERVE = Number(option('--reserve', '6000000'));
const DRY = args.includes('--dry');
const LIMIT = Number(option('--limit', '1000'));
if (!/^g1[0-9a-z]{38}$/.test(ORACLE)) throw new Error('--oracle g1… is required');

const { candidates } = JSON.parse(readFileSync('ops/catalogue/candidates.json', 'utf8')) as { candidates: Candidate[] };
const onChain = new Set((await fetchMarkets(RPC, REALM)).map(m => m.id));
const todo = candidates.filter(c => !onChain.has(c.id)).slice(0, LIMIT);
console.log(`${candidates.length} candidates, ${onChain.size} markets on chain, ${todo.length} to list${DRY ? ' (dry run)' : ''}`);

const child = spawn(process.env.GNOMCP || '/home/claude/gnomcp-build/bin/gnomcp', [], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = ''; const waiting = new Map<number, (m: any) => void>(); let nextId = 0;
child.stdout.on('data', d => { buffer += d; let i; while ((i = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); if (waiting.has(m.id)) { waiting.get(m.id)!(m); waiting.delete(m.id); } } });
const rpc = (method: string, params: unknown) => new Promise<any>(resolve => { const n = ++nextId; waiting.set(n, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'list-markets', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const call = async (func: string, callArgs: string[], send?: string) => {
  const r = await rpc('tools/call', { name: 'gno_call', arguments: { profile: PROFILE, realm: REALM, func, args: callArgs, ...(send ? { send } : {}) } });
  const text: string = r.result?.content?.[0]?.text ?? JSON.stringify(r.error);
  if (r.result?.isError || !/Call succeeded/.test(text)) throw new Error(`${func} failed: ${text.slice(0, 400)}`);
  return r.result.structuredContent as { tx_hash: string; gas_used: number; height: number };
};

const seed = JSON.parse(readFileSync('ops/markets.seed.json', 'utf8')) as Record<string, unknown>[];
const bindings = JSON.parse(readFileSync('server/bindings.json', 'utf8')) as Record<string, unknown>[];
const catalog = JSON.parse(readFileSync('src/live/catalog.json', 'utf8')) as Record<string, { category: string; conditionId: string; eventSlug: string }>;
const save = () => {
  writeFileSync('ops/markets.seed.json', JSON.stringify(seed, null, 2) + '\n');
  writeFileSync('server/bindings.json', JSON.stringify(bindings, null, 2) + '\n');
  writeFileSync('src/live/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
};

let listed = 0;
for (const c of todo) {
  // Realm v1 lists only Yes and No; named outcomes (a match) wait for realm v2.
  if (c.outcomes[0] !== 'Yes' || c.outcomes[1] !== 'No') { console.log(`skip ${c.id}: named outcomes need realm v2`); continue; }
  const clob = await fetchClob(c.conditionId, c.tokenIds[0]);
  if (clob.closed || clob.rulesHash !== c.rulesHash || clob.midYesPpm == null) { console.log(`skip ${c.id}: the source changed`); continue; }
  const price = Math.min(990000, Math.max(10000, Math.round(clob.midYesPpm / 1000) * 1000));
  if (c.closesAt < Date.now() / 1000 + 86400) { console.log(`skip ${c.id}: closes too soon`); continue; }
  if (DRY) { console.log(`would list ${c.id} at ${price / 1e6}, closing ${c.closesAtUtc}`); continue; }
  const created = await call('CreateMarket', [c.id, c.question, c.rules, c.conditionId, c.tokenIds[0], c.tokenIds[1], String(c.closesAt), String(price), ORACLE]);
  const funded = await call('Fund', [c.id], `${RESERVE}ugnot`);
  seed.push({ ...c, openingYesPricePpm: price, listedAt: new Date().toISOString(), listing: { createTx: created.tx_hash, fundTx: funded.tx_hash, reserveUgnot: RESERVE } });
  bindings.push({ conditionId: c.conditionId, outcomes: c.outcomes, tokenIds: c.tokenIds, rulesHash: c.rulesHash, gnoChainId: 'onyx-1', gnoRealm: REALM, gnoMarketId: c.id, oracleAddress: ORACLE });
  catalog[c.id] = { category: c.category, conditionId: c.conditionId, eventSlug: c.source.eventSlug };
  save();
  listed++;
  console.log(`listed ${c.id} at ${price / 1e6} (create gas ${created.gas_used}, height ${created.height})`);
}
child.kill();
console.log(`listed ${listed}`);
