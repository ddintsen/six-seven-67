// node --experimental-strip-types ops/catalogue/select.ts [--count 40] [--out ops/catalogue/candidates.json]
//
// Picks Polymarket markets for 67 to list: binary Yes/No with an order book
// (with --named, also two named outcomes such as two teams, for realm v2),
// clear rules, an end date in the coming year, and a settlement record that
// Polygon can show. Reads Polymarket's public Gamma API for discovery, then
// checks every pick against the CLOB API and two Polygon RPCs with the same
// code the watcher and the status page use. Writes candidates; listing is a
// separate step (ops/catalogue/list.ts).
import { writeFileSync, readFileSync } from 'node:fs';
import { bindingHash, fetchClob } from '../../src/live/polymarket.ts';
import { readAgreedSettlement } from '../../src/live/polygon.ts';
import { closing as closingAt, idFrom, outcomesOf as outcomesFor, SENSITIVE, topicOf, type GammaEvent, type GammaMarket, type Topic } from '../../src/live/listing.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const COUNT = Number(option('--count', '40'));
const OUT = option('--out', 'ops/catalogue/candidates.json');
const SEED = 'ops/markets.seed.json';
// --pool checks everything that passes, without topic quotas, for a person to choose from.
const POOL = args.includes('--pool');
// --named also takes markets whose two outcomes are named (a match: "Lakers", "Celtics"). Only realm v2 lists them.
const NAMED = args.includes('--named');
// --picks <file> lists exactly the chosen markets ({ match: condition-ID prefix or question, topic }), in that order.
type PickSpec = { match: string; topic: Topic; id?: string; closesAtUtc?: string; closesAtReason?: string };
const PICKS = args.includes('--picks') ? (JSON.parse(readFileSync(option('--picks', ''), 'utf8')) as { picks: PickSpec[] }).picks : null;
const now = Math.floor(Date.now() / 1000);
const DAY = 86400;
const closing = (m: GammaMarket) => closingAt(m, now);
const outcomesOf = (m: GammaMarket) => outcomesFor(m, NAMED);

export type { Topic };

// How many of each topic, in the order the list fills. Totals COUNT at 40.
const QUOTA: Record<Topic, number> = { Politics: 7, World: 4, Economy: 6, Crypto: 6, Technology: 5, Science: 3, Culture: 4, Sports: 5 };

export interface Candidate {
  id: string; category: Topic; question: string; rules: string; conditionId: string; outcomes: [string, string]; tokenIds: [string, string];
  rulesHash: string; closesAt: number; closesAtUtc: string; closesAtReason: string; openingYesPricePpm: number;
  source: { venue: 'Polymarket'; eventSlug: string; marketSlug: string; api: string; negRisk: boolean };
  stats: { volume: number; volume24hr: number; liquidity: number; endDate: string };
}

async function json<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (response.ok) return await response.json() as T;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`could not read ${url}`);
}

const seed = JSON.parse(readFileSync(SEED, 'utf8')) as { id: string; conditionId: string }[];
const listed = new Set(seed.map(s => s.conditionId));
const taken = new Set(seed.map(s => s.id));

const events: GammaEvent[] = [];
for (let offset = 0; offset < 1000; offset += 100) {
  const page = await json<GammaEvent[]>(`https://gamma-api.polymarket.com/events?active=true&closed=false&archived=false&limit=100&offset=${offset}&order=volume24hr&ascending=false`);
  events.push(...page);
  if (page.length < 100) break;
}
console.log(`events read: ${events.length}`);

// First pass on Gamma data alone: shape, size, dates, prices and topics.
type Pick = { m: GammaMarket; e: GammaEvent; topic: Topic; close: { at: number; reason: string }; mid: number; id?: string | undefined };
const pool: Pick[] = [];
for (const e of events) {
  const topic = topicOf(e);
  if (!topic) continue;
  const inEvent = (e.markets ?? [])
    .filter(m => m.active && !m.closed && m.enableOrderBook !== false && m.acceptingOrders !== false)
    .filter(m => outcomesOf(m) !== null)
    .filter(m => /^0x[0-9a-f]{64}$/.test(m.conditionId) && !listed.has(m.conditionId))
    .filter(m => m.question.length <= 300 && (m.question.trim().endsWith('?') || outcomesOf(m)![0] !== 'Yes') && m.description.length >= 80 && m.description.length <= 8000)
    .filter(m => !/\b(and|&) (the )?(democrats|republicans|gop)\b/i.test(m.question)) // combinations of two events
    .filter(m => !SENSITIVE.test(m.question) && !SENSITIVE.test(e.title))
    .filter(m => (m.liquidityNum ?? 0) >= 5000 && (m.volumeNum ?? 0) >= 50000)
    .map(m => ({ m, close: closing(m), mid: m.bestBid && m.bestAsk ? (m.bestBid + m.bestAsk) / 2 : (m.lastTradePrice ?? 0) }))
    .filter(x => x.close && x.mid >= 0.1 && x.mid <= 0.9)
    .filter(x => !(e.tags ?? []).some(t => /^hit price$/i.test(t.label)) || x.close!.at > now + 30 * DAY)
    // In a many-outcome event, the outcomes nearest a coin flip are the interesting ones.
    .sort((a, b) => Math.abs(a.mid - 0.5) - Math.abs(b.mid - 0.5))
    .slice(0, 1);
  for (const x of inEvent) pool.push({ m: x.m, e, topic, close: x.close!, mid: x.mid });
}
console.log(`pool after Gamma checks: ${pool.length}`);

