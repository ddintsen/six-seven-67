import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { GatewayError, requestJson } from './upstream.mjs';
import { NETWORKS, readAccount, readNetwork } from './gno.mjs';
import { isConditionId, readPolymarket, validateBinding } from './polymarket.mjs';

export function createGateway({ networkName = 'onyx', bindings = [], request = requestJson } = {}) {
  const network = NETWORKS[networkName];
  if (!network) throw new TypeError('Unsupported Gno network.');
  const sourceBindings = new Map();
  for (const value of bindings) {
    const binding = validateBinding(value);
    if (sourceBindings.has(binding.conditionId)) throw new TypeError('Duplicate condition binding.');
    sourceBindings.set(binding.conditionId, binding);
  }
  let inFlight = 0;
  const server = createServer(async (incoming, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { response.writeHead(status); response.end(JSON.stringify(body)); };
    let counted = false;
    try {
      const host = incoming.headers.host ?? '';
      if (!/^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(host)) throw new GatewayError('INVALID_HOST', 'Only localhost requests are accepted.', 403);
      const origin = incoming.headers.origin;
      if (origin && !/^http:\/\/(?:127\.0\.0\.1|localhost):(?:6767|6768|6757)$/.test(origin)) throw new GatewayError('INVALID_ORIGIN', 'Origin is not allowed.', 403);
      if (incoming.method !== 'GET') throw new GatewayError('READ_ONLY', 'This gateway only accepts GET reads.', 405);
      if ((incoming.url?.length ?? 0) > 512) throw new GatewayError('INVALID_REQUEST', 'Request URL is too long.', 400);
      const url = new URL(incoming.url ?? '/', `http://${host}`);
      if (url.search) throw new GatewayError('INVALID_QUERY', 'Query parameters are not accepted.', 400);
      if (inFlight >= 8) throw new GatewayError('BUSY', 'Gateway is busy. Retry shortly.', 503);
      counted = true;
      inFlight++;
      if (url.pathname === '/api/v1/network') return send(200, await readNetwork(request, network));
      const account = /^\/api\/v1\/accounts\/([^/]+)$/.exec(url.pathname);
      if (account) return send(200, await readAccount(request, network, account[1]));
      const market = /^\/api\/v1\/(polymarket\/markets|resolutions)\/([^/]+)$/.exec(url.pathname);
      if (market) {
        const conditionId = market[2];
        if (!isConditionId(conditionId)) throw new GatewayError('INVALID_CONDITION_ID', 'Invalid condition ID.', 400);
        const binding = sourceBindings.get(conditionId);
        if (market[1] === 'resolutions' && !binding) throw new GatewayError('UNBOUND_MARKET', 'No immutable source binding is registered for this condition.', 409);
        return send(200, await readPolymarket(request, conditionId, market[1] === 'resolutions' ? binding : undefined));
      }
      throw new GatewayError('NOT_FOUND', 'Endpoint not found.', 404);
    } catch (error) {
      const known = error instanceof GatewayError;
      send(known ? error.status : 500, { status: 'unavailable', error: {
        code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Unexpected gateway error.',
      } });
    } finally { if (counted) inFlight--; }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 3000;
  server.maxHeadersCount = 32;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bindings = JSON.parse(await readFile(new URL('./bindings.json', import.meta.url), 'utf8'));
  const server = createGateway({ bindings });
  server.listen(6757, '127.0.0.1', () => console.log('67 read-only gateway: http://127.0.0.1:6757'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
