import { createGateway } from './index.mjs';
import { once } from 'node:events';

// Explicitly invoked read-only smoke; it is not part of the controlled test suite.
const server = createGateway();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const results = [];
try {
  for (const path of [
    '/api/v1/network',
    '/api/v1/accounts/g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5',
    '/api/v1/polymarket/markets/0xa467b14d51f01b957109d9cbb1d6c124fab2a089d52ed8f471d23c2812e743b7',
  ]) {
    const response = await fetch(`${base}${path}`);
    results.push({ path, httpStatus: response.status, body: await response.json() });
  }
  console.log(JSON.stringify({ observedAt: new Date().toISOString(), mode: 'live-read-only', results }, null, 2));
  // An unfunded public documentation address may legitimately have no account.
  if (results.some((result) => result.httpStatus !== 200 && !(result.path.startsWith('/api/v1/accounts/') && result.httpStatus === 404 && result.body.error?.code === 'ACCOUNT_NOT_FOUND'))) process.exitCode = 1;
} finally { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); }