// Second pass: verify each pick against the CLOB API and Polygon, filling each topic's quota in volume order.
pool.sort((a, b) => (b.m.volumeNum ?? 0) - (a.m.volumeNum ?? 0));
const seen = new Set<string>();
let unique = pool.filter(p => !seen.has(p.m.conditionId) && seen.add(p.m.conditionId));
if (PICKS) {
  unique = PICKS.map((pick): Pick | null => {
    const found = unique.find(p => p.m.conditionId.startsWith(pick.match) || p.m.question === pick.match);
    if (!found) console.log(`! no longer available: ${pick.match}`);
    if (!found) return null;
    const close = pick.closesAtUtc ? { at: Date.parse(pick.closesAtUtc) / 1000, reason: pick.closesAtReason ?? '' } : found.close;
    return { ...found, topic: pick.topic, close, id: pick.id };
  }).filter((p): p is Pick => p !== null);
}
const chosen: Candidate[] = [];
const filled: Record<string, number> = {};
const rejected: { question: string; reason: string }[] = [];
// Round one keeps each topic to its quota; round two fills the rest from any topic, at most two above quota.
const tried = new Set<string>();
// One market per question pattern ("X FDV above $N one day after launch?", "Will <state> enact …"),
// except elections, where each race is its own question.
const template = (q: string) => q.replace(/\$?[\d,.]+[kmb%]?/gi, '#').replace(/\b[A-Z][\w.'’-]*\b/g, 'X').replace(/(X )+X/g, 'X').toLowerCase();
const templates = new Map<string, number>();
for (const round of [0, 2]) for (const { m, e, topic, close, id: pickedId } of unique) {
  if (chosen.length >= COUNT) break;
  if (tried.has(m.conditionId) || (!POOL && !PICKS && (filled[topic] ?? 0) >= QUOTA[topic] + round)) continue;
  const pattern = template(m.question);
  if (!PICKS && (templates.get(pattern) ?? 0) >= (/\b(race|election|seat|prime minister|president)\b/i.test(m.question) ? 3 : 1)) continue;
  tried.add(m.conditionId);
  const tokens = JSON.parse(m.clobTokenIds) as string[];
  try {
    const raw = await json<{ question: string; description: string; tokens: { token_id: string; outcome: string }[]; closed: boolean; accepting_orders?: boolean }>(`https://clob.polymarket.com/markets/${m.conditionId}`);
    if (raw.closed || raw.accepting_orders === false) throw new Error('closed on the CLOB');
    const outcomes = outcomesOf(m)!;
    if (raw.tokens[0]?.outcome !== outcomes[0] || raw.tokens[1]?.outcome !== outcomes[1] || raw.tokens[0].token_id !== tokens[0] || raw.tokens[1].token_id !== tokens[1]) throw new Error('token order differs from Gamma');
    const clob = await fetchClob(m.conditionId, tokens[0]);
    const rulesHash = await bindingHash(raw.question, raw.description);
    if (clob.rulesHash !== rulesHash) throw new Error('rules hash mismatch');
    if (clob.midYesPpm == null || clob.midYesPpm < 80000 || clob.midYesPpm > 920000) throw new Error(`midpoint ${clob.midYesPpm}`);
    if (new TextEncoder().encode(raw.description).length > 20000 || new TextEncoder().encode(raw.question).length > 1024) throw new Error('too long for the realm');
    const polygon = await readAgreedSettlement(m.conditionId);
    if (polygon.settlement?.state !== 'unresolved') throw new Error(`Polygon: ${polygon.settlement?.state ?? polygon.note}`);
    chosen.push({
      id: pickedId ?? idFrom(m.slug, taken), category: topic, question: raw.question, rules: raw.description, conditionId: m.conditionId,
      outcomes, tokenIds: [tokens[0], tokens[1]], rulesHash,
      closesAt: close.at, closesAtUtc: new Date(close.at * 1000).toISOString().replace('.000Z', 'Z'), closesAtReason: close.reason,
      openingYesPricePpm: Math.round(clob.midYesPpm / 1000) * 1000,
      source: { venue: 'Polymarket', eventSlug: e.slug, marketSlug: m.slug, api: `https://clob.polymarket.com/markets/${m.conditionId}`, negRisk: Boolean(m.negRisk) },
      stats: { volume: Math.round(m.volumeNum ?? 0), volume24hr: Math.round(m.volume24hr ?? 0), liquidity: Math.round(m.liquidityNum ?? 0), endDate: m.endDate ?? '' },
    });
    filled[topic] = (filled[topic] ?? 0) + 1;
    templates.set(pattern, (templates.get(pattern) ?? 0) + 1);
    console.log(`+ ${m.conditionId.slice(0, 12)} ${topic.padEnd(10)} ${(clob.midYesPpm / 1e6).toFixed(3)} ${new Date(close.at * 1000).toISOString().slice(0, 10)} ${String(Math.round((m.volumeNum ?? 0) / 1e6)).padStart(4)}M  ${raw.question}  [${(e.tags ?? []).map(t => t.label).slice(0, 4).join(', ')}]`);
  } catch (error) {
    rejected.push({ question: m.question, reason: (error as Error).message });
  }
}
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: chosen.length, byTopic: filled, candidates: chosen, rejected }, null, 2) + '\n');
console.log(`chosen ${chosen.length}: ${JSON.stringify(filled)}; rejected ${rejected.length}; written to ${OUT}`);
