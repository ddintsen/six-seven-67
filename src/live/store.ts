import { useEffect, useSyncExternalStore } from 'react';
import { CHAIN, REALMS } from './config';
import { ChainError, fetchMarkets, fetchPositions, fetchStatus } from './gno';
import type { ChainMarket, ChainPosition, ChainStatus } from './gno';
import { fetchTrades } from './indexer';
import type { TradeEvent } from './indexer';

export type Load<T> =
  | { status: 'idle' }
  | { status: 'loading'; data?: T; observedAt?: number }
  | { status: 'ready'; data: T; observedAt: number }
  | { status: 'error'; code: string; message: string; data?: T; observedAt?: number };

export interface LiveState {
  markets: Load<ChainMarket[]>;
  chain: ChainStatus | null;
  positions: { owner: string; load: Load<ChainPosition[]> } | null;
  trades: Load<TradeEvent[]>;
}

let state: LiveState = { markets: { status: 'idle' }, chain: null, positions: null, trades: { status: 'idle' } };
const listeners = new Set<() => void>();
function publish(next: Partial<LiveState>) { state = { ...state, ...next }; listeners.forEach(listener => listener()); }

function failure<T>(error: unknown, previous: Load<T>): Load<T> {
  const code = error instanceof ChainError ? error.code : 'UNAVAILABLE';
  const message = error instanceof Error ? error.message : 'The network could not be read.';
  // Retain the last good data with its observation time; the UI labels it as retained.
  const data = 'data' in previous ? previous.data : undefined;
  const observedAt = 'observedAt' in previous ? previous.observedAt : undefined;
  return { status: 'error', code, message, data, observedAt };
}

// Markets from every realm. v1 must answer; a v2 realm that is configured but
// not deployed yet adds nothing, and any other v2 failure fails the read.
export async function fetchAllMarkets(signal?: AbortSignal): Promise<ChainMarket[]> {
  const lists = await Promise.all(REALMS.map(r => fetchMarkets(CHAIN.rpcUrl, r.path, signal, r.version).catch(error => {
    if (r.version === 2 && error instanceof ChainError && error.code === 'REALM_NOT_FOUND') return [];
    throw error;
  })));
  return lists.flat();
}
export async function fetchAllPositions(owner: string, signal?: AbortSignal): Promise<ChainPosition[]> {
  const lists = await Promise.all(REALMS.map(r => fetchPositions(CHAIN.rpcUrl, r.path, owner, signal, r.version).catch(error => {
    if (r.version === 2 && error instanceof ChainError && error.code === 'REALM_NOT_FOUND') return [];
    throw error;
  })));
  return lists.flat();
}

let marketsRequest = 0;
export async function refreshMarkets(): Promise<void> {
  const request = ++marketsRequest;
  const previous = state.markets;
  publish({ markets: { status: 'loading', data: 'data' in previous ? previous.data : undefined, observedAt: 'observedAt' in previous ? previous.observedAt : undefined } });
  try {
    const [markets, chain] = await Promise.all([fetchAllMarkets(), fetchStatus(CHAIN.rpcUrl)]);
    if (request !== marketsRequest) return;
    if (chain.chainId !== CHAIN.chainId) throw new ChainError('CHAIN_MISMATCH', `The RPC reports ${chain.chainId}, not ${CHAIN.chainId}.`);
    publish({ markets: { status: 'ready', data: markets, observedAt: Date.now() }, chain });
  } catch (error) {
    if (request !== marketsRequest) return;
    publish({ markets: failure(error, previous) });
  }
}

let positionsRequest = 0;
export async function refreshPositions(owner: string | null): Promise<ChainPosition[] | null> {
  const request = ++positionsRequest;
  if (!owner) { publish({ positions: null }); return null; }
  const previous = state.positions?.owner === owner ? state.positions.load : { status: 'idle' } as Load<ChainPosition[]>;
  publish({ positions: { owner, load: { status: 'loading', data: 'data' in previous ? previous.data : undefined, observedAt: 'observedAt' in previous ? previous.observedAt : undefined } } });
  try {
    const items = await fetchAllPositions(owner);
    if (request !== positionsRequest) return items;
    publish({ positions: { owner, load: { status: 'ready', data: items, observedAt: Date.now() } } });
    return items;
  } catch (error) {
    if (request === positionsRequest) publish({ positions: { owner, load: failure(error, previous) } });
    return null;
  }
}

let tradesRequest = 0;
export async function refreshTrades(): Promise<void> {
  if (!CHAIN.indexerUrl) { publish({ trades: { status: 'error', code: 'NO_INDEXER', message: 'Trade history is not available on this network.' } }); return; }
  const request = ++tradesRequest;
  const previous = state.trades;
  publish({ trades: { status: 'loading', data: 'data' in previous ? previous.data : undefined, observedAt: 'observedAt' in previous ? previous.observedAt : undefined } });
  try {
    const url = CHAIN.indexerUrl;
    const trades = (await Promise.all(REALMS.map(r => fetchTrades(url, r.path)))).flat().sort((a, b) => b.height - a.height);
    if (request !== tradesRequest) return;
    publish({ trades: { status: 'ready', data: trades, observedAt: Date.now() } });
  } catch (error) {
    if (request !== tradesRequest) return;
    publish({ trades: failure(error, previous) });
  }
}

export function getLiveState(): LiveState { return state; }

// Polling runs only while a testnet view is mounted and the page is visible.
let mounted = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let currentOwner: string | null = null;
const POLL_MS = 20_000;
function tick() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  void refreshMarkets();
  if (currentOwner) void refreshPositions(currentOwner);
}
function onVisible() { if (document.visibilityState === 'visible') tick(); }
function mount() {
  if (mounted++ === 0) {
    tick();
    void refreshTrades();
    timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    if (--mounted === 0) {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

export function useLiveState(active: boolean, owner: string | null): LiveState {
  useEffect(() => (active ? mount() : undefined), [active]);
  useEffect(() => {
    if (!active) return;
    if (owner !== currentOwner) {
      currentOwner = owner;
      void refreshPositions(owner);
    }
  }, [active, owner]);
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getLiveState, getLiveState);
}
