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
// Money (from 27 November 2026, after the robot ran dry on 23 October: every
// listing locked a 3 GNOT reserve that returns to the treasury, not to the
// robot, and fixed gas allowances overpaid every call four to five times). The
// signer now sizes gas from a simulation; v2's obligations come first in every
// run (results, then quotes), then listing, then v1's prices and surplus within
// caps of their own; listing never takes the balance below a floor kept for
// quotes and results, and a near-term listing never spends what the judging
// window's listings will need.
//
// Listing (Gnome Tavern judging, 18-21 December 2026): matches whose trading
// ends inside a window are listed with a larger reserve as soon as Polymarket
// has them, up to a handful; before the window starts, one near-term match is
// kept open so v2 always has a live market. After the window, the robot lists
// nothing until a new window is configured (ROBOT_WINDOW_FROM / _TO).
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
  maxOpenListed?: number; // stop listing at this many v2 markets whose trading has not ended
  reserveUgnot?: bigint; // collateral a near-term listing starts with
  window?: ListingWindow | null; // matches whose trading ends inside it, listed with their own reserve
  liveMax?: number; // near-term matches kept open before the window starts
  minLifeSeconds?: number; // a near-term listing trades at least this long
  minBalanceUgnot?: bigint; // kept for quotes and results: listing never goes below it, v1 and surplus wait under it
  renewAfterSeconds?: number; // a quote older than this is renewed (the realm's lifetime is longer)
  v1DriftPpm?: number; // v1 is requoted from this drift (its markets are read-only in the app)
  v1MaxCalls?: number; // v1 calls per run
  surplusMaxCalls?: number; // WithdrawSurplus calls per run
  maxCalls?: number; // transactions per run
  deadlineMs?: number; // stop sending after this long
  fetcher?: typeof fetch;
}

// The judging window: list matches whose trading ends at or after `from` and
// before `to`, at most `max` open at once, each funded with `reserveUgnot`.
export interface ListingWindow { from: number; to: number; max: number; reserveUgnot: bigint }

// Storage and gas a listing costs besides its reserve (October: about 1 GNOT).
export const LISTING_COST_UGNOT = 1_500_000n;

export interface Step { kind: string; market?: string; realm?: string; args?: string[]; sendUgnot?: string; reason: string; ok: boolean; tx?: string; error?: string }
export interface Report {
  at: string; robot: string; realm: string; dryRun: boolean;
  roles: { quoter: boolean; lister: boolean; administrator: string; oracle?: string; oracleBalanceUgnot?: string };
  v1?: { realm: string; administrator: string; open: number; quoting: boolean };
  balanceUgnot: string; markets: number; open: number; tradable: number;
  steps: Step[]; skipped: { what: string; reason: string }[]; errors: string[];
}

interface RealmInfo {
  administrator: string; quoter: string; lister: string; pendingQuoter: string; pendingLister: string;
  listingTerms: { oracle: string; treasury: string; feePpm: number };
  quoteTtl: number; minSpreadPpm: number; paused: boolean; minPricePpm: number; maxPricePpm: number;
}

