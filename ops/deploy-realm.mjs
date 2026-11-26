// node ops/deploy-realm.mjs <profile> <deployPath> <dir>: deploy a realm through gnomcp (GNOMCP=path/to/gnomcp).
// Sends gnomod.toml and every .gno file except tests; prints gnomcp's result.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const [profile, deployPath, dir, withTests] = process.argv.slice(2);
const files = readdirSync(dir).filter(f => (f.endsWith('.gno') && (withTests || !f.endsWith('_test.gno'))) || f === 'gnomod.toml')
  .map(name => ({ name, body: readFileSync(join(dir, name), 'utf8') }));
const child = spawn(process.env.GNOMCP || 'gnomcp', [], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = ''; const waiting = new Map(); let id = 0;
child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const msg = JSON.parse(line); if (msg.id != null && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } } });
const call = (method, params) => new Promise(r => { const n = ++id; waiting.set(n, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-cli', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
console.log('files:', files.map(f => f.name).join(', '));
const res = await call('tools/call', { name: 'gno_addpkg', arguments: { profile, deploy_path: deployPath, files } });
console.log(JSON.stringify(res.result ?? res.error, null, 1).slice(0, 4000));
child.kill();
