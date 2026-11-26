// The listing robot for realm v2. One run reads the realm, Polymarket and
// Polygon, then sends the few transactions that keep 67 in step with
// Polymarket: it accepts the roles offered to it, makes proposals final after
// the dispute window, pauses markets whose result is in or whose price left the
// band, requotes markets that drifted, renews quotes before they expire,
// returns surplus to the treasury, and lists a few new Polymarket markets on
// the listing terms the administrator fixed.
//
// Realm v1 has one role, its administrator. Once the operator hands that role
// to the robot (ProposeAdministrator, which the robot accepts), the robot also
// keeps v1's prices in step: a new quote when Polymarket moved a point or more,
// and the brake quote when the result is final on Polygon. It never lists on v1.
//
// Results: with a second key of its own, the robot-oracle (ROBOT_ORACLE_MNEMONIC,
// set as the oracle in v2's listing terms), it proposes the result that
// Polymarket's own resolution recorded on Polygon, for the markets listed with
// that oracle; the result is final after the 24-hour window unless the guardian
// cancels it. Markets listed with another oracle (the owner's account) still
// wait for that account. The quoting key never proposes results, never resumes
// a market and never moves money anywhere but into a market it lists or from a
// final market to its treasury. The realm enforces all of that by role.
//
// Runtime-agnostic: fetch only. The signer is passed in (ops/robot/signer.ts).
import { fetchMarkets, fetchStatus, qeval, qevalRaw } from '../../src/live/gno.ts';
import { bindingHash, CLOB_ORIGIN, fetchClob, type ClobRead } from '../../src/live/polymarket.ts';
import { readAgreedSettlement } from '../../src/live/polygon.ts';
import { decide } from '../../src/live/oracle.ts';
import { closing, idFrom, outcomesOf, SENSITIVE, topicOf, type GammaEvent, type GammaMarket, type Topic } from '../../src/live/listing.ts';

export interface Signer {
  address: string;
  balance(): Promise<bigint>;
  // Sends one call and waits for it to land in a block; returns the transaction hash.
  call(realm: string, func: string, args: string[], options?: { sendUgnot?: bigint; gas?: number }): Promise<string>;
  // A plain bank transfer (the robot keeps the robot-oracle's gas topped up).
  send?(to: string, ugnot: bigint): Promise<string>;
}

export interface RobotOptions {
  rpc: string;
  realm: string; // realm v2
  oracle?: Signer; // the robot-oracle: proposes results for v2 markets listed with its address as the oracle
  v1Realm?: string; // markets already on v1 are not listed again
  dryRun?: boolean;
  now?: number; // seconds; defaults to the chain's latest block time
  listPerRun?: number; // new markets per run
  // What the robot lists by itself. 'games': only matches with a fixed start time,
  // where trading can close ten minutes before kick-off; other markets stay
  // hand-picked (ops/catalogue), because their event can happen before Polymarket's
  // end date. 'all': both.
  listKinds?: 'games' | 'all';
  maxOpenListed?: number; // stop listing above this many open markets in v2
  reserveUgnot?: bigint; // collateral each new market starts with
  minBalanceUgnot?: bigint; // keep at least this much; below it the robot does not list
  renewAfterSeconds?: number; // a quote older than this is renewed (the realm's lifetime is longer)
  maxCalls?: number; // transactions per run
  deadlineMs?: number; // stop sending after this long
  fetcher?: typeof fetch;
}

export interface Step { kind: string; market?: string; realm?: string; args?: string[]; sendUgnot?: string; reason: string; ok: boolean; tx?: string; error?: string }
export interface Report {
  at: string; robot: string; realm: string; dryRun: boolean;
  roles: { quoter: boolean; lister: boolean; administrator: string; oracle?: string; oracleBalanceUgnot?: string };
  v1?: { realm: string; administrator: string; open: number; quoting: boolean };
  balanceUgnot: string; markets: number; open: number;
  steps: Step[]; skipped: { what: string; reason: string }[]; errors: string[];
}

interface RealmInfo {
  administrator: string; quoter: string; lister: string; pendingQuoter: string; pendingLister: string;
  listingTerms: { oracle: string; treasury: string; feePpm: number };
  quoteTtl: number; minSpreadPpm: number; paused: boolean; minPricePpm: number; maxPricePpm: number;
}

