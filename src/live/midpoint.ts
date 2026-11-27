// Polymarket's current midpoint for one outcome token, read while a market's
// price is on screen, so the page can say how 67's quote compares with it.
// Read-only and untrusted: it never sets a price, it only explains one.
import { useEffect, useSyncExternalStore } from 'react';
import { CLOB_ORIGIN, parseMidpoint } from './polymarket';

const FRESH_MS = 60_000;
interface Entry { ppm: number | null; at: number; loading: boolean }
const known = new Map<string, Entry>();
let version = 0;
const listeners = new Set<() => void>();
const publish = () => { version += 1; listeners.forEach(listener => listener()); };

async function load(token: string) {
  const entry = known.get(token);
  if (entry && (entry.loading || Date.now() - entry.at < FRESH_MS / 2)) return; // another price on screen read it just now
  known.set(token, { ppm: entry?.ppm ?? null, at: entry?.at ?? 0, loading: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let ppm: number | null = null;
  try {
    const response = await fetch(`${CLOB_ORIGIN}/midpoint?token_id=${encodeURIComponent(token)}`, { signal: controller.signal });
    if (response.ok) {
      const text = await response.text();
      if (text.length < 4096) ppm = parseMidpoint(JSON.parse(text));
    }
  } catch { /* no midpoint: the page says only when 67's price was set */ } finally {
    clearTimeout(timer);
  }
  known.set(token, { ppm, at: Date.now(), loading: false });
  publish();
}

// The last observed midpoint in millionths and its fetch time. Re-read every
// minute while the price stays on screen.
export function usePolymarketMidpoint(token: string | null | undefined) {
  useEffect(() => {
    if (!token || !/^\d{1,100}$/.test(token)) return;
    void load(token);
    const timer = setInterval(() => void load(token), FRESH_MS);
    return () => clearInterval(timer);
  }, [token]);
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version, () => version);
  const entry = token ? known.get(token) : undefined;
  return entry?.ppm == null ? null : { ppm: entry.ppm, observedAt: Math.floor(entry.at / 1000) };
}
