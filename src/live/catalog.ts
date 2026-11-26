// Presentation metadata for markets the operator created on chain. It never
// overrides chain data: an entry applies only when its condition ID matches the
// market the realm returns, so a mismatched or unknown market shows no topic.
// catalog.json is written by ops/catalogue/list.ts as markets are listed.
import type { Category } from '../domain';
import entries from './catalog.json';

export interface CatalogEntry { category: Exclude<Category, 'All'>; conditionId: string; eventSlug: string }

export const CATALOG = entries as Record<string, CatalogEntry>;

export function catalogFor(id: string, conditionId: string): CatalogEntry | null {
  const entry = CATALOG[id];
  return entry && entry.conditionId === conditionId ? entry : null;
}