const BAND = { min: 30_000, max: 970_000 };
// Gas is cheap on Gno (a thousandth of a ugnot per unit on Onyx), so every call gets generous headroom.
const GAS = { AcceptRole: 20_000_000, AcceptAdministrator: 20_000_000, ProposeOutcome: 30_000_000, Finalize: 30_000_000, Pause: 20_000_000, SetQuote: 25_000_000, WithdrawSurplus: 30_000_000, CreateMarket: 80_000_000, Fund: 30_000_000 };

async function readRealm(rpc: string, realm: string): Promise<RealmInfo> {
  const v = JSON.parse(await qeval(rpc, realm, 'RealmJSON()')) as Record<string, unknown>;
  const s = (k: string) => (typeof v[k] === 'string' ? v[k] as string : '');
  const n = (k: string) => (typeof v[k] === 'number' ? v[k] as number : 0);
  const terms = (v.listingTerms ?? {}) as Record<string, unknown>;
  return {
    administrator: s('administrator'), quoter: s('quoter'), lister: s('lister'), pendingQuoter: s('pendingQuoter'), pendingLister: s('pendingLister'),
    listingTerms: { oracle: String(terms.oracle ?? ''), treasury: String(terms.treasury ?? ''), feePpm: Number(terms.feePpm ?? 0) },
    quoteTtl: n('quoteTtl'), minSpreadPpm: n('minSpreadPpm'), paused: v.paused === true,
    minPricePpm: n('minPricePpm') || BAND.min, maxPricePpm: n('maxPricePpm') || BAND.max,
  };
}

// Two prices inside the band that add up to at least 1 plus the minimum spread,
// centred on Polymarket's midpoint for the first outcome.
export function twoSided(midYesPpm: number, minSpreadPpm: number, band = BAND): { yes: number; no: number } | null {
  const round = (x: number) => Math.round(x / 1000) * 1000;
  let yes = round(midYesPpm);
  if (yes < band.min || yes > band.max) return null;
  let no = 1_000_000 - yes;
  if (minSpreadPpm > 0) { const half = Math.ceil(minSpreadPpm / 2000) * 1000; yes += half; no += half; }
  if (yes + no < 1_000_000 + minSpreadPpm) no += 1_000_000 + minSpreadPpm - yes - no;
  if (yes > band.max || no < band.min || no > band.max) return null;
  return { yes, no };
}

// A v1 quote: Polymarket's midpoint to a tenth of a cent, never 0 or 1.
export function v1Price(midYesPpm: number): number {
  return Math.min(999_000, Math.max(1_000, Math.round(midYesPpm / 1000) * 1000));
}

async function pool<T, R>(items: T[], limit: number, f: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await f(items[i]); }
  }));
  return out;
}

