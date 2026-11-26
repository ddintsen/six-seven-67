// Network configuration for the on-chain venue. Values are public endpoints;
// no key or secret belongs here. A build can override them with VITE_GNO_*
// variables, and a test can override them at runtime (see readOverride).

export interface ChainConfig {
  id: 'onyx' | 'local';
  chainId: string;
  chainName: string;
  rpcUrl: string;
  indexerUrl: string | null;
  realm: string;
  // Realm v2, read beside v1 once it is deployed; null until then.
  realmV2: string | null;
  explorerUrl: string | null;
  txExplorerUrl: string | null;
  faucetUrl: string | null;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

export const ONYX: ChainConfig = {
  id: 'onyx',
  chainId: env.VITE_GNO_CHAIN_ID || 'onyx-1',
  chainName: 'Onyx testnet',
  rpcUrl: env.VITE_GNO_RPC || 'https://rpc.onyx.testnets.gno.land',
  indexerUrl: env.VITE_GNO_INDEXER || 'https://indexer.onyx.testnets.gno.land/graphql/query',
  realm: env.VITE_GNO_REALM || 'gno.land/r/nym-sixseven067/markets',
  realmV2: env.VITE_GNO_REALM_V2 || null,
  explorerUrl: 'https://onyx.testnets.gno.land',
  txExplorerUrl: 'https://gnoscan.io/transactions/details',
  faucetUrl: 'https://faucet.gno.land',
};

const OVERRIDE_KEY = '67.chain.override';

function isConfig(value: unknown): value is ChainConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (v.id === 'onyx' || v.id === 'local') && typeof v.chainId === 'string' && typeof v.rpcUrl === 'string'
    && typeof v.realm === 'string' && /^gno\.land\/r\/[a-z0-9_/.-]+$/.test(v.realm)
    && (v.realmV2 === undefined || v.realmV2 === null || (typeof v.realmV2 === 'string' && /^gno\.land\/r\/[a-z0-9_/.-]+$/.test(v.realmV2)))
    && /^https?:\/\//.test(v.rpcUrl) && (v.indexerUrl === null || typeof v.indexerUrl === 'string')
    && (v.explorerUrl === null || typeof v.explorerUrl === 'string') && (v.txExplorerUrl === null || typeof v.txExplorerUrl === 'string')
    && (v.faucetUrl === null || typeof v.faucetUrl === 'string');
}

// Runtime override exists for local-chain integration tests. It is honoured only
// on a loopback http origin: file: pages share storage, so a stray local file
// must never be able to redirect transactions to another realm. Read once.
function readOverride(): ChainConfig | null {
  try {
    if (typeof location === 'undefined' || location.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(location.hostname)) return null;
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const chosen = readOverride() ?? ONYX;
export const CHAIN: ChainConfig = { ...chosen, realmV2: chosen.realmV2 ?? null };

// Every realm the app reads, oldest first, with the version of its interface.
export const REALMS: { path: string; version: 1 | 2 }[] = [{ path: CHAIN.realm, version: 1 }, ...(CHAIN.realmV2 ? [{ path: CHAIN.realmV2, version: 2 as const }] : [])];

export function explorerTxUrl(hash: string): string | null {
  if (!CHAIN.txExplorerUrl) return null;
  return `${CHAIN.txExplorerUrl}?txhash=${encodeURIComponent(hash)}&chainId=${encodeURIComponent(CHAIN.chainId)}`;
}

export function explorerRealmUrl(realm: string = CHAIN.realm): string | null {
  if (!CHAIN.explorerUrl) return null;
  return `${CHAIN.explorerUrl}/${realm.replace(/^gno\.land\//, '')}`;
}
