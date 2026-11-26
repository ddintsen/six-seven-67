// Realm v2 beside the v1 MockChain: the same JSON shape as contracts/v2/json.gno
// and the checks of contracts/v2/markets.gno that the interface depends on
// (two-sided prices, cost plus fee, limits, quote expiry, pause, proposal,
// dispute window, Void refunds, deleted positions, roles).
import { bindingHash, MOCK_NOW } from './mockChain';

export const REALM_V2 = 'gno.land/r/nym-sixseven067/markets/v2';
// bech32 of sha256("pkgPath:" + REALM_V2)[:20], as src/live/oracle.ts computes it.
export const REALM_V2_ADDRESS = 'g1q4zskgwgq7desmfxmpdgqj366sapsht63yfc0k';
const SCALE = 1_000_000n;
const WINDOW = 86_400;

export interface MarketV2 {
  id: string; question: string; rules: string; conditionId: string; yesTokenId: string; noTokenId: string; yesLabel: string; noLabel: string;
  oracle: string; treasury: string; topic: string; feePpm: number; createdAt: number; tradingEndsAt: number;
  yesPricePpm: number; noPricePpm: number; quoteVersion: number; quotedAt: number;
  state: 'open' | 'paused' | 'proposed' | 'final'; outcome: '' | 'Yes' | 'No' | 'Void'; evidence: string; proposedAt: number; finalizedAt: number;
  escrow: bigint; fees: bigint; reserve: bigint; cost: bigint; feesCollected: bigint; yes: bigint; no: bigint; paid: bigint; refundedCost: bigint; refundedFees: bigint;
  maxTrade: bigint; maxHolder: bigint; maxSide: bigint; volume: bigint; trades: number;
  history: { at: number; yesPricePpm: number; noPricePpm: number; version: number }[];
}
export interface PositionV2 { yes: bigint; no: bigint; spent: bigint; fee: bigint }

export function feeOf(shares: bigint, price: bigint, feePpm: number): bigint {
  const product = shares * BigInt(feePpm) * price * (SCALE - price);
  const d = 1_000_000_000_000_000_000n;
  return product / d + (product % d ? 1n : 0n);
}
const costOf = (shares: bigint, price: bigint) => { const p = shares * price; return p / SCALE + (p % SCALE ? 1n : 0n); };
const s = (v: bigint) => `"${v}"`;

export function v2Market(id: string, question: string, conditionId: string, oracle: string, over: Partial<MarketV2> = {}): MarketV2 {
  return {
    id, question, rules: `This market will resolve to “Yes” if ${question.replace(/\?$/, '')}.`, conditionId, yesTokenId: '71', noTokenId: '72', yesLabel: 'Yes', noLabel: 'No',
    oracle, treasury: 'g1qqqsyqcyq5rqwzqfpg9scrgwpugpzysn4uzalm', topic: 'Politics', feePpm: 40_000, createdAt: MOCK_NOW - 86_400, tradingEndsAt: MOCK_NOW + 30 * 86_400,
    yesPricePpm: 420_000, noPricePpm: 600_000, quoteVersion: 1, quotedAt: MOCK_NOW - 600, state: 'open', outcome: '', evidence: '', proposedAt: 0, finalizedAt: 0,
    escrow: 6_000_000n, fees: 0n, reserve: 6_000_000n, cost: 0n, feesCollected: 0n, yes: 0n, no: 0n, paid: 0n, refundedCost: 0n, refundedFees: 0n,
    maxTrade: 500_000_000n, maxHolder: 2_000_000_000n, maxSide: 20_000_000_000n, volume: 0n, trades: 0,
    history: [{ at: MOCK_NOW - 86_400, yesPricePpm: 420_000, noPricePpm: 600_000, version: 1 }], ...over,
  };
}

export class MockRealmV2 {
  markets: MarketV2[] = [];
  positions = new Map<string, Map<string, PositionV2>>();
  administrator = 'g1z86xzys5xmsj2etpzmg46q5ymj7rmxkt49uw9q';
  quoter = 'g1z86xzys5xmsj2etpzmg46q5ymj7rmxkt49uw9q';
  guardian = '';
  pending: Record<'admin' | 'quoter' | 'guardian' | 'lister', string> = { admin: '', quoter: '', guardian: '', lister: '' };
  quoteTtl = 3600;
  paused = false;

  market(id: string) { return this.markets.find(m => m.id === id)!; }
  position(owner: string, id: string): PositionV2 | undefined { return this.positions.get(owner)?.get(id); }