export async function runRobot(signer: Signer, options: RobotOptions): Promise<Report> {
  const started = Date.now();
  const o = {
    listPerRun: 2, listKinds: 'games' as 'games' | 'all', maxOpenListed: 30, reserveUgnot: 3_000_000n, minBalanceUgnot: 15_000_000n,
    renewAfterSeconds: 14 * 3600, maxCalls: 40, deadlineMs: 230_000, dryRun: false, fetcher: fetch, ...options,
  };
  const http = o.fetcher;
  const report: Report = {
    at: new Date().toISOString(), robot: signer.address, realm: o.realm, dryRun: o.dryRun,
    roles: { quoter: false, lister: false, administrator: '' }, balanceUgnot: '0', markets: 0, open: 0, steps: [], skipped: [], errors: [],
  };
  let calls = 0;
  const canSend = () => calls < o.maxCalls && Date.now() - started < o.deadlineMs;
  const send = async (kind: string, func: string, args: string[], reason: string, market?: string, sendUgnot?: bigint, realm = o.realm, as: Signer = signer): Promise<boolean> => {
    if (!canSend()) { report.skipped.push({ what: `${func} ${args[0] ?? ''}`, reason: 'run limit reached' }); return false; }
    calls++;
    const step: Step = { kind, market, args, reason, ok: false, ...(sendUgnot ? { sendUgnot: String(sendUgnot) } : {}), ...(realm !== o.realm ? { realm } : {}) };
    report.steps.push(step);
    if (o.dryRun) { step.ok = true; return true; }
    try {
      step.tx = await as.call(realm, func, args, { sendUgnot, gas: GAS[func as keyof typeof GAS] ?? 10_000_000 });
      step.ok = true;
    } catch (error) {
      step.error = String((error as Error).message ?? error).slice(0, 300);
    }
    return step.ok;
  };

  // Realm v1: accept the administrator role if offered, then requote what drifted
  // and brake what Polygon has settled. One price per market, a version check per call.
  const keepV1 = async (v1: string) => {
    const address = async (expression: string) => (await qevalRaw(o.rpc, v1, expression)).match(/g1[0-9a-z]{38}/)?.[0] ?? '';
    let administrator = await address('Administrator()');
    if (await address('PendingAdministrator()') === signer.address
      && await send('role', 'AcceptAdministrator', [], 'the administrator of realm v1 offered the role', undefined, undefined, v1)) administrator = signer.address;
    const quoting = administrator === signer.address;
    const open = (await fetchMarkets(o.rpc, v1, undefined, 1)).filter(m => !m.finalized && m.closesAt > now + 600);
    report.v1 = { realm: v1, administrator, open: open.length, quoting };
    if (!quoting) return;
    const reads = await pool(open, 6, async m => {
      const [clob, polygon] = await Promise.all([fetchClob(m.conditionId, m.yesTokenId, http).catch(() => null), readAgreedSettlement(m.conditionId)]);
      return { m, status: await decide(v1, m, now, clob, polygon) };
    });
    const moves = reads.flatMap(({ m, status }) => (status?.actions ?? []).flatMap(a =>
      a.kind === 'brake' ? [{ m, kind: 'brake', price: a.yesPricePpm, reason: a.reason, weight: 2_000_000 }]
      : a.kind === 'requote' ? [{ m, kind: 'requote', price: v1Price(a.yesPricePpm), reason: `Polymarket moved ${(a.driftPpm / 10_000).toFixed(1)} points`, weight: a.driftPpm }]
      : []))
      .filter(x => x.price !== x.m.yesPricePpm)
      .sort((x, y) => y.weight - x.weight);
    for (const x of moves) await send(x.kind, 'SetQuote', [x.m.id, String(x.price), String(x.m.quoteVersion)], x.reason, x.m.id, undefined, v1);
  };

  const chain = await fetchStatus(o.rpc);
  const now = o.now ?? chain.blockTime;
  const info = await readRealm(o.rpc, o.realm);
  report.roles.administrator = info.administrator;
  let balance = await signer.balance();
  report.balanceUgnot = String(balance);

  // 1. Roles the administrator has offered to this robot.
  if (info.pendingQuoter === signer.address && await send('role', 'AcceptRole', ['quoter'], 'the administrator offered the quoter role')) info.quoter = signer.address;
  if (info.pendingLister === signer.address && await send('role', 'AcceptRole', ['lister'], 'the administrator offered the lister role')) info.lister = signer.address;
  // The administrator may do everything the quoter and the lister do (the realm allows it),
  // so the operator can run the same robot by hand (ops/robot/operator.ts).
  const quoter = info.quoter === signer.address || info.administrator === signer.address;
  const lister = info.lister === signer.address || info.administrator === signer.address;
  report.roles.quoter = quoter;
  report.roles.lister = lister;

  // 2. Every market: what the shared oracle logic says, plus renewals and surplus.
  const markets = await fetchMarkets(o.rpc, o.realm, undefined, 2);
  report.markets = markets.length;
  report.open = markets.filter(m => m.state === 'open' || m.state === 'paused').length;
  const reads = await pool(markets, 6, async m => {
    if (m.state === 'final') return { m, clob: null as ClobRead | null, status: null };
    const [clob, polygon] = await Promise.all([fetchClob(m.conditionId, m.yesTokenId, http).catch(() => null), readAgreedSettlement(m.conditionId)]);
    return { m, clob, status: await decide(o.realm, m, now, clob, polygon) };
  });

  // Results first: propose what Polygon settled (robot-oracle markets only), make
  // final what the window allows, stop trading where the result is in.
  if (o.oracle) {
    report.roles.oracle = o.oracle.address;
    report.roles.oracleBalanceUgnot = String(await o.oracle.balance().catch(() => 0n));
  }
  const proposed = new Set<string>();
  // The robot-oracle pays gas for its proposals; the robot keeps it at a few GNOT.
  if (o.oracle && signer.send && BigInt(report.roles.oracleBalanceUgnot ?? '0') < 1_000_000n && balance >= o.minBalanceUgnot + 3_000_000n && canSend()) {
    calls++;
    const step: Step = { kind: 'topup', reason: 'gas for the robot-oracle', args: [o.oracle.address], sendUgnot: '3000000', ok: false };
    report.steps.push(step);
    if (o.dryRun) step.ok = true;
    else {
      try { step.tx = await signer.send(o.oracle.address, 3_000_000n); step.ok = true; balance -= 3_000_000n; } catch (error) { step.error = String((error as Error).message ?? error).slice(0, 300); }
    }
  }
  for (const { m, status } of reads) {
    for (const a of status?.actions ?? []) {
      if (a.kind === 'finalize' && a.func === 'ProposeOutcome' && o.oracle && m.oracle === o.oracle.address && (m.state === 'open' || m.state === 'paused')) {
        // A proposal stops trading by itself, so no pause follows it.
        if (await send('propose', 'ProposeOutcome', a.args, `Polymarket's resolution on Polygon: ${a.outcome}`, m.id, undefined, o.realm, o.oracle)) proposed.add(m.id);
      }
      if (a.kind === 'settle') await send('finalize', 'Finalize', a.args, 'the dispute window has passed', m.id);
      if (a.kind === 'pause' && quoter && m.state === 'open' && !proposed.has(m.id)) await send('pause', 'Pause', [m.id], a.reason, m.id);
    }
  }
  // Then prices: the largest drift first.
  if (quoter) {
    const requotes = reads.flatMap(({ m, status }) => (status?.actions ?? []).filter(a => a.kind === 'requote').map(a => ({ m, a: a as Extract<typeof a, { kind: 'requote' }> })))
      .sort((x, y) => y.a.driftPpm - x.a.driftPpm);
    const requoted = new Set<string>();
    for (const { m, a } of requotes) {
      const q = twoSided(a.yesPricePpm, info.minSpreadPpm, { min: info.minPricePpm, max: info.maxPricePpm });
      if (!q) continue;
      if (await send('requote', 'SetQuote', [m.id, String(q.yes), String(q.no), String(m.quoteVersion)], `Polymarket moved ${(a.driftPpm / 10_000).toFixed(1)} points`, m.id)) requoted.add(m.id);
    }
    // Renew the oldest quotes that will otherwise expire.
    const stale = markets.filter(m => m.state === 'open' && !m.realmPaused && !requoted.has(m.id) && m.closesAt > now && now - m.quotedAt >= o.renewAfterSeconds)
      .sort((x, y) => x.quotedAt - y.quotedAt);
    for (const m of stale) await send('renew', 'SetQuote', [m.id, String(m.yesPricePpm), String(m.noPricePpm), String(m.quoteVersion)], `quote ${Math.round((now - m.quotedAt) / 3600)} hours old`, m.id);
  }
  // Realm v1's prices, when this robot is its administrator.
  if (o.v1Realm) {
    try { await keepV1(o.v1Realm); } catch (error) { report.errors.push(`v1: ${(error as Error).message}`); }
  }
  // Surplus of final markets goes to their treasury (anyone may send it).
  for (const m of markets.filter(x => x.state === 'final')) {
    try {
      const raw = await qeval(o.rpc, o.realm, `Surplus("${m.id}")`).catch(() => '');
      const values = [...String(raw).matchAll(/\((-?\d+) int64\)/g)].map(x => BigInt(x[1]));
      if (values.length === 2 && values[0] >= 0n && values[1] >= 0n && values[0] + values[1] > 0n) {
        await send('surplus', 'WithdrawSurplus', [m.id], `${values[0] + values[1]} ugnot no longer owed`, m.id);
      }
    } catch (error) { report.errors.push(`surplus ${m.id}: ${(error as Error).message}`); }
  }

  // A market listed earlier whose funding did not land gets its opening collateral now.
  if (lister) {
    for (const m of markets.filter(x => x.state === 'open' && x.escrowUgnot === 0n && x.closesAt > now + 3600)) {
      if (balance < o.minBalanceUgnot + o.reserveUgnot) break;
      if (await send('fund', 'Fund', [m.id], 'the market has no collateral yet', m.id, o.reserveUgnot)) balance -= o.reserveUgnot;
    }
  }

  // 3. New markets, on the listing terms, while there is room and money.
  if (!lister) report.skipped.push({ what: 'listing', reason: 'this robot is not the lister' });
  else if (!info.listingTerms.oracle || !info.listingTerms.treasury) report.skipped.push({ what: 'listing', reason: 'the administrator has not set listing terms' });
  else if (info.paused) report.skipped.push({ what: 'listing', reason: 'the realm is paused' });
  else if (report.open >= o.maxOpenListed) report.skipped.push({ what: 'listing', reason: `${report.open} open markets, the limit is ${o.maxOpenListed}` });
  else {
    balance = o.dryRun ? balance : await signer.balance();
    if (balance < o.minBalanceUgnot + o.reserveUgnot) report.skipped.push({ what: 'listing', reason: `balance ${balance} ugnot is below what a listing needs` });
    else {
      const listed = new Set(markets.map(m => m.conditionId));
      if (o.v1Realm) {
        try { for (const m of await fetchMarkets(o.rpc, o.v1Realm, undefined, 1)) listed.add(m.conditionId); } catch { /* v1 unreadable: rely on v2 only */ }
      }
      const taken = new Set(markets.map(m => m.id));
      const candidates = await findCandidates(http, now, listed, report, o.listKinds === 'games');
      let made = 0;
      for (const c of candidates) {
        if (made >= o.listPerRun || !canSend()) break;
        const source = await verifySource(http, c).catch(error => { report.skipped.push({ what: c.m.question, reason: String((error as Error).message) }); return null; });
        if (!source) continue;
        const q = twoSided(source.midYesPpm, info.minSpreadPpm, { min: info.minPricePpm, max: info.maxPricePpm });
        if (!q) { report.skipped.push({ what: c.m.question, reason: 'price outside the band' }); continue; }
        const id = idFrom(c.m.slug, taken);
        const args = [id, source.question, source.rules, c.m.conditionId, source.tokens[0], source.tokens[1], c.outcomes[0], c.outcomes[1],
          String(c.close.at), String(q.yes), String(q.no), String(info.listingTerms.feePpm), info.listingTerms.oracle, info.listingTerms.treasury, c.topic];
        if (!await send('list', 'CreateMarket', args, `${c.topic}: ${c.m.question} (${c.close.reason})`, id)) continue;
        await send('fund', 'Fund', [id], 'opening collateral', id, o.reserveUgnot);
        made++;
      }
    }
  }
  report.balanceUgnot = String(o.dryRun ? balance : await signer.balance().catch(() => balance));
  return report;
}

