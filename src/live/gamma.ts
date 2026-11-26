// Polymarket's public Gamma API: the catalogue 67 mirrors. It is read straight
// from the browser (Gamma allows any origin) so new Polymarket markets appear
// without anything on our side. Every response is untrusted: validated,
// bounded, and only ever shown, never used to settle or to price a trade.
import type { Category } from '../domain';

export const GAMMA_ORIGIN = 'https://gamma-api.polymarket.com';
export const POLYMARKET_SITE = 'https://polymarket.com';

// Polymarket's own tag for each 67 topic.
export const TOPIC_TAGS: Record<Exclude<Category, 'All'>, number> = {
  Politics: 2, World: 100265, Economy: 100328, Crypto: 21, Technology: 1401, Science: 74, Culture: 596, Sports: 1,
};

export interface CatalogueMarket {
  conditionId: string;
  question: string;
  eventSlug: string;
  eventTitle: string;
  outcomes: string[];
  prices: (number | null)[]; // 0..1 per outcome, as Polymarket last showed it
  endsAt: number | null; // unix seconds
  volume: number; // USD on Polymarket
  volume24h: number;
  rules: string;
  yesTokenId: string | null;
  binary: boolean; // outcomes are exactly Yes and No, the shape realm v1 lists; v2 also names two teams
  image: string | null; // Polymarket's picture for the market, from its own image host
}

export class CatalogueError extends Error {}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const MAX_BYTES = 3_000_000;

async function getJson(fetcher: Fetcher, url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) throw new CatalogueError(`Polymarket answered ${response.status}.`);
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new CatalogueError('Polymarket returned too much data.');
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof CatalogueError) throw error;
    throw new CatalogueError('Polymarket could not be read.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

// Polymarket serves market pictures from its own upload bucket; nothing else is shown.
const IMAGE_HOST = /^https:\/\/polymarket-upload\.s3\.us-east-2\.amazonaws\.com\/[^\s"'<>]{1,400}$/;
function imageOf(...values: unknown[]): string | null {
  for (const v of values) if (typeof v === 'string' && IMAGE_HOST.test(v)) return v;
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);
const number = (v: unknown) => { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : 0; };
function stringList(v: unknown, max: number): string[] | null {
  let value = v;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  if (!Array.isArray(value) || value.length === 0 || value.length > max || !value.every(item => typeof item === 'string' && item.length <= 200)) return null;
  return value as string[];
}

// One Gamma market, or null when it is not a well-formed, open market.
export function parseCatalogueMarket(value: unknown, event?: { slug: string; title: string }): CatalogueMarket | null {
  if (!isRecord(value)) return null;
  const conditionId = text(value.conditionId, 66);
  const question = text(value.question, 1024);
  if (!conditionId || !/^0x[0-9a-f]{64}$/.test(conditionId) || !question) return null;
  if (value.closed === true || value.active === false || value.archived === true || value.acceptingOrders === false) return null;
  const outcomes = stringList(value.outcomes, 16);
  if (!outcomes) return null;
  const rawPrices = stringList(value.outcomePrices, 16);
  const prices = outcomes.map((_, i) => { const p = rawPrices ? Number(rawPrices[i]) : NaN; return Number.isFinite(p) && p >= 0 && p <= 1 ? p : null; });
  const events = Array.isArray(value.events) ? value.events : [];
  const first = isRecord(events[0]) ? events[0] : null;
  const eventSlug = event?.slug ?? text(first?.slug, 200) ?? text(value.slug, 200) ?? '';
  const eventTitle = event?.title ?? text(first?.title, 400) ?? question;
  const end = typeof value.endDate === 'string' ? Date.parse(value.endDate) : NaN;
  // Past its end date a market only waits for its result; the mirror shows open questions.
  if (Number.isFinite(end) && end < Date.now()) return null;
  const tokens = stringList(value.clobTokenIds, 16);
  return {
    conditionId, question, eventSlug, eventTitle, outcomes, prices,
    endsAt: Number.isFinite(end) ? Math.floor(end / 1000) : null,
    volume: number(value.volumeNum ?? value.volume), volume24h: number(value.volume24hr),
    rules: text(value.description, 32768) ?? '',
    yesTokenId: tokens && /^\d{1,100}$/.test(tokens[0]) ? tokens[0] : null,
    binary: outcomes.length === 2 && outcomes[0] === 'Yes' && outcomes[1] === 'No',
    image: imageOf(value.icon, value.image, first?.icon, first?.image),
  };
}

// A page of open markets, most traded in the last day first, optionally in one topic.
export async function fetchCatalogue(options: { topic?: Category; offset?: number; limit?: number; signal?: AbortSignal; fetcher?: Fetcher } = {}): Promise<CatalogueMarket[]> {
  const { topic = 'All', offset = 0, limit = 50, signal, fetcher = (u, i) => fetch(u, i) } = options;
  const search = new URLSearchParams({ active: 'true', closed: 'false', archived: 'false', limit: String(Math.min(100, limit)), offset: String(Math.max(0, offset)), order: 'volume24hr', ascending: 'false' });
  if (topic !== 'All') { search.set('tag_id', String(TOPIC_TAGS[topic])); search.set('related_tags', 'true'); }
  const data = await getJson(fetcher, `${GAMMA_ORIGIN}/markets?${search}`, signal);
  if (!Array.isArray(data)) throw new CatalogueError('Polymarket returned an unexpected list.');
  return data.map(item => parseCatalogueMarket(item)).filter((m): m is CatalogueMarket => m !== null);
}

// Polymarket's own search, flattened from events to their open markets.
export async function searchCatalogue(query: string, options: { signal?: AbortSignal; fetcher?: Fetcher } = {}): Promise<CatalogueMarket[]> {
  const { signal, fetcher = (u, i) => fetch(u, i) } = options;
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const search = new URLSearchParams({ q, limit_per_type: '20', events_status: 'active', search_tags: 'false', search_profiles: 'false' });
  const data = await getJson(fetcher, `${GAMMA_ORIGIN}/public-search?${search}`, signal);
  const events = isRecord(data) && Array.isArray(data.events) ? data.events : [];
  const out: CatalogueMarket[] = [];
  for (const event of events) {
    if (!isRecord(event) || !Array.isArray(event.markets)) continue;
    const meta = { slug: text(event.slug, 200) ?? '', title: text(event.title, 400) ?? '' };
    for (const market of event.markets) {
      const parsed = parseCatalogueMarket(market, meta);
      if (parsed) out.push(parsed);
    }
  }
  return out.sort((a, b) => b.volume24h - a.volume24h);
}

// One market by its condition ID, for the page of a market 67 has not listed.
export async function fetchCatalogueMarket(conditionId: string, options: { signal?: AbortSignal; fetcher?: Fetcher } = {}): Promise<CatalogueMarket | null> {
  if (!/^0x[0-9a-f]{64}$/.test(conditionId)) return null;
  const { signal, fetcher = (u, i) => fetch(u, i) } = options;
  const data = await getJson(fetcher, `${GAMMA_ORIGIN}/markets?condition_ids=${conditionId}`, signal);
  if (!Array.isArray(data)) throw new CatalogueError('Polymarket returned an unexpected list.');
  return data.map(item => parseCatalogueMarket(item)).find(m => m?.conditionId === conditionId) ?? null;
}

// Pictures for markets by condition ID, closed or open, in batches Polymarket accepts.
export async function fetchImages(conditionIds: string[], options: { signal?: AbortSignal; fetcher?: Fetcher } = {}): Promise<Map<string, string>> {
  const { signal, fetcher = (u, i) => fetch(u, i) } = options;
  const ids = [...new Set(conditionIds.filter(id => /^0x[0-9a-f]{64}$/.test(id)))];
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const query = batch.map(id => `condition_ids=${id}`).join('&');
    const data = await getJson(fetcher, `${GAMMA_ORIGIN}/markets?${query}&limit=${batch.length}`, signal);
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      if (!isRecord(item) || typeof item.conditionId !== 'string') continue;
      const events = Array.isArray(item.events) ? item.events : [];
      const first = isRecord(events[0]) ? events[0] : null;
      const image = imageOf(item.icon, item.image, first?.icon, first?.image);
      if (image) out.set(item.conditionId, image);
    }
  }
  return out;
}

