// node --experimental-strip-types ops/robot/operator.ts [--dry] [--list 6] [--all]
// Runs the robot once by hand with the operator key, which gnomcp holds (the
// key never leaves gnomcp's keystore). The administrator may quote and list, so
// this is the fallback while the robot has no GNOT, and the way to list a batch
// at once. GNOMCP points at the gnomcp binary.
import { spawn } from 'node:child_process';
import { runRobot, type Signer } from './robot.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback = '') => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const RPC = option('--rpc', 'https://rpc.onyx.testnets.gno.land');
const REALM = option('--realm', 'gno.land/r/nym-sixseven067/markets/v2');
const PROFILE = option('--profile', 'testnet');

const child = spawn(process.env.GNOMCP || '/home/claude/gnomcp-build/bin/gnomcp', [], { stdio: ['pipe', 'pipe', 'ignore'] });
let buffer = ''; const waiting = new Map<number, (m: any) => void>(); let id = 0;
child.stdout.on('data', d => { buffer += d; let i; while ((i = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); if (!line.trim()) continue; const msg = JSON.parse(line); if (msg.id != null && waiting.has(msg.id)) { waiting.get(msg.id)!(msg); waiting.delete(msg.id); } } });
const rpcCall = (method: string, params: unknown) => new Promise<any>(r => { const n = ++id; waiting.set(n, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
await rpcCall('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: '67-operator', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const tool = async (name: string, a: Record<string, unknown>) => {
  const res = await rpcCall('tools/call', { name, arguments: { profile: PROFILE, ...a } });
  const text = (res.result?.content ?? []).map((c: { text?: string }) => c.text ?? '').join('\n');
  if (res.error || res.result?.isError) throw new Error((text || JSON.stringify(res.error)).split('\n').slice(0, 3).join(' ').slice(0, 300));
  return { text, structured: res.result?.structuredContent as Record<string, unknown> | undefined };
};
const address = String((await tool('gno_key_address', {})).text.match(/g1[0-9a-z]{38}/)?.[0] ?? '');

async function balance(): Promise<bigint> {
  const response = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'abci_query', params: { path: `bank/balances/${address}`, data: '' } }) });
  const json = await response.json() as { result?: { response?: { ResponseBase?: { Data?: string } } } };
  const match = /"(\d+)ugnot"/.exec(Buffer.from(json.result?.response?.ResponseBase?.Data ?? '', 'base64').toString());
  return match ? BigInt(match[1]) : 0n;
}
const signer: Signer = {
  address, balance,
  call: async (realm, func, callArgs, o = {}) => {
    const { text, structured } = await tool('gno_call', { realm, func, args: callArgs, ...(o.sendUgnot ? { send: `${o.sendUgnot}ugnot` } : {}) });
    return String(structured?.tx_hash ?? text.match(/TxHash:\s+([0-9a-f]+)/)?.[1] ?? '');
  },
};
try {
  const report = await runRobot(signer, {
    rpc: RPC, realm: REALM, v1Realm: 'gno.land/r/nym-sixseven067/markets', dryRun: args.includes('--dry'),
    listPerRun: Number(option('--list', '2')), listKinds: args.includes('--all') ? 'all' : 'games',
    maxCalls: Number(option('--max-calls', '40')), deadlineMs: 600_000, maxOpenListed: Number(option('--max-open', '30')),
    reserveUgnot: BigInt(option('--reserve', '3000000')), minBalanceUgnot: BigInt(option('--min-balance', '20000000')),
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  child.kill();
}
