// ProposeAdministrator on realm v1 to the robot, from the operator key through gnomcp.
// Usage: node propose.mjs [--live]
import { spawn } from 'node:child_process';
const LIVE = process.argv.includes('--live');
const ROBOT = 'g13wgyakt05a202ekc09vk8mgdg9g4gdp6upxuna';
const child = spawn(process.env.GNOMCP ?? 'gnomcp', [], { stdio: ['pipe', 'pipe', 'ignore'] });
let buffer = ''; const waiting = new Map(); let id = 0;
child.stdout.on('data', d => { buffer += d; let i; while ((i = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); if (!line.trim()) continue; const msg = JSON.parse(line); if (msg.id != null && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } } });
const rpc = (method, params) => new Promise(r => { const n = ++id; waiting.set(n, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'propose', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const res = await rpc('tools/call', { name: 'gno_call', arguments: { profile: 'testnet', simulate: !LIVE, realm: 'gno.land/r/nym-sixseven067/markets', func: 'ProposeAdministrator', args: [ROBOT] } });
const text = (res.result?.content ?? []).map(x => x.text ?? '').join(' ').replace(/\s+/g, ' ');
console.log(`${LIVE ? 'live' : 'simulate'}: ${res.result?.isError ? 'ERROR ' : 'ok '}${text.replace(/Result: <untrusted.*/, '').slice(0, 300)}`);
child.kill();
