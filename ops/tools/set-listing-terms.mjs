// SetListingTerms on realm v2 from the operator (administrator): the robot-oracle becomes the oracle for new listings.
import { spawn } from 'node:child_process';
const LIVE = process.argv.includes('--live');
const ORACLE = 'g10fa3x3ejkj4hadm2clatwpq8vclhk4cfljwh06', TREASURY = 'g1z86xzys5xmsj2etpzmg46q5ymj7rmxkt49uw9q';
const child = spawn(process.env.GNOMCP ?? 'gnomcp', [], { stdio: ['pipe', 'pipe', 'ignore'] });
let buffer = ''; const waiting = new Map(); let id = 0;
child.stdout.on('data', d => { buffer += d; let i; while ((i = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); if (!line.trim()) continue; const msg = JSON.parse(line); if (msg.id != null && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } } });
const rpc = (method, params) => new Promise(r => { const n = ++id; waiting.set(n, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'terms', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const res = await rpc('tools/call', { name: 'gno_call', arguments: { profile: 'testnet', simulate: !LIVE, realm: 'gno.land/r/nym-sixseven067/markets/v2', func: 'SetListingTerms', args: [ORACLE, TREASURY, '40000'] } });
const text = (res.result?.content ?? []).map(x => x.text ?? '').join(' ').replace(/\s+/g, ' ');
console.log(`${LIVE ? 'live' : 'simulate'}: ${res.result?.isError ? 'ERROR ' : 'ok '}${text.replace(/Result: <untrusted.*/, '').slice(0, 300)}`);
child.kill();
