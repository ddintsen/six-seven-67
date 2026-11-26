// End-to-end oracle check on a local gnoland node (not part of `npm test`):
//   GNOMCP=/path/to/gnomcp node --experimental-strip-types ops/watcher/lifecycle.local.ts
// Lists two markets bound to Polymarket conditions that are already settled on
// Polygon (one Yes, one No), buys both sides, lets the watcher read Polygon and
// prepare FinalizeByOracle, signs it with the local test1 key (the oracle here),
// claims, and checks the payouts, the evidence hash on chain and the bank.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchMarkets } from '../../src/live/gno.ts';

const RPC = 'http://127.0.0.1:26657';
const REALM = 'gno.land/r/nym-sixseven067/markets';
const TEST1 = 'g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5';
const CASES = [
  { id: 'settled-no', conditionId: '0x27137ae2b75feb4e6e8edd87fd3a11198e77222a7af31637d3869b0f555518a0', expect: 'No' },
  { id: 'settled-yes', conditionId: '0xf9dc196e6271178f055f53f952175fe3589f62b16905c48b166f4bb46555e09f', expect: 'Yes' },
];

const child = spawn(process.env.GNOMCP ?? 'gnomcp', [], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = '';
const waiting = new Map<number, (m: { result?: { isError?: boolean; content?: { text: string }[]; structuredContent?: Record<string, unknown> } }) => void>();
let nextId = 0;
child.stdout.on('data', chunk => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    waiting.get(message.id)?.(message); waiting.delete(message.id);
  }
});
const rpcCall = (method: string, params: unknown) => new Promise<{ result?: { isError?: boolean; content?: { text: string }[]; structuredContent?: Record<string, unknown> } }>(resolve => {
  const id = ++nextId; waiting.set(id, resolve);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
await rpcCall('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'lifecycle', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
async function call(func: string, args: string[], send?: string) {
  const r = await rpcCall('tools/call', { name: 'gno_call', arguments: { profile: 'local', realm: REALM, func, args, ...(send ? { send } : {}) } });
  const text = r.result?.content?.[0]?.text ?? '';
  if (r.result?.isError) throw new Error(`${func} failed: ${text.slice(0, 300)}`);
  return text;
}
const check = (ok: boolean, what: string) => { if (!ok) { console.error('FAIL', what); process.exitCode = 1; } else console.log('ok  ', what); };

const blockTime = async () => {
  const s = await (await fetch(RPC, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'status', params: {} }) })).json() as { result: { sync_info: { latest_block_time: string } } };
  return Math.floor(Date.parse(s.result.sync_info.latest_block_time) / 1000);
};

// 1. List the two markets exactly as Polymarket defines them.
for (const c of CASES) {
  const m = await (await fetch(`https://clob.polymarket.com/markets/${c.conditionId}`)).json() as { question: string; description: string; tokens: { token_id: string; outcome: string }[] };
  const yes = m.tokens.find(t => t.outcome === 'Yes')!.token_id;
  const no = m.tokens.find(t => t.outcome === 'No')!.token_id;
  await call('CreateMarket', [c.id, m.question, m.description, c.conditionId, yes, no, String((await blockTime()) + 3600), '500000', TEST1]);
  await call('Fund', [c.id], '2000000ugnot');
  await call('Buy', [c.id, 'Yes', '1000000', '500000'], '500000ugnot');
  await call('Buy', [c.id, 'No', '3000000', '500000'], '1500000ugnot');
}
console.log('listed, funded and bought both sides of', CASES.map(c => c.id).join(', '));

// 2. The watcher reads Polygon and prepares the oracle call.
const out = mkdtempSync(join(tmpdir(), 'watch-'));
const watch = () => {
  execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'ops/watcher/run.ts', '--rpc', RPC, '--chain', 'dev', '--realm', REALM, '--out', out], { stdio: 'ignore' });
  return JSON.parse(readFileSync(join(out, 'status.json'), 'utf8')) as { markets: { id: string; polygon: { state: string }; actions: { kind: string; args?: string[]; evidenceHash?: string }[]; alerts: { key: string; severity: string }[] }[]; alerts: { key: string }[]; bank?: { balanceUgnot: string; totalEscrowUgnot: string } };
};
const before = watch();
for (const c of CASES) {
  const status = before.markets.find(m => m.id === c.id)!;
  check(status.polygon.state === c.expect, `${c.id}: Polygon reads ${status.polygon.state}, expected ${c.expect}`);
  const finalize = status.actions.find(a => a.kind === 'finalize');
  check(Boolean(finalize?.args && finalize.args[5] === c.expect), `${c.id}: the watcher prepared FinalizeByOracle(${c.expect})`);
  check(status.actions.some(a => a.kind === 'brake'), `${c.id}: the watcher asks for the brake while trading is open`);
  // 3. The oracle signs exactly what the watcher prepared.
  await call('FinalizeByOracle', finalize!.args!);
}

// 4. Claims pay the winning side; the watcher sees a consistent final state.
const markets = await fetchMarkets(RPC, REALM);
for (const c of CASES) {
  const m = markets.find(x => x.id === c.id)!;
  check(m.finalized && m.winner === c.expect, `${c.id}: the realm is final with ${m.winner}`);
  const paid = await call('Claim', [c.id]);
  const expected = c.expect === 'Yes' ? 1_000_000 : 3_000_000;
  check(paid.includes(`${expected}`), `${c.id}: Claim paid ${expected} ugnot`);
}
const after = watch();
for (const c of CASES) {
  const status = after.markets.find(m => m.id === c.id)!;
  const onChain = (await fetchMarkets(RPC, REALM)).find(x => x.id === c.id)!;
  const evidence = before.markets.find(m => m.id === c.id)!.actions.find(a => a.kind === 'finalize')!.evidenceHash;
  check(onChain.evidenceHash === evidence, `${c.id}: the evidence hash on chain is the watcher's`);
  check(status.actions.length === 0 && !status.alerts.some(a => a.severity === 'critical'), `${c.id}: no actions or critical alerts after settlement`);
}
check(Boolean(after.bank && BigInt(after.bank.balanceUgnot) >= BigInt(after.bank.totalEscrowUgnot)), `the realm's bank (${after.bank?.balanceUgnot}) covers its escrow (${after.bank?.totalEscrowUgnot})`);
child.kill();
