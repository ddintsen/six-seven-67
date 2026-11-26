// Polymarket's own price history for a market's first outcome, read once per
// token for the session and shared by every chart that shows it.
import { useEffect, useSyncExternalStore } from 'react';
import type { PricePoint } from '../view';
import { fetchPriceHistory } from './gamma';

const known = new Map<string, PricePoint[] | 'loading'>();
let version = 0;
const listeners = new Set<() => void>();
const publish = () => { version += 1; listeners.forEach(listener => listener()); };

async function load(token: string) {
  if (known.has(token)) return;
  known.set(token, 'loading');
  try {
    known.set(token, await fetchPriceHistory(token));
  } catch {
    known.delete(token); // tried again on the next visit; the chart stands without it
  }
  publish();
}

// The points, or null while they load or when Polymarket has none.
export function usePolymarketHistory(token: string | null | undefined): PricePoint[] | null {
  useEffect(() => { if (token) void load(token); }, [token]);
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version, () => version);
  const value = token ? known.get(token) : undefined;
  return Array.isArray(value) && value.length > 1 ? value : null;
}
