// Polymarket's public CLOB API, read from the browser or the watcher. Every
// response is untrusted: validated, bounded, and never a settlement by itself
// (the settlement record is Polygon's, see polygon.ts).

export const CLOB_ORIGIN = 'https://clob.polymarket.com';

export interface ClobRead {
  closed: boolean; question: string; rulesHash: string;
  tokens: { tokenId: string; outcome: string; winner: boolean }[];
  midYesPpm: number | null; // midpoint of the Yes token, in millionths; null when closed or unavailable
}

export class SourceError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

// The realm's BindingHash: SHA-256 of `len(q) ":" q len(r) ":" r` over UTF-8 bytes.
export async function bindingHash(question: string, rules: string): Promise<string> {
  const framed = `${utf8Length(question)}:${question}${utf8Length(rules)}:${rules}`;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(framed)));
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) throw new SourceError('SOURCE_HTTP', `Polymarket answered ${response.status}.`);
    const text = await response.text();
    if (text.length > 1_048_576) throw new SourceError('SOURCE_TOO_LARGE', 'Polymarket returned too much data.');
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('SOURCE_UNAVAILABLE', 'Polymarket could not be read.');
  } finally {
    clearTimeout(timer);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// CLOB's `/midpoint` answer (`{"mid":"0.44"}`) in millionths, or null when it
// is missing or outside (0, 1).
export function parseMidpoint(body: unknown): number | null {
  const value = isRecord(body) ? Number(body.mid) : NaN;
  return Number.isFinite(value) && value > 0 && value < 1 ? Math.round(value * 1_000_000) : null;
}

export async function fetchClob(conditionId: string, yesTokenId: string, fetcher: Fetcher = (u, i) => fetch(u, i)): Promise<ClobRead> {
  if (!/^0x[0-9a-f]{64}$/.test(conditionId)) throw new SourceError('INVALID_CONDITION', 'Invalid condition ID.');
  const market = await getJson(fetcher, `${CLOB_ORIGIN}/markets/${conditionId}`);
  if (!isRecord(market) || market.condition_id !== conditionId) throw new SourceError('SOURCE_MISMATCH', 'Polymarket returned another market.');
  if (typeof market.closed !== 'boolean' || typeof market.question !== 'string' || typeof market.description !== 'string' || !Array.isArray(market.tokens) || market.tokens.length !== 2) {
    throw new SourceError('SOURCE_SCHEMA', 'Polymarket returned an unexpected market.');
  }
  if (market.question.length > 2048 || market.description.length > 32768) throw new SourceError('SOURCE_SCHEMA', 'Polymarket returned an unexpected market.');
  const tokens = market.tokens.map(token => {
    if (!isRecord(token) || typeof token.token_id !== 'string' || !/^\d{1,100}$/.test(token.token_id) || typeof token.outcome !== 'string' || !token.outcome || token.outcome.length > 128 || typeof token.winner !== 'boolean') {
      throw new SourceError('SOURCE_SCHEMA', 'Polymarket returned an unexpected outcome.');
    }
    return { tokenId: token.token_id, outcome: token.outcome, winner: token.winner };
  });
  const winners = tokens.filter(t => t.winner).length;
  if (tokens[0].tokenId === tokens[1].tokenId || tokens[0].outcome === tokens[1].outcome || winners > 1 || (!market.closed && winners > 0)) {
    throw new SourceError('SOURCE_CONTRADICTION', 'Polymarket returned contradictory outcomes.');
  }
  let midYesPpm: number | null = null;
  if (!market.closed) {
    try {
      midYesPpm = parseMidpoint(await getJson(fetcher, `${CLOB_ORIGIN}/midpoint?token_id=${encodeURIComponent(yesTokenId)}`));
    } catch { /* a missing midpoint only means no quote suggestion */ }
  }
  return { closed: market.closed, question: market.question, rulesHash: await bindingHash(market.question, market.description), tokens, midYesPpm };
}
