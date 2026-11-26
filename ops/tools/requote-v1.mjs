// Requotes v1 markets that drifted from the Polymarket midpoint by 2 points or more.
// Usage: node requote.mjs [--live]   (default: simulate only)
import { spawn } from 'node:child_process';
const LIVE = process.argv.includes('--live');
const RPC = 'https://rpc.onyx.testnets.gno.land';
const PKG = 'gno.land/r/nym-sixseven067/markets';
async function q(expr) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'abci_query', params: { path: 'vm/qeval', data: Buffer.from(`${PKG}.${expr}`).toString('base64') } }) });
  const j = await res.json(); const t = Buffer.from(j.result.response.ResponseBase.Data, 'base64').toString();
  const m = /^\("([\s\S]*)" string\)$/.exec(t.trim()); return JSON.parse(JSON.parse('"' + m[1] + '"'));
}
const mid = async token => { const r = await fetch(`https://clob.polymarket.com/midpoint?token_id=${token}`); if (!r.ok) return null; return Number((await r.json()).mid); };
const v = await q('MarketsJSON()'); const list = Array.isArray(v) ? v : v.markets;
const now = Date.now() / 1000;
const todo = [];
for (const m of list) {
  if (m.finalized || m.closesAt <= now + 600) continue;
  const p = await mid(m.yesTokenId); if (p == null || !(p > 0 && p < 1)) continue;
  const ppm = Math.round(p * 1000) * 1000;
  if (Math.abs(ppm - m.yesPricePpm) >= 20000 && ppm > 0 && ppm < 1e6) todo.push({ id: m.id, from: m.yesPricePpm, to: ppm, version: m.quoteVersion });
}
console.log(`${todo.length} to requote (${LIVE ? 'live' : 'simulate'})`);
const child = spawn(process.env.GNOMCP ?? 'gnomcp', [], { stdio: ['pipe', 'pipe', 'ignore'] });
let buffer = ''; const waiting = new Map(); let id = 0;
child.stdout.on('data', d => { buffer += d; let i; while ((i = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); if (!line.trim()) continue; const msg = JSON.parse(line); if (msg.id != null && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } } });
const rpc = (method, params) => new Promise(r => { const n = ++id; waiting.set(n, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'requote', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
for (const t of todo) {
  const res = await rpc('tools/call', { name: 'gno_call', arguments: { profile: 'testnet', simulate: !LIVE, realm: PKG, func: 'SetQuote', args: [t.id, String(t.to), String(t.version)] } });
  const text = (res.result?.content ?? []).map(x => x.text ?? '').join(' ').replace(/\s+/g, ' ');
  console.log(`${t.id}: ${t.from / 1e6} -> ${t.to / 1e6} (v${t.version}) ${res.result?.isError ? 'ERROR ' : 'ok '}${text.slice(0, 160)}`);
}
child.kill();