// Polymarket's own price history for one outcome token, from its CLOB.
export async function fetchPriceHistory(tokenId: string, options: { signal?: AbortSignal; fetcher?: Fetcher; interval?: '1w' | '1m' | 'max' } = {}): Promise<{ at: number; yes: number }[]> {
  if (!/^\d{1,100}$/.test(tokenId)) return [];
  const { signal, fetcher = (u, i) => fetch(u, i), interval = '1m' } = options;
  const data = await getJson(fetcher, `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=${interval}&fidelity=${interval === '1w' ? 60 : 720}`, signal);
  const history = isRecord(data) && Array.isArray(data.history) ? data.history : [];
  return history.flatMap(point => {
    if (!isRecord(point)) return [];
    const at = Number(point.t), yes = Number(point.p);
    return Number.isFinite(at) && Number.isFinite(yes) && yes >= 0 && yes <= 1 ? [{ at, yes }] : [];
  }).slice(-400);
}

export const polymarketEventUrl = (eventSlug: string) => `${POLYMARKET_SITE}/event/${encodeURIComponent(eventSlug)}`;

// Polymarket's prices read as chances: 62%, under 1%, over 99%.
export function formatChance(price: number | null): string {
  if (price == null) return '–';
  if (price < 0.005) return '<1%';
  if (price > 0.995) return '>99%';
  return `${Math.round(price * 100)}%`;
}

// Compact USD volume: $12.3M, $840K, $95.
export function formatUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return `$${Math.round(value)}`;
}
