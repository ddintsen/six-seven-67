import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createGateway } from './index.mjs';
import { requestJson } from './upstream.mjs';
import { isGnoAddress, NETWORKS, readAccount } from './gno.mjs';
import { inspectMarket, parseBoundResolution, rulesHash } from './polymarket.mjs';

const address = 'g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5';
const conditionId = `0x${'a'.repeat(64)}`;
const question = 'Exact bound question?';
const description = 'Exact immutable resolution rule.';
const binding = { conditionId, outcomes: ['Yes', 'No'], tokenIds: ['123', '456'], rulesHash: rulesHash(question, description) };
function source(closed = false, winner = null) {
  return { condition_id: conditionId, question, description, closed, tokens: [
    { token_id: '123', outcome: 'Yes', winner: winner === 'Yes', price: 1 },
    { token_id: '456', outcome: 'No', winner: winner === 'No', price: 0 },
  ] };
}
function envelope(result) { return { jsonrpc: '2.0', id: '67-read', result }; }
function networkResult() { return envelope({ node_info: { network: 'onyx-1' }, sync_info: { latest_block_height: '123', catching_up: false } }); }
function accountRequest(response) {
  return async (_url, options) => JSON.parse(options.body).method === 'status' ? networkResult() : response;
}
function accountResult(patch = {}, responsePatch = {}) {
  const account = { address, coins: '900719925474099312345ugnot', account_number: '9007199254740993', sequence: '42', ...patch };
  return envelope({ response: { ResponseBase: { Error: null, Data: Buffer.from(JSON.stringify({ BaseAccount: account })).toString('base64'), ...responsePatch } } });
}
async function listen(server, context) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('checksummed Gno addresses reject malformed and tampered input', () => {
  assert.equal(isGnoAddress(address), true);
  assert.equal(isGnoAddress(`${address.slice(0, -1)}q`), false);
  assert.equal(isGnoAddress('http://127.0.0.1'), false);
});

test('rules digest matches the Gno UTF-8 byte-length frame including Unicode', () => {
  assert.equal(rulesHash('é?', '勝'), createHash('sha256').update('3:é?3:勝').digest('hex'));
  assert.notEqual(rulesHash('ab', 'c'), rulesHash('a', 'bc'));
});

test('Gno account preserves integer/coin strings and rejects ABCI and identity errors', async () => {
  const account = await readAccount(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === 'status') return networkResult();
    assert.equal(body.params.path, `auth/accounts/${address}`);
    return accountResult();
  }, NETWORKS.onyx, address);
  assert.equal(account.coins, '900719925474099312345ugnot');
  assert.equal(account.accountNumber, '9007199254740993');
  assert.equal(account.chainId, 'onyx-1');
  await assert.rejects(readAccount(accountRequest(accountResult({}, { Error: { message: 'not found' } })), NETWORKS.onyx, address), { code: 'GNO_QUERY_ERROR' });
  await assert.rejects(readAccount(accountRequest(accountResult({ address: `${address}q` })), NETWORKS.onyx, address), { code: 'ACCOUNT_MISMATCH' });
  await assert.rejects(readAccount(accountRequest(accountResult({ sequence: 42 })), NETWORKS.onyx, address), { code: 'UPSTREAM_SCHEMA' });
});

test('account reads verify the RPC chain before querying account data', async () => {
  let accountQueries = 0;
  const request = async (_url, options) => {
    if (JSON.parse(options.body).method === 'status') return envelope({ node_info: { network: 'wrong' }, sync_info: {} });
    accountQueries++;
    return accountResult();
  };
  await assert.rejects(readAccount(request, NETWORKS.onyx, address), { code: 'CHAIN_MISMATCH' });
  assert.equal(accountQueries, 0);
});

test('a valid address absent from the chain is an explicit not-found result', async () => {
  const response = accountResult({}, { Data: Buffer.from('null').toString('base64') });
  await assert.rejects(readAccount(accountRequest(response), NETWORKS.onyx, address), { code: 'ACCOUNT_NOT_FOUND', status: 404 });
});

test('RPC top-level error and invalid base64 are never successful accounts', async () => {
  await assert.rejects(readAccount(async () => ({ error: { message: 'error' } }), NETWORKS.onyx, address), { code: 'GNO_RPC_ERROR' });
  await assert.rejects(readAccount(accountRequest(accountResult({}, { Data: '$garbage' })), NETWORKS.onyx, address), { code: 'UPSTREAM_SCHEMA' });
});

test('100% price and closed flag do not resolve an awaiting market', () => {
  assert.equal(parseBoundResolution(source(true), binding).state, 'awaiting-outcome');
  assert.equal(parseBoundResolution(source(true), binding).reportedWinner, null);
  assert.equal(inspectMarket(source(), conditionId).state, 'open');
});

test('exact Yes and No winner observations remain advisory with settlement blocked', () => {
  for (const winner of ['Yes', 'No']) {
    const parsed = parseBoundResolution(source(true, winner), binding);
    assert.equal(parsed.reportedWinner, winner);
    assert.equal(parsed.finality, 'not-proven');
    assert.equal(parsed.settlementAllowed, false);
    assert.equal(parsed.trust, 'polymarket-api-advisory');
  }
});