const BAND = { min: 30_000, max: 970_000 };

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
    listPerRun: 2, listKinds: 'games' as 'games' | 'all', maxOpenListed: 6, reserveUgnot: 3_000_000n, window: null as ListingWindow | null,
    liveMax: 1, minLifeSeconds: 2 * 86_400, minBalanceUgnot: 8_000_000n, renewAfterSeconds: 6 * 3600,
    v1DriftPpm: 20_000, v1MaxCalls: 8, surplusMaxCalls: 6, maxCalls: 40, deadlineMs: 230_000, dryRun: false, fetcher: fetch, ...options,
  };
  const http = o.fetcher;
  const report: Report = {
    at: new Date().toISOString(), robot: signer.address, realm: o.realm, dryRun: o.dryRun,
    roles: { quoter: false, lister: false, administrator: '' }, balanceUgnot: '0', markets: 0, open: 0, tradable: 0, steps: [], skipped: [], errors: [],
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
      step.tx = await as.call(realm, func, args, { sendUgnot });
      step.ok = true;
    } catch (error) {
      step.error = String((error as Error).message ?? error).slice(0, 300);
    }
    return step.ok;
  };

  // Realm v1: accept the administrator role if offered, then brake what Polygon
  // has settled and requote what drifted, within its own cap per run. v1's
  // markets are read-only in the app, so its prices only need to stay honest.
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
    const moves = v1Moves(reads, o.v1DriftPpm);
    for (const x of moves.slice(0, o.v1MaxCalls)) await send(x.kind, 'SetQuote', [x.m.id, String(x.price), String(x.m.quoteVersion)], x.reason, x.m.id, undefined, v1);
    if (moves.length > o.v1MaxCalls) report.skipped.push({ what: `${moves.length - o.v1MaxCalls} v1 quotes`, reason: `v1 is capped at ${o.v1MaxCalls} calls per run` });
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
  const tradable = markets.filter(m => (m.state === 'open' || m.state === 'paused') && m.closesAt > now);
  report.tradable = tradable.length;
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
  // Then v2's prices: the largest drift first, then renewals of the oldest quotes.
  if (quoter) {
    const requotes = reads.flatMap(({ m, status }) => (status?.actions ?? []).filter(a => a.kind === 'requote').map(a => ({ m, a: a as Extract<typeof a, { kind: 'requote' }> })))
      .sort((x, y) => y.a.driftPpm - x.a.driftPpm);
    const requoted = new Set<string>();
    for (const { m, a } of requotes) {
      const q = twoSided(a.yesPricePpm, info.minSpreadPpm, { min: info.minPricePpm, max: info.maxPricePpm });
      if (!q) continue;
      if (await send('requote', 'SetQuote', [m.id, String(q.yes), String(q.no), String(m.quoteVersion)], `Polymarket moved ${(a.driftPpm / 10_000).toFixed(1)} points`, m.id)) requoted.add(m.id);
    }
    // Renew quotes before they age: with runs four hours apart (Hobby fires within
    // the hour), renewing from six hours keeps every quote under about eleven.
    const stale = tradable.filter(m => m.state === 'open' && !m.realmPaused && !requoted.has(m.id) && !proposed.has(m.id) && now - m.quotedAt >= o.renewAfterSeconds)
      .sort((x, y) => x.quotedAt - y.quotedAt);
    for (const m of stale) await send('renew', 'SetQuote', [m.id, String(m.yesPricePpm), String(m.noPricePpm), String(m.quoteVersion)], `quote ${Math.round((now - m.quotedAt) / 3600)} hours old`, m.id);
  }

  // A market listed earlier whose funding did not land gets its opening collateral now.
  if (lister) {
    for (const m of tradable.filter(x => x.state === 'open' && x.escrowUgnot === 0n && x.closesAt > now + 3600)) {
      const reserve = o.window && m.closesAt >= o.window.from && m.closesAt < o.window.to ? o.window.reserveUgnot : o.reserveUgnot;
      if (balance < o.minBalanceUgnot + reserve) break;
      if (await send('fund', 'Fund', [m.id], 'the market has no collateral yet', m.id, reserve)) balance -= reserve;
    }
  }

  // 3. New markets, on the listing terms, while there is room and money.
  if (!lister) report.skipped.push({ what: 'listing', reason: 'this robot is not the lister' });
  else if (!info.listingTerms.oracle || !info.listingTerms.treasury) report.skipped.push({ what: 'listing', reason: 'the administrator has not set listing terms' });
  else if (info.paused) report.skipped.push({ what: 'listing', reason: 'the realm is paused' });
  else if (tradable.length >= o.maxOpenListed) report.skipped.push({ what: 'listing', reason: `${tradable.length} markets trade now, the limit is ${o.maxOpenListed}` });
  else {
    balance = o.dryRun ? balance : await signer.balance();
    const listed = new Set(markets.map(m => m.conditionId));
    if (o.v1Realm) {
      try { for (const m of await fetchMarkets(o.rpc, o.v1Realm, undefined, 1)) listed.add(m.conditionId); } catch { /* v1 unreadable: rely on v2 only */ }
    }
    const taken = new Set(markets.map(m => m.id));
    const windows = o.window && now < o.window.to ? [o.window] : [];
    const candidates = await findCandidates(http, now, listed, report, o.listKinds === 'games', windows);
    const picks = pickListings(candidates, now, o);
    const left = slotLimits(tradable, now, o);
    if (!picks.length || left.room === 0 || left.window + left.live === 0) report.skipped.push({ what: 'listing', reason: o.window && now >= o.window.to ? 'the listing window has passed' : picks.length ? 'the window and the near-term slot are full' : 'no match fits the window or the near-term slot yet' });
    let made = 0;
    for (const pick of picks) {
      const c = pick.candidate;
      if (made >= o.listPerRun || left.room === 0 || !canSend()) break;
      // A candidate that fails its checks gives its slot to the next one.
      if (left[pick.slot] === 0) continue;
      // Never below the floor, and a near-term listing leaves what the window's listings will need.
      const needed = o.minBalanceUgnot + pick.reserveUgnot + LISTING_COST_UGNOT + (pick.slot === 'live' ? windowCommitment(tradable, o) : 0n);
      if (balance < needed) { report.skipped.push({ what: c.m.question, reason: `balance ${balance} ugnot, a ${pick.slot} listing needs ${needed}` }); continue; }
      const source = await verifySource(http, c).catch(error => { report.skipped.push({ what: c.m.question, reason: String((error as Error).message) }); return null; });
      if (!source) continue;
      const q = twoSided(source.midYesPpm, info.minSpreadPpm, { min: info.minPricePpm, max: info.maxPricePpm });
      if (!q) { report.skipped.push({ what: c.m.question, reason: 'price outside the band' }); continue; }
      const id = idFrom(c.m.slug, taken);
      const args = [id, source.question, source.rules, c.m.conditionId, source.tokens[0], source.tokens[1], c.outcomes[0], c.outcomes[1],
        String(c.close.at), String(q.yes), String(q.no), String(info.listingTerms.feePpm), info.listingTerms.oracle, info.listingTerms.treasury, c.topic];
      if (!await send('list', 'CreateMarket', args, `${pick.slot}: ${c.topic}: ${c.m.question} (${c.close.reason})`, id)) continue;
      taken.add(id);
      if (await send('fund', 'Fund', [id], `opening collateral, ${pick.slot} listing`, id, pick.reserveUgnot)) balance -= pick.reserveUgnot;
      balance -= LISTING_COST_UGNOT;
      left[pick.slot]--;
      left.room--;
      made++;
    }
  }

  // 4. Upkeep that can wait for the next run: realm v1's prices and the surplus of
  // final markets (sent to their treasury), each within its own cap, and only
  // while the balance stays above the floor kept for v2.
  balance = o.dryRun ? balance : await signer.balance().catch(() => balance);
  if (balance < o.minBalanceUgnot) report.skipped.push({ what: 'v1 quotes and surplus', reason: `balance ${balance} ugnot is below the floor ${o.minBalanceUgnot}` });
  else {
    if (o.v1Realm) {
      try { await keepV1(o.v1Realm); } catch (error) { report.errors.push(`v1: ${(error as Error).message}`); }
    }
    let withdrawn = 0;
    for (const m of markets.filter(x => x.state === 'final')) {
      if (withdrawn >= o.surplusMaxCalls || !canSend()) break;
      try {
        // Surplus returns two int64 values, so it is read raw: qeval parses only a
        // string result, and until 27 November that refusal was swallowed here, so
        // no surplus was ever sent.
        const amount = surplusOf(await qevalRaw(o.rpc, o.realm, `Surplus("${m.id}")`));
        if (amount > 0n) {
          await send('surplus', 'WithdrawSurplus', [m.id], `${amount} ugnot no longer owed`, m.id);
          withdrawn++;
        }
      } catch (error) { report.errors.push(`surplus ${m.id}: ${(error as Error).message}`); }
    }
  }
  report.balanceUgnot = String(o.dryRun ? balance : await signer.balance().catch(() => balance));
  return report;
}

