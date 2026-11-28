// What should happen to one market, from three independent reads: the realm,
// Polymarket's API and Polygon's settlement. Pure: no network, no clock.
// Shared by the app (status page, market page) and the watcher (ops/watcher),
// so both always reach the same conclusion. Browser-safe: Web Crypto only.
import type { ChainMarket } from './gno.ts';
import type { ClobRead } from './polymarket.ts';
import type { PolygonRead } from './polygon.ts';
import { CONDITIONAL_TOKENS } from './polygon.ts';

export type { ClobRead } from './polymarket.ts';

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
}

export type Severity = 'critical' | 'action' | 'notice';
export interface Alert { key: string; severity: Severity; title: string; body: string }
// finalize: the oracle's call, FinalizeByOracle in v1 (final at once) or
// ProposeOutcome in v2 (final after the dispute window). settle: v2's
// Finalize once the window has passed, which anyone may send. pause: v2 stops
// trading instead of v1's brake quote.
export type Action =
  | { kind: 'brake'; yesPricePpm: number; reason: string }
  | { kind: 'pause'; reason: string }
  | { kind: 'requote'; yesPricePpm: number; noPricePpm: number; expectedVersion: number; driftPpm: number }
  | { kind: 'finalize'; func: 'FinalizeByOracle' | 'ProposeOutcome'; outcome: 'Yes' | 'No' | 'Void'; args: string[]; evidenceHash: string }
  | { kind: 'settle'; args: string[] };

export interface MarketStatus {
  id: string; question: string; realmPath: string; version: 1 | 2;
  labels: { Yes: string; No: string }; // the outcomes' names fixed at listing
  realm: { state: 'open' | 'closed' | 'paused' | 'proposed' | 'final'; yesPricePpm: number; noPricePpm: number; quoteVersion: number; quoteAgeSeconds: number; closesAt: number; escrowUgnot: string; winner: string; outcome: string; proposedAt: number; feePpm: number };
  polymarket: { reachable: boolean; closed: boolean | null; apiWinner: string | null; midYesPpm: number | null; bindingMatches: boolean | null };
  polygon: { state: string; note: string };
  actions: Action[];
  alerts: Alert[];
  evidence: EvidenceRecord | null;
}

export const LIMITS = {
  requoteDriftPpm: 10_000, // a cent: worth a new quote
  staleAlertDriftPpm: 50_000, // five cents: tell the owner
  closingSoonSeconds: 24 * 3600,
};

export interface EvidenceRecord {
  domain: 'six-seven.oracle-evidence'; version: 2;
  binding: { realm: string; marketId: string; conditionId: string; rulesHash: string; yesTokenId: string; noTokenId: string };
  polygon: { chainId: 137; contract: string; payoutNumerators: [string, string]; payoutDenominator: string };
  winner: 'Yes' | 'No' | 'Void'; // Void only for realm v2, from payouts [1, 1]
}

// Recursively sorted keys, so anyone rebuilding the record gets the same bytes.
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(value));
}
export const evidenceHash = (record: EvidenceRecord) => sha256Hex(canonicalJson(record));

const pct = (ppm: number) => (ppm / 10_000).toFixed(1) + '%';

