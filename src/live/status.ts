// The status page's data: for every market, what the realm holds, what
// Polymarket's API says and what Polygon has settled, through the same
// decide() the watcher runs. Read-only; refreshed every minute while shown.
import { useEffect, useSyncExternalStore } from 'react';
import { CHAIN, REALMS } from './config';
import { ChainError, fetchAdministrator, fetchRolesV2, fetchStatus, qevalRaw } from './gno';
import type { ChainStatus, RolesV2 } from './gno';
import { fetchAllMarkets } from './store';
import { decide, realmAddress } from './oracle';
import type { MarketStatus } from './oracle';
import { fetchClob } from './polymarket';
import { readAgreedSettlement } from './polygon';

// v1's administrator and its pending successor; v2's roles once v2 is deployed.
export interface Roles { administrator: string; pending: string | null; v2: RolesV2 | null }
// What one realm holds against what its markets owe (escrow, plus fees in v2).
export interface Bank { realm: string; version: 1 | 2; address: string; balanceUgnot: bigint | null; escrowUgnot: bigint }
export type StatusLoad =
  | { status: 'idle' | 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; chain: ChainStatus; markets: MarketStatus[]; oracles: Record<string, string>; roles: Roles; banks: Bank[]; observedAt: number };

let state: StatusLoad = { status: 'idle' };
let refreshing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = (next: StatusLoad) => { state = next; listeners.forEach(listener => listener()); };

async function fetchPending(): Promise<string | null> {
  const raw = await qevalRaw(CHAIN.rpcUrl, CHAIN.realm, 'PendingAdministrator()');
  return raw.match(/g1[0-9a-z]{38}/)?.[0] ?? null;
}

async function fetchBalance(address: string): Promise<bigint | null> {
  try {
    const response = await fetch(CHAIN.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'abci_query', params: { path: `bank/balances/${address}`, data: '' } }) });
    const json = await response.json() as { result?: { response?: { ResponseBase?: { Data?: string | null } } } };
    const data = json.result?.response?.ResponseBase?.Data;
    if (typeof data !== 'string') return null;
    const match = /"?(\d+)ugnot"?/.exec(atob(data));
    return match ? BigInt(match[1]) : 0n;
  } catch {
    return null;
  }
}

export function refreshStatus(): Promise<void> {
  if (refreshing) return refreshing;
  if (state.status !== 'ready') publish({ status: 'loading' });
  refreshing = (async () => {
    try {
      const [chain, markets] = await Promise.all([fetchStatus(CHAIN.rpcUrl), fetchAllMarkets()]);
      const v2 = REALMS.find(r => r.version === 2) ?? null;
      const [administrator, pending, rolesV2] = await Promise.all([fetchAdministrator(CHAIN.rpcUrl, CHAIN.realm), fetchPending().catch(() => null),
        v2 && markets.some(m => m.version === 2) ? fetchRolesV2(CHAIN.rpcUrl, v2.path).catch(() => null) : Promise.resolve(null)]);
      const rows = await Promise.all(markets.map(async m => {
        const [clob, polygon] = await Promise.all([fetchClob(m.conditionId, m.yesTokenId).catch(() => null), readAgreedSettlement(m.conditionId)]);
        return decide(m.realm, m, chain.blockTime, clob, polygon);
      }));
      const banks = await Promise.all(REALMS.filter(r => r.version === 1 || markets.some(m => m.realm === r.path)).map(async (r): Promise<Bank> => {
        const address = await realmAddress(r.path);
        const owed = markets.filter(m => m.realm === r.path).reduce((sum, m) => sum + m.escrowUgnot + m.feesUgnot, 0n);
        return { realm: r.path, version: r.version, address, balanceUgnot: await fetchBalance(address), escrowUgnot: owed };
      }));
      const oracles = Object.fromEntries(markets.map(m => [m.id, m.oracle]));
      publish({ status: 'ready', chain, markets: rows, oracles, roles: { administrator, pending, v2: rolesV2 }, banks, observedAt: Date.now() });
    } catch (error) {
      if (error instanceof ChainError && error.code === 'REALM_NOT_FOUND') publish({ status: 'missing' });
      else if (state.status !== 'ready') publish({ status: 'error', message: error instanceof Error ? error.message : 'The status could not be read.' });
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export const statusSnapshot = (): StatusLoad => state;

export function useStatus(): StatusLoad {
  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshStatus(); }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state, () => state);
}