  private json(m: MarketV2) {
    return JSON.stringify({
      id: m.id, question: m.question, rules: m.rules, rulesHash: bindingHash(m.question, m.rules), conditionId: m.conditionId, yesTokenId: m.yesTokenId, noTokenId: m.noTokenId, yesLabel: m.yesLabel, noLabel: m.noLabel,
      oracle: m.oracle, treasury: m.treasury, topic: m.topic, feePpm: m.feePpm, createdAt: m.createdAt, tradingEndsAt: m.tradingEndsAt, abandonAt: m.tradingEndsAt + 60 * 86_400,
      yesPricePpm: m.yesPricePpm, noPricePpm: m.noPricePpm, quoteVersion: m.quoteVersion, quotedAt: m.quotedAt, state: m.state, outcome: m.outcome,
      evidenceHash: m.evidence, proposedAt: m.proposedAt, finalizedAt: m.finalizedAt,
    }).slice(0, -1) + `,"escrowUgnot":${s(m.escrow)},"feesUgnot":${s(m.fees)},"reserveUgnot":${s(m.reserve)},"costUgnot":${s(m.cost)},"feesCollectedUgnot":${s(m.feesCollected)}`
      + `,"yesMicroShares":${s(m.yes)},"noMicroShares":${s(m.no)},"paidUgnot":${s(m.paid)},"refundedCostUgnot":${s(m.refundedCost)},"refundedFeesUgnot":${s(m.refundedFees)},"withdrawnUgnot":"0"`
      + `,"maxTradeMicroShares":${s(m.maxTrade)},"maxHolderMicroShares":${s(m.maxHolder)},"maxSideMicroShares":${s(m.maxSide)},"volumeUgnot":${s(m.volume)}`
      + `,"holders":${[...this.positions.values()].filter(p => p.has(m.id)).length},"trades":${m.trades},"history":${JSON.stringify(m.history)}}`;
  }

  qeval(expression: string): string | null {
    if (expression === 'MarketsJSON()') return `[${this.markets.map(m => this.json(m)).join(',')}]`;
    if (expression === 'RealmJSON()') return JSON.stringify({ administrator: this.administrator, pendingAdministrator: this.pending.admin, quoter: this.quoter, pendingQuoter: this.pending.quoter,
      guardian: this.guardian, pendingGuardian: this.pending.guardian, lister: '', pendingLister: this.pending.lister, paused: this.paused, quoteTtl: this.quoteTtl, minSpreadPpm: 0,
      disputeWindow: WINDOW, abandonAfter: 60 * 86_400, markets: this.markets.length });
    const match = /^PositionsJSON\("(g1[a-z0-9]+)"\)$/.exec(expression);
    if (match) {
      const mine = this.positions.get(match[1]) ?? new Map();
      return `[${this.markets.filter(m => mine.has(m.id)).map(m => { const p = mine.get(m.id)!; return `{"marketId":"${m.id}","position":{"yesMicroShares":${s(p.yes)},"noMicroShares":${s(p.no)},"spentUgnot":${s(p.spent)},"feeUgnot":${s(p.fee)}}}`; }).join(',')}]`;
    }
    return null;
  }