// What WithdrawSurplus would send, from Surplus()'s raw answer
// "(collateral int64)\n(fees int64)".
export function surplusOf(raw: string): bigint {
  const values = [...raw.matchAll(/\((-?\d+) int64\)/g)].map(x => BigInt(x[1]));
  return values.length === 2 && values[0] >= 0n && values[1] >= 0n ? values[0] + values[1] : 0n;
}

// v1's moves in the order they are sent: brakes on settled markets first, then
// the largest drifts from the threshold up.
export function v1Moves<M extends { id: string; yesPricePpm: number; quoteVersion: number }>(reads: { m: M; status: { actions?: { kind: string; yesPricePpm?: number; driftPpm?: number; reason?: string }[] } | null }[], driftPpm: number) {
  return reads.flatMap(({ m, status }) => (status?.actions ?? []).flatMap(a =>
    a.kind === 'brake' ? [{ m, kind: 'brake', price: a.yesPricePpm as number, reason: a.reason ?? 'settled on Polygon', weight: 2_000_000 }]
    : a.kind === 'requote' && (a.driftPpm ?? 0) >= driftPpm ? [{ m, kind: 'requote', price: v1Price(a.yesPricePpm as number), reason: `Polymarket moved ${((a.driftPpm ?? 0) / 10_000).toFixed(1)} points`, weight: a.driftPpm ?? 0 }]
    : []))
    .filter(x => x.price !== x.m.yesPricePpm)
    .sort((x, y) => y.weight - x.weight);
}

