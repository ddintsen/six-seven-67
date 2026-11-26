// Pictures for the markets listed on 67, from Polymarket, by condition ID.
// One shared cache for the session: each picture is looked up once.
import { useEffect, useSyncExternalStore } from 'react';
import { fetchImages } from './gamma';

const known = new Map<string, string | null>();
let version = 0;
const listeners = new Set<() => void>();
const publish = () => { version += 1; listeners.forEach(listener => listener()); };

async function load(ids: string[]) {
  const missing = ids.filter(id => !known.has(id));
  if (missing.length === 0) return;
  missing.forEach(id => known.set(id, null)); // asked once, even if Polymarket has none
  try {
    const found = await fetchImages(missing);
    found.forEach((image, id) => known.set(id, image));
    if (found.size) publish();
  } catch { /* pictures are optional; the questions stand on their own */ }
}

export function useMarketImages(conditionIds: string[]): (conditionId: string) => string | null {
  const key = conditionIds.join(',');
  useEffect(() => { void load(conditionIds); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version, () => version);
  return conditionId => known.get(conditionId) ?? null;
}