interface Candidate { m: GammaMarket; e: GammaEvent; topic: Topic; outcomes: [string, string]; close: { at: number; reason: string }; mid: number }

// Polymarket's busiest open events, filtered by the same rules as the hand-picked list.
export async function findCandidates(http: typeof fetch, now: number, listed: Set<string>, report: Pick<Report, 'errors'>, gamesOnly = true): Promise<Candidate[]> {
  const events: GammaEvent[] = [];
  for (const offset of [0, 100]) {
    try {
      const response = await http(`https://gamma-api.polymarket.com/events?active=true&closed=false&archived=false&limit=100&offset=${offset}&order=volume24hr&ascending=false`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Gamma answered ${response.status}`);
      events.push(...await response.json() as GammaEvent[]);
    } catch (error) { report.errors.push(`gamma: ${(error as Error).message}`); break; }
  }
  const out: Candidate[] = [];
  for (const e of events) {
    const topic = topicOf(e);
    if (!topic || SENSITIVE.test(e.title)) continue;
    // One market per event: once any market of an event is on 67, the event is covered.
    if ((e.markets ?? []).some(m => listed.has(m.conditionId))) continue;
    const inEvent = (e.markets ?? [])
      .filter(m => m.active && !m.closed && m.enableOrderBook !== false && m.acceptingOrders !== false && /^0x[0-9a-f]{64}$/.test(m.conditionId) && !listed.has(m.conditionId))
      .filter(m => !SENSITIVE.test(m.question) && m.question.length <= 300 && m.description.length >= 80 && m.description.length <= 8000)
      // Side markets of a game (spreads, totals, halves, props) stay out; the match itself goes in.
      .filter(m => !/\b(spread|o\/u|over|under|total|handicap|1h|2h|1st|2nd|first half|second half|quarter|map \d|set \d|game \d|points|rebounds|assists|goals scored|both teams|exact score|player)\b/i.test(m.question))
      .filter(m => !/\b(and|&) (the )?(democrats|republicans|gop)\b/i.test(m.question))
      .filter(m => (m.liquidityNum ?? 0) >= 2000 && (m.volumeNum ?? 0) >= 20_000)
      .filter(m => !gamesOnly || Boolean(m.gameStartTime))
      .flatMap(m => {
        const outcomes = outcomesOf(m, true);
        if (!outcomes || (outcomes[0] === 'Yes' && !m.question.trim().endsWith('?'))) return [];
        const close = closing(m, now, 6 * 3600);
        const mid = m.bestBid && m.bestAsk ? (m.bestBid + m.bestAsk) / 2 : (m.lastTradePrice ?? 0);
        return close && mid >= 0.06 && mid <= 0.94 ? [{ m, e, topic, outcomes, close, mid }] : [];
      })
      // In a many-outcome event, the outcome nearest a coin flip is the interesting one.
      .sort((a, b) => Math.abs(a.mid - 0.5) - Math.abs(b.mid - 0.5))
      .slice(0, 1);
    out.push(...inEvent);
  }
  return out;
}

// The CLOB's own record of the market: exact question and rules, token order,
// a live midpoint, and Polygon still unsettled.
async function verifySource(http: typeof fetch, c: Candidate): Promise<{ question: string; rules: string; tokens: [string, string]; midYesPpm: number }> {
  const response = await http(`${CLOB_ORIGIN}/markets/${c.m.conditionId}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`the CLOB answered ${response.status}`);
  const raw = await response.json() as { condition_id?: string; question?: string; description?: string; closed?: boolean; accepting_orders?: boolean; tokens?: { token_id: string; outcome: string }[] };
  if (raw.condition_id !== c.m.conditionId || typeof raw.question !== 'string' || typeof raw.description !== 'string') throw new Error('the CLOB returned another market');
  if (raw.closed || raw.accepting_orders === false) throw new Error('closed on the CLOB');
  const gammaTokens = JSON.parse(c.m.clobTokenIds) as string[];
  const t = raw.tokens ?? [];
  if (t.length !== 2 || t[0].outcome !== c.outcomes[0] || t[1].outcome !== c.outcomes[1] || t[0].token_id !== gammaTokens[0] || t[1].token_id !== gammaTokens[1]) throw new Error('token order differs from Gamma');
  const utf8 = (s: string) => new TextEncoder().encode(s).length;
  if (utf8(raw.question) > 1024 || utf8(raw.description) > 20_000 || !raw.description.trim()) throw new Error('too long for the realm');
  const clob = await fetchClob(c.m.conditionId, t[0].token_id, http);
  if (clob.rulesHash !== await bindingHash(raw.question, raw.description)) throw new Error('rules hash mismatch');
  if (clob.midYesPpm == null) throw new Error('no midpoint');
  const polygon = await readAgreedSettlement(c.m.conditionId);
  if (polygon.settlement?.state !== 'unresolved') throw new Error(`Polygon: ${polygon.settlement?.state ?? polygon.note}`);
  return { question: raw.question, rules: raw.description, tokens: [t[0].token_id, t[1].token_id], midYesPpm: clob.midYesPpm };
}
