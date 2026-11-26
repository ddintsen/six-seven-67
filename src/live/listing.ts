// Which Polymarket markets 67 lists, under which topic and until when.
// Shared by the hand-run selector (ops/catalogue/select.ts) and the listing
// robot (ops/robot), so both apply the same rules. Pure: no network.

export type Topic = 'Politics' | 'World' | 'Economy' | 'Crypto' | 'Technology' | 'Science' | 'Culture' | 'Sports';

export interface GammaMarket {
  question: string; conditionId: string; slug: string; description: string; outcomes: string; clobTokenIds: string;
  endDate?: string; gameStartTime?: string; active: boolean; closed: boolean; enableOrderBook?: boolean; acceptingOrders?: boolean;
  liquidityNum?: number; volumeNum?: number; volume24hr?: number; lastTradePrice?: number; bestBid?: number; bestAsk?: number; negRisk?: boolean;
  icon?: string; image?: string;
}
export interface GammaEvent { slug: string; title: string; tags?: { label: string }[]; markets?: GammaMarket[]; volume24hr?: number }

// Polymarket tag labels to 67 topics, first match wins.
const TAGS: [Topic, RegExp][] = [
  ['Sports', /^(sports|soccer|nfl|nba|mlb|nhl|tennis|f1|formula 1|golf|ucl|epl|ufc|boxing|ballon d'or|world series)$/i],
  ['Crypto', /^(crypto|bitcoin|ethereum|solana|crypto prices|stablecoins|airdrops?|token launch|fdv)$/i],
  ['Technology', /^(tech|ai|big tech|openai|apple|google|nvidia|tesla)$/i],
  ['Science', /^(science|space|spacex|nasa|climate|pandemics?|health|medicine)$/i],
  ['Culture', /^(culture|pop culture|movies|music|entertainment|awards|oscars|celebrities|tv|youtube|gaming)$/i],
  ['Economy', /^(fed|fed rates|economy|finance|stocks|equities|commodities|oil|economic policy|inflation|recession|business|ipos?|tariffs)$/i],
  ['World', /^(geopolitics|world|world elections|global elections|europe|asia|uk|china|india|canada|germany|france|japan|israel|serbia|international election props)$/i],
  ['Politics', /^(politics|elections|us election|midterms|trump|congress|senate elections|house elections|us politics|governor|supreme court)$/i],
];
// Conflict-driven series stay off a public showcase unless the question is an election.
const CONFLICT_TAGS = /^(iran|israel|middle east|ukraine|russia|strait of hormuz|gaza|houthis|military|venezuela)$/i;
// Short-lived or automated series that need a keeper faster than ours.
const SKIP_TAGS = /^(weather|daily temperature|highest temperature|recurring|finance updown|pyth finance|multi strikes|weekly|daily|up or down|esports|5m|15m|hourly|combos?|parlays?)$/i;
// A question that names a sport is Sports whatever its tags say.
const SPORTS_WORDS = /\b(nfl|nba|mlb|nhl|uefa|champions league|premier league|la liga|serie a|world series|mvp|ballon d'or|super bowl|stanley cup|grand prix|f1|wimbledon|us open|world cup|league championship series|nba finals)\b/i;
// Kept off a public showcase: violence, death and war.
export const SENSITIVE = /\b(die|dies|died|death|dead|killed?|kills|assassinat\w*|shot|shooting|war|wars|strike[sd]? on|invade[sd]?|invasion|nuclear|attack\w*|ceasefire|hostages?|military|troops|bomb\w*|missile\w*|terror\w*|coup|arrest\w*|indict\w*|jail|prison|sentenced|captures?|captured|offensive|occupy|occupied)\b/i;

export function topicOf(event: GammaEvent): Topic | null {
  const labels = (event.tags ?? []).map(t => t.label);
  if (SPORTS_WORDS.test(event.title) && !labels.some(l => SKIP_TAGS.test(l))) return 'Sports';
  if (labels.some(l => SKIP_TAGS.test(l))) return null;
  if (labels.some(l => CONFLICT_TAGS.test(l)) && !/\b(election|prime minister|president|parliament|seats?)\b/i.test(event.title)) return null;
  for (const [topic, pattern] of TAGS) if (labels.some(l => pattern.test(l))) return topic;
  return null;
}

// A readable market ID from Polymarket's slug: lowercase words, no timestamps, at most 56 characters.
export function idFrom(slug: string, taken: Set<string>): string {
  const words = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').split('-').filter(w => w && !/^\d{9,}$/.test(w));
  let id = '';
  for (const w of words) { if ((id ? id.length + 1 : 0) + w.length > 56) break; id = id ? `${id}-${w}` : w; }
  if (!id) id = 'market';
  let unique = id, n = 2;
  while (taken.has(unique)) unique = `${id.slice(0, 52)}-${n++}`;
  taken.add(unique);
  return unique;
}

const DAY = 86400;
const LAST_CLOSE = Date.parse('2027-12-31T00:00:00Z') / 1000;
const US_ELECTION_2026 = /\b(2026 midterm|midterms?|(senate|house|governor|gubernatorial)\b.*\brace in 2026|control the (senate|house)|house seat)\b/i;
const FED_2026 = /\b(fed(eral funds)?|fomc)\b.*\b2026\b|\b2026\b.*\bfed\b/i;

// Trading closes before the event: ten minutes before a game starts, otherwise
// twelve hours before Polymarket's end date, on the hour. A market without a
// fixed event time must end at least 30 days out, since it may be decided any
// day before its end date. `minLead` is how soon the close may come (two days
// for hand-picked lists; the robot lists games as close as six hours ahead).
export function closing(m: GammaMarket, now: number, minLead = 2 * DAY): { at: number; reason: string } | null {
  const end = m.endDate ? Math.floor(Date.parse(m.endDate) / 1000) : NaN;
  const guard = (c: { at: number; reason: string }) => {
    if (Number.isFinite(end) && c.at > end) return null;
    if (c.at < now + minLead || c.at > LAST_CLOSE) return null;
    return c;
  };
  const fixed = (iso: string, reason: string) => ({ at: Date.parse(iso) / 1000, reason });
  if (US_ELECTION_2026.test(m.question)) return guard(fixed('2026-11-03T22:00:00Z', 'An hour before the first polls close on election day, 3 November 2026.'));
  if (FED_2026.test(m.question) && /end of 2026|in 2026/i.test(m.question)) return guard(fixed('2026-12-09T18:00:00Z', "An hour before the FOMC statement of 9 December 2026, the year's last decision."));
  const game = m.gameStartTime ? Math.floor(Date.parse(m.gameStartTime.replace(' ', 'T').replace(/\+00$/, 'Z')) / 1000) : NaN;
  if (Number.isFinite(game)) return guard({ at: game - 600, reason: 'Ten minutes before the game starts.' });
  if (!Number.isFinite(end)) return null;
  const at = Math.floor((end - 12 * 3600) / 3600) * 3600;
  if (at < now + 30 * DAY) return null;
  return guard({ at, reason: "Twelve hours before Polymarket's end date." });
}

// The outcomes in token order, if 67 can list them: Yes and No, or (realm v2
// only) two other names within the realm's rule for outcome names.
export function outcomesOf(m: { outcomes: string }, named: boolean): [string, string] | null {
  try {
    const o = JSON.parse(m.outcomes) as unknown;
    if (!Array.isArray(o) || o.length !== 2 || typeof o[0] !== 'string' || typeof o[1] !== 'string') return null;
    if (o[0] === 'Yes' && o[1] === 'No') return ['Yes', 'No'];
    return named && isLabel(o[0]) && isLabel(o[1]) && o[0] !== o[1] ? [o[0], o[1]] : null;
  } catch { return null; }
}
// The realm's isLabel rule (contracts/v2/markets.gno), kept here so ops code needs no browser module.
const isLabel = (v: string) => v.length > 0 && new TextEncoder().encode(v).length <= 48 && v.trim() === v && !/[\u0000-\u001f\u007f-\u009f<>[\]*_`|\\#]/.test(v);