// reviewed: markets a person checked after Polymarket changed their text. The
// frozen binding still decides what is proposed; the review only lets Polygon's
// agreed result through when it is the outcome the person approved.
export async function decide(realmPath: string, m: ChainMarket, now: number, clob: ClobRead | null, polygon: PolygonRead, reviewed: ReadonlyMap<string, 'Yes' | 'No' | 'Void'> = new Map()): Promise<MarketStatus> {
  const alerts: Alert[] = [];
  const actions: Action[] = [];
  const v2 = m.version === 2;
  const state = m.finalized ? 'final' : m.state === 'proposed' ? 'proposed' : now >= m.closesAt ? 'closed' : m.state === 'paused' || m.realmPaused ? 'paused' : 'open';
  const last = m.history[m.history.length - 1];

  // Polymarket's API: the binding must still be the one frozen in the realm.
  let bindingMatches: boolean | null = null;
  let apiWinner: string | null = null;
  if (clob) {
    // Outcomes are matched by the names fixed at listing (Yes and No, or two
    // teams), and the winner is read back as Yes or No by its token.
    const yes = clob.tokens.find(t => t.outcome === m.labels.Yes);
    const no = clob.tokens.find(t => t.outcome === m.labels.No);
    bindingMatches = clob.rulesHash === m.rulesHash && yes?.tokenId === m.yesTokenId && no?.tokenId === m.noTokenId;
    const won = clob.tokens.find(t => t.winner);
    apiWinner = !won ? null : won.tokenId === m.yesTokenId ? 'Yes' : won.tokenId === m.noTokenId ? 'No' : won.outcome;
    if (!bindingMatches) alerts.push({ key: `${m.id}:binding`, severity: 'critical', title: `${m.id}: Polymarket's question, rules or tokens no longer match the realm`,
      body: 'Do not finalize from this source until a person compares the market on Polymarket with the binding in the realm.' });
  }

  // Polygon: the settlement record.
  const settlement = polygon.settlement;
  // v2 settles a 50-50 as Void; v1 cannot settle it at all.
  const result: 'Yes' | 'No' | 'Void' | null = settlement && (settlement.state === 'Yes' || settlement.state === 'No') ? settlement.state
    : v2 && settlement?.state === 'void' ? 'Void' : null;
  let evidence: EvidenceRecord | null = null;

  if (settlement?.state === 'void' && !v2) {
    alerts.push({ key: `${m.id}:void`, severity: 'critical', title: `${m.id}: Polymarket settled 50-50`,
      body: 'Realm v1 can settle only Yes or No, so this market cannot end yet. Money stays in escrow until realm v2 adds a void outcome (docs/SECURITY-REVIEW.md, R2).' });
  }
  if (settlement?.state === 'invalid') {
    alerts.push({ key: `${m.id}:invalid`, severity: 'critical', title: `${m.id}: unexpected payouts on Polygon`, body: `Payouts ${settlement.numerators.join(', ')}. Nothing will be finalized.` });
  }
  if (result && apiWinner && apiWinner !== result) {
    alerts.push({ key: `${m.id}:disagree`, severity: 'critical', title: `${m.id}: Polygon says ${result}, Polymarket's API says ${apiWinner}`, body: 'Nothing will be finalized until they agree.' });
  }

  if (result && settlement && 'numerators' in settlement && (bindingMatches !== false || reviewed.get(m.id) === result) && !(apiWinner && apiWinner !== result)) {
    evidence = {
      domain: 'six-seven.oracle-evidence', version: 2,
      binding: { realm: realmPath, marketId: m.id, conditionId: m.conditionId, rulesHash: m.rulesHash, yesTokenId: m.yesTokenId, noTokenId: m.noTokenId },
      polygon: { chainId: 137, contract: CONDITIONAL_TOKENS, payoutNumerators: settlement.numerators as [string, string], payoutDenominator: settlement.denominator },
      winner: result,
    };
    const hash = await evidenceHash(evidence);
    const func = v2 ? 'ProposeOutcome' : 'FinalizeByOracle';
    if (m.state === 'proposed') {
      if (m.outcome !== result) {
        alerts.push({ key: `${m.id}:wrong-proposal`, severity: 'critical', title: `${m.id}: the oracle proposed ${m.outcome}, Polygon says ${result}`,
          body: 'The guardian should cancel the proposal before the dispute window ends.' });
      }
    } else if (!m.finalized) {
      actions.push({ kind: 'finalize', func, outcome: result, args: [m.id, m.conditionId, m.rulesHash, m.yesTokenId, m.noTokenId, result, hash], evidenceHash: hash });
      alerts.push({ key: `${m.id}:resolved:${result}`, severity: 'action', title: `${m.id}: resolved ${result} on Polygon, ready for the oracle`,
        body: `The oracle signs ${func} with evidence ${hash}.` });
      if (v2) {
        if (state === 'open') actions.push({ kind: 'pause', reason: `the result is final on Polygon: ${result}` });
      } else if (result !== 'Void') {
        const brake = result === 'Yes' ? 999_999 : 1;
        if (state === 'open' && m.yesPricePpm !== brake) actions.push({ kind: 'brake', yesPricePpm: brake, reason: `the result is final on Polygon: ${result}` });
      }
    } else if ((m.outcome || m.winner) !== result) {
      alerts.push({ key: `${m.id}:wrong-result`, severity: 'critical', title: `${m.id}: the realm says ${m.outcome || m.winner}, Polygon says ${result}`, body: v2 ? 'A wrong result became final after the dispute window.' : 'A wrong result was finalized. In v1 it cannot be undone.' });
    }
  }

  // v2: a proposal past its dispute window waits only for someone to send Finalize.
  if (v2 && m.state === 'proposed' && now >= m.proposedAt + 24 * 3600) actions.push({ kind: 'settle', args: [m.id] });

  // Quotes while trading is open and there is no result.
  if (state === 'open' && !result && clob?.midYesPpm != null && !clob.closed) {
    const target = Math.min(999_999, Math.max(1, clob.midYesPpm));
    const drift = Math.abs(target - m.yesPricePpm);
    // v2 quotes both sides inside 0.03–0.97; a price outside the band pauses the market instead.
    if (v2 && (target < 30_000 || target > 970_000)) actions.push({ kind: 'pause', reason: `Polymarket's price ${pct(target)} is outside the band the realm quotes` });
    else if (drift >= LIMITS.requoteDriftPpm) actions.push({ kind: 'requote', yesPricePpm: target, noPricePpm: 1_000_000 - target, expectedVersion: m.quoteVersion, driftPpm: drift });
    if (drift >= LIMITS.staleAlertDriftPpm) {
      alerts.push({ key: `${m.id}:stale:${Math.round(target / LIMITS.staleAlertDriftPpm)}`, severity: 'action', title: `${m.id}: our Yes ${pct(m.yesPricePpm)}, Polymarket ${pct(target)}`,
        body: 'The quote is behind Polymarket. Until it moves, buyers trade against the reserve at the old price.' });
    }
  }

  if (!m.finalized && m.closesAt > now && m.closesAt - now <= LIMITS.closingSoonSeconds) {
    alerts.push({ key: `${m.id}:closing`, severity: 'notice', title: `${m.id}: trading closes within 24 hours`, body: `Closes at ${new Date(m.closesAt * 1000).toISOString()}.` });
  }

  // The realm's own invariant, read from outside.
  const larger = m.yesMicroShares > m.noMicroShares ? m.yesMicroShares : m.noMicroShares;
  if (!m.finalized && larger > m.escrowUgnot) {
    alerts.push({ key: `${m.id}:invariant`, severity: 'critical', title: `${m.id}: shares exceed escrow`, body: `max(Yes, No) ${larger} > escrow ${m.escrowUgnot}. This must never happen.` });
  }

  return {
    id: m.id, question: m.question, realmPath, version: m.version, labels: m.labels,
    realm: { state, yesPricePpm: m.yesPricePpm, noPricePpm: m.noPricePpm, quoteVersion: m.quoteVersion, quoteAgeSeconds: Math.max(0, now - last.at), closesAt: m.closesAt,
      escrowUgnot: String(m.escrowUgnot), winner: m.winner, outcome: m.outcome, proposedAt: m.proposedAt, feePpm: m.feePpm },
    polymarket: { reachable: clob !== null, closed: clob?.closed ?? null, apiWinner, midYesPpm: clob?.midYesPpm ?? null, bindingMatches },
    polygon: { state: settlement?.state ?? 'unknown', note: polygon.note },
    actions, alerts, evidence,
  };
}

// A realm's coins sit at sha256("pkgPath:" + path)[:20], in bech32 with prefix "g".
export async function realmAddress(pkgPath: string): Promise<string> {
  const hex = await sha256Hex('pkgPath:' + pkgPath);
  const bytes = Array.from({ length: 20 }, (_, i) => parseInt(hex.slice(2 * i, 2 * i + 2), 16));
  const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const words: number[] = [];
  let acc = 0, bits = 0;
  for (const b of bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 31); } }
  if (bits) words.push((acc << (5 - bits)) & 31);
  const polymod = (values: number[]) => {
    const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) { const top = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ v; for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= gen[i]; }
    return chk;
  };
  const mod = polymod([3, 0, 7, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map(i => (mod >>> (5 * (5 - i))) & 31);
  return 'g1' + [...words, ...checksum].map(w => charset[w]).join('');
}