  // Executes one MsgCall with the realm's checks; returns the panic message or null. pay() debits the wallet.
  execute(caller: string, func: string, args: string[], sent: bigint, pay: (amount: bigint) => boolean, receive: (amount: bigint) => void): string | null {
    if (func === 'Buy') {
      const [id, outcome, sharesText, expectedText] = args;
      const m = this.market(id);
      if (!m) return 'unknown market';
      if (this.paused || m.state === 'paused') return 'trading paused';
      if (m.state !== 'open' || MOCK_NOW >= m.tradingEndsAt) return 'trading closed';
      if (MOCK_NOW - m.quotedAt > this.quoteTtl) return 'the price expired';
      const price = BigInt(outcome === 'Yes' ? m.yesPricePpm : m.noPricePpm);
      if (BigInt(expectedText) !== price) return 'price does not match review';
      const shares = BigInt(sharesText);
      if (shares <= 0n || shares > m.maxTrade) return 'above the trade limit';
      const cost = costOf(shares, price); const fee = feeOf(shares, price, m.feePpm);
      if (sent !== cost + fee) return 'send the exact cost plus fee';
      const p = this.position(caller, id) ?? { yes: 0n, no: 0n, spent: 0n, fee: 0n };
      const nextYes = m.yes + (outcome === 'Yes' ? shares : 0n); const nextNo = m.no + (outcome === 'No' ? shares : 0n);
      if (p.yes + p.no + shares > m.maxHolder) return 'above the holder limit';
      if ((nextYes > nextNo ? nextYes : nextNo) > m.maxSide) return 'above the market limit';
      if ((nextYes > nextNo ? nextYes : nextNo) > m.escrow + cost) return 'insufficient market collateral';
      if (!pay(cost + fee)) return 'insufficient funds';
      if (outcome === 'Yes') p.yes += shares; else p.no += shares;
      p.spent += cost; p.fee += fee;
      if (!this.positions.has(caller)) this.positions.set(caller, new Map());
      this.positions.get(caller)!.set(id, p);
      m.yes = nextYes; m.no = nextNo; m.escrow += cost; m.fees += fee; m.cost += cost; m.feesCollected += fee; m.volume += cost; m.trades += 1;
      return null;
    }
    if (func === 'Claim') {
      const m = this.market(args[0]);
      if (m.state !== 'final') return 'outcome is not final';
      const p = this.position(caller, m.id);
      if (!p) return 'no position';
      const fromEscrow = m.outcome === 'Yes' ? p.yes : m.outcome === 'No' ? p.no : p.spent;
      const fromFees = m.outcome === 'Void' ? p.fee : 0n;
      this.positions.get(caller)!.delete(m.id);
      m.escrow -= fromEscrow; m.fees -= fromFees;
      if (m.outcome === 'Void') { m.refundedCost += fromEscrow; m.refundedFees += fromFees; } else m.paid += fromEscrow;
      receive(fromEscrow + fromFees);
      return null;
    }
    if (func === 'SetQuote') {
      const [id, yesText, noText, versionText] = args;
      const m = this.market(id);
      if (caller !== this.quoter && caller !== this.administrator) return 'quoter only';
      if ((m.state !== 'open' && m.state !== 'paused') || MOCK_NOW >= m.tradingEndsAt) return 'trading closed';
      if (Number(versionText) !== m.quoteVersion) return 'quote version changed';
      const yes = Number(yesText), no = Number(noText);
      if (yes < 30_000 || yes > 970_000 || no < 30_000 || no > 970_000) return 'price outside 0.03 to 0.97';
      if (yes + no < 1_000_000) return 'Yes and No must add up to at least 1';
      m.quotedAt = MOCK_NOW;
      if (yes === m.yesPricePpm && no === m.noPricePpm) return null;
      m.yesPricePpm = yes; m.noPricePpm = no; m.quoteVersion += 1;
      m.history.push({ at: MOCK_NOW, yesPricePpm: yes, noPricePpm: no, version: m.quoteVersion });
      return null;
    }
    if (func === 'Pause') {
      if (caller !== this.quoter && caller !== this.guardian && caller !== this.administrator) return 'quoter, guardian or administrator only';
      const m = this.market(args[0]);
      if (m.state !== 'open') return 'market is not open';
      m.state = 'paused';
      return null;
    }
    if (func === 'ProposeOutcome') {
      const [id, conditionId, rulesHash, yesTokenId, noTokenId, outcome, evidence] = args;
      const m = this.market(id);
      if (caller !== m.oracle) return 'oracle only';
      if (m.state !== 'open' && m.state !== 'paused') return 'an outcome is already proposed or final';
      if (conditionId !== m.conditionId || rulesHash !== bindingHash(m.question, m.rules) || yesTokenId !== m.yesTokenId || noTokenId !== m.noTokenId) return 'source binding mismatch';
      if (!['Yes', 'No', 'Void'].includes(outcome)) return 'invalid outcome';
      m.state = 'proposed'; m.outcome = outcome as MarketV2['outcome']; m.evidence = evidence; m.proposedAt = MOCK_NOW;
      return null;
    }
    if (func === 'Finalize') {
      const m = this.market(args[0]);
      if (m.state !== 'proposed') return 'no proposed outcome';
      if (MOCK_NOW < m.proposedAt + WINDOW) return 'the dispute window is still open';
      m.state = 'final'; m.finalizedAt = MOCK_NOW;
      return null;
    }
    if (func === 'AcceptRole') {
      const role = args[0] as keyof MockRealmV2['pending'];
      if (!this.pending[role] || this.pending[role] !== caller) return `pending ${role === 'admin' ? 'administrator' : role} only`;
      if (role === 'admin') this.administrator = caller; else if (role === 'quoter') this.quoter = caller; else if (role === 'guardian') this.guardian = caller;
      this.pending[role] = '';
      return null;
    }
    return `unknown function ${func}`;
  }

  snapshot() { return structuredClone({ markets: this.markets, positions: this.positions, administrator: this.administrator, quoter: this.quoter, pending: this.pending }); }
  restore(saved: ReturnType<MockRealmV2['snapshot']>) { Object.assign(this, saved); }
}