test('source identity, exact rules, outcome order and token order are immutable', () => {
  assert.throws(() => parseBoundResolution({ ...source(), condition_id: `0x${'b'.repeat(64)}` }, binding), { code: 'SOURCE_MISMATCH' });
  assert.throws(() => parseBoundResolution({ ...source(), description: `${description} revised` }, binding), { code: 'BINDING_MISMATCH' });
  assert.throws(() => parseBoundResolution({ ...source(), tokens: source().tokens.toReversed() }, binding), { code: 'BINDING_MISMATCH' });
  assert.throws(() => parseBoundResolution(source(), { ...binding, outcomes: ['Yes', 'Yes'] }), /Invalid immutable/);
});

test('contradictory or malformed winner reports are rejected', () => {
  assert.throws(() => parseBoundResolution(source(false, 'Yes'), binding), { code: 'CONTRADICTORY_SOURCE' });
  const both = source(true, 'Yes'); both.tokens[1].winner = true;
  assert.throws(() => parseBoundResolution(both, binding), { code: 'CONTRADICTORY_SOURCE' });
  const stringWinner = source(true); stringWinner.tokens[0].winner = 'true';
  assert.throws(() => parseBoundResolution(stringWinner, binding), { code: 'UPSTREAM_SCHEMA' });
});

test('HTTP gateway uses only fixed upstreams and rejects arbitrary URL, mutation and unbound resolution', async (context) => {
  const calls = [];
  const base = await listen(createGateway({ bindings: [binding], request: async (url, options) => {
    calls.push(url);
    if (url.startsWith('https://clob.')) return source(true, 'No');
    const method = JSON.parse(options.body).method;
    return method === 'status' ? envelope({ node_info: { network: 'onyx-1' }, sync_info: { latest_block_height: '123', catching_up: false } }) : accountResult();
  } }), context);
  let response = await fetch(`${base}/api/v1/network`);
  assert.equal(response.status, 200); assert.equal((await response.json()).height, '123');
  response = await fetch(`${base}/api/v1/accounts/${address}`);
  assert.equal(response.status, 200); assert.equal((await response.json()).sequence, '42');
  response = await fetch(`${base}/api/v1/resolutions/${conditionId}`);
  assert.equal(response.status, 200); assert.equal((await response.json()).reportedWinner, 'No');
  const safeCalls = calls.length;
  for (const [path, status, options] of [
    ['/api/v1/network?rpc=http://localhost', 400, {}],
    ['/api/v1/accounts/http://localhost', 404, {}],
    ['/api/v1/resolutions/' + `0x${'b'.repeat(64)}`, 409, {}],
    ['/api/v1/network', 405, { method: 'POST' }],
    ['/api/v1/network', 403, { headers: { Origin: 'https://attacker.example' } }],
  ]) assert.equal((await fetch(`${base}${path}`, options)).status, status);
  // Node fetch rewrites Host to match its URL. Use the HTTP transport to actually
  // deliver the hostile Host header rather than assert a request never sent.
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/api/v1/network`, { headers: { Host: 'attacker.example' } }, (response) => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('error', reject); request.end();
  });
  assert.equal(hostileHostStatus, 403);
  assert.equal(calls.length, safeCalls);
  assert.deepEqual([...new Set(calls)], [NETWORKS.onyx.rpcUrl, `https://clob.polymarket.com/markets/${conditionId}`]);
});

test('chain mismatch and upstream outage return explicit unavailable states', async (context) => {
  const mismatch = await listen(createGateway({ request: async () => envelope({ node_info: { network: 'wrong' }, sync_info: {} }) }), context);
  const response = await fetch(`${mismatch}/api/v1/network`);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { status: 'unavailable', error: { code: 'CHAIN_MISMATCH', message: 'RPC reports a different chain than the configured network.' } });
});

test('real HTTP upstream enforces size, timeout, redirects and JSON schema', async (context) => {
  const base = await listen(createServer((request, response) => {
    if (request.url === '/slow') return;
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/valid' }); return response.end(); }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(request.url === '/large' ? JSON.stringify({ value: 'x'.repeat(2048) }) : request.url === '/invalid' ? '{' : '{"ok":true}');
  }), context);
  assert.deepEqual(await requestJson(`${base}/valid`), { ok: true });
  await assert.rejects(requestJson(`${base}/large`, {}, { maxBytes: 1024 }), { code: 'UPSTREAM_TOO_LARGE' });
  await assert.rejects(requestJson(`${base}/slow`, {}, { timeoutMs: 30 }), { code: 'UPSTREAM_TIMEOUT' });
  await assert.rejects(requestJson(`${base}/redirect`), { code: 'UPSTREAM_UNAVAILABLE' });
  await assert.rejects(requestJson(`${base}/invalid`), { code: 'UPSTREAM_SCHEMA' });
});
