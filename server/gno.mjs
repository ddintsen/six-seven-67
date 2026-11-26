import { GatewayError, requireObject, requireString } from './upstream.mjs';

export const NETWORKS = Object.freeze({
  onyx: Object.freeze({ name: 'Onyx testnet', chainId: 'onyx-1', rpcUrl: 'https://rpc.onyx.testnets.gno.land', testnet: true }),
  mainnet: Object.freeze({ name: 'Gno mainnet', chainId: 'gnoland-1', rpcUrl: 'https://rpc.gno.land', testnet: false }),
});

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
export function isGnoAddress(address) {
  if (typeof address !== 'string' || address.length !== 40 || !address.startsWith('g1')) return false;
  const values = [3, 0, 7]; // Bech32 HRP expansion for "g".
  for (const character of address.slice(2)) {
    const value = CHARSET.indexOf(character);
    if (value < 0) return false;
    values.push(value);
  }
  let checksum = 1;
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < 5; index++) if ((top >>> index) & 1) checksum ^= generators[index];
  }
  return checksum === 1;
}

export async function gnoRpc(request, network, method, params = {}) {
  const response = requireObject(await request(network.rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: '67-read', method, params }),
  }), 'RPC response');
  if (response.error != null) throw new GatewayError('GNO_RPC_ERROR', 'Gno RPC rejected the read.');
  if (response.jsonrpc !== '2.0' || response.id !== '67-read') throw new GatewayError('UPSTREAM_SCHEMA', 'Gno RPC envelope does not match the request.');
  return requireObject(response.result, 'RPC result');
}

export async function readNetwork(request, network) {
  const result = await gnoRpc(request, network, 'status');
  const node = requireObject(result.node_info, 'node_info');
  const sync = requireObject(result.sync_info, 'sync_info');
  const chainId = requireString(node.network, 'network', 128);
  if (chainId !== network.chainId) throw new GatewayError('CHAIN_MISMATCH', 'RPC reports a different chain than the configured network.');
  if (typeof sync.latest_block_height !== 'string' || !/^\d+$/.test(sync.latest_block_height) || typeof sync.catching_up !== 'boolean') {
    throw new GatewayError('UPSTREAM_SCHEMA', 'Gno status has invalid synchronization fields.');
  }
  return { status: 'available', ...network, observedChainId: chainId, height: sync.latest_block_height,
    catchingUp: sync.catching_up, observedAt: new Date().toISOString(), trust: 'rpc-observation' };
}

export async function readAccount(request, network, address) {
  if (!isGnoAddress(address)) throw new GatewayError('INVALID_ADDRESS', 'A valid checksummed g1 address is required.', 400);
  const observed = await readNetwork(request, network);
  const result = await gnoRpc(request, network, 'abci_query', { path: `auth/accounts/${address}` });
  const response = requireObject(result.response, 'ABCI response');
  const base = requireObject(response.ResponseBase, 'ResponseBase');
  if (base.Error != null) throw new GatewayError('GNO_QUERY_ERROR', 'Gno application rejected the account query.');
  const encoded = requireString(base.Data, 'ResponseBase.Data', 65536);
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new GatewayError('UPSTREAM_SCHEMA', 'Gno account data is not canonical base64.');
  }
  let decoded;
  try { decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
  catch { throw new GatewayError('UPSTREAM_SCHEMA', 'Gno account data is invalid JSON.'); }
  if (decoded === null) throw new GatewayError('ACCOUNT_NOT_FOUND', 'This address has no active account on the selected chain.', 404);
  const account = requireObject(requireObject(decoded, 'Account record').BaseAccount, 'BaseAccount');
  if (account.address !== address) throw new GatewayError('ACCOUNT_MISMATCH', 'RPC account does not match the requested address.');
  for (const field of ['account_number', 'sequence']) {
    if (typeof account[field] !== 'string' || !/^\d+$/.test(account[field])) throw new GatewayError('UPSTREAM_SCHEMA', `Invalid ${field}.`);
  }
  const coins = requireString(account.coins, 'coins', 8192);
  if (coins !== '' && !/^\d+[a-zA-Z][a-zA-Z0-9/]*(?:,\d+[a-zA-Z][a-zA-Z0-9/]*)*$/.test(coins)) {
    throw new GatewayError('UPSTREAM_SCHEMA', 'Invalid Gno coin string.');
  }
  return { status: 'available', chainId: observed.observedChainId, address, coins,
    accountNumber: account.account_number, sequence: account.sequence, observedAt: new Date().toISOString(), trust: 'rpc-observation' };
}