type Slotted = { closesAt: number };
const inWindow = (at: number, w: ListingWindow | null) => Boolean(w && at >= w.from && at < w.to);

// What the window's remaining listings will need: a near-term listing leaves it untouched.
export function windowCommitment(tradable: Slotted[], o: { window: ListingWindow | null }): bigint {
  if (!o.window) return 0n;
  const left = Math.max(0, o.window.max - tradable.filter(m => inWindow(m.closesAt, o.window)).length);
  return BigInt(left) * (o.window.reserveUgnot + LISTING_COST_UGNOT);
}

// How many listings may happen now: room under the cap on markets that trade
// at once, the window's own limit, and one near-term slot until the window opens.
export function slotLimits(tradable: Slotted[], now: number, o: { window: ListingWindow | null; liveMax: number; maxOpenListed: number }): { room: number; window: number; live: number } {
  const inside = tradable.filter(m => inWindow(m.closesAt, o.window)).length;
  return {
    room: Math.max(0, o.maxOpenListed - tradable.length),
    window: o.window && now < o.window.to ? Math.max(0, o.window.max - inside) : 0,
    live: !o.window || now < o.window.from ? Math.max(0, o.liveMax - (tradable.length - inside)) : 0,
  };
}

// Every candidate that may be listed, best first: window matches, the most
// traded first; then, before the window starts, near-term matches that trade
// at least minLifeSeconds. The run takes them in this order within slotLimits,
// so one that fails its checks hands its slot to the next.
export function pickListings<C extends { m: { volumeNum?: number }; close: { at: number } }>(candidates: C[], now: number,
  o: { window: ListingWindow | null; minLifeSeconds: number; reserveUgnot: bigint }): { candidate: C; slot: 'window' | 'live'; reserveUgnot: bigint }[] {
  const byVolume = (a: C, b: C) => (b.m.volumeNum ?? 0) - (a.m.volumeNum ?? 0);
  const out: { candidate: C; slot: 'window' | 'live'; reserveUgnot: bigint }[] = [];
  if (o.window && now < o.window.to) {
    for (const c of candidates.filter(c => inWindow(c.close.at, o.window)).sort(byVolume)) out.push({ candidate: c, slot: 'window', reserveUgnot: o.window.reserveUgnot });
  }
  if (!o.window || now < o.window.from) {
    for (const c of candidates.filter(c => c.close.at >= now + o.minLifeSeconds && (!o.window || c.close.at < o.window.from)).sort(byVolume)) {
      out.push({ candidate: c, slot: 'live', reserveUgnot: o.reserveUgnot });
    }
  }
  return out;
}

interface Candidate { m: GammaMarket; e: GammaEvent; topic: Topic; outcomes: [string, string]; close: { at: number; reason: string }; mid: number }

// Polymarket's busiest open events, plus the events that end around each listing
// window (a match weeks away is not among the busiest yet), filtered by the same
// rules as the hand-picked list.
export async function findCandidates(http: typeof fetch, now: number, listed: Set<string>, report: Pick<Report, 'errors'>, gamesOnly = true,
  windows: { from: number; to: number }[] = []): Promise<Candidate[]> {
  const events: GammaEvent[] = [];
  const seen = new Set<string>();
  const iso = (t: number) => new Date(t * 1000).toISOString();
  const queries = [
    'order=volume24hr&ascending=false',
    // Gamma's end date of a match event is the game day or a few days later.
    ...windows.map(w => `order=volume24hr&ascending=false&end_date_min=${iso(w.from - 86_400)}&end_date_max=${iso(w.to + 7 * 86_400)}`),
  ];
  for (const query of queries) {
    for (const offset of [0, 100]) {
      try {
        const response = await http(`https://gamma-api.polymarket.com/events?active=true&closed=false&archived=false&limit=100&offset=${offset}&${query}`, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`Gamma answered ${response.status}`);
        const page = await response.json() as GammaEvent[];
        for (const e of page) if (!seen.has(e.slug)) { seen.add(e.slug); events.push(e); }
        if (page.length < 100) break;
      } catch (error) { report.errors.push(`gamma: ${(error as Error).message}`); break; }
    }
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
