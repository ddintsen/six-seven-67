// Read-only access to the deployed markets realm through public Gno RPC.
// Every response is an untrusted boundary: it is validated before use, and
// financial integers stay BigInt end to end.

export const SCALE = 1_000_000n;

export type RealmVersion = 1 | 2;
export type MarketState = 'open' | 'paused' | 'proposed' | 'final';
export interface QuotePoint { at: number; yesPricePpm: number; noPricePpm: number; version: number }
export interface ChainLimits { trade: bigint; holder: bigint; side: bigint }
// One market from either realm, in one shape. v1 markets have Yes + No = 1,
// no fee, no limits and settle only Yes or No; v2 adds two-sided quotes that
// expire, a fee fixed per market, limits, pause, a proposed outcome with a
// dispute window, Void, and a treasury.
export interface ChainMarket {
  realm: string; version: RealmVersion;
  id: string; question: string; rules: string; rulesHash: string;
  conditionId: string; yesTokenId: string; noTokenId: string;
  closesAt: number; yesPricePpm: number; noPricePpm: number; oracle: string;
  escrowUgnot: bigint; yesMicroShares: bigint; noMicroShares: bigint;
  finalized: boolean; winner: '' | 'Yes' | 'No'; evidenceHash: string; finalizedAt: number; paidUgnot: bigint;
  quoteVersion: number; createdAt: number; volumeUgnot: bigint; trades: number; holders: number;
  history: QuotePoint[];
  state: MarketState; outcome: '' | 'Yes' | 'No' | 'Void'; proposedAt: number;
  feePpm: number; feesUgnot: bigint; limits: ChainLimits | null; treasury: string | null;
  quotedAt: number; quoteExpiresAt: number | null; realmPaused: boolean;
  topic: string | null; // v2 records the topic at listing; v1 takes it from catalog.json
  // The outcomes' names in token order: Yes and No, or two teams in a v2 match
  // market. 'Yes' and 'No' elsewhere always mean the first and second token.
  labels: { Yes: string; No: string };
}
export const YES_NO = { Yes: 'Yes', No: 'No' } as const;
// The realm's isLabel rule: 1 to 48 bytes, printable, no surrounding spaces, no markup characters.
export function isOutcomeLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && new TextEncoder().encode(value).length <= 48 && value.trim() === value
    && !/[\u0000-\u001f\u007f-\u009f<>[\]*_`|\\#]/.test(value);
}
export interface ChainPosition {
  realm: string; marketId: string; yesMicroShares: bigint; noMicroShares: bigint; spentUgnot: bigint; feeUgnot: bigint; claimed: boolean; paidUgnot: bigint;
}
// Realm v2's settings that shape every market's trading.
export interface RealmSettings { quoteTtl: number; paused: boolean; disputeWindow: number }
export const DISPUTE_WINDOW = 24 * 60 * 60;
export interface ChainStatus { chainId: string; height: number; blockTime: number }

export class ChainError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

// Gno's qeval returns a typed value such as ("text" string). The text is quoted
// with Go's strconv rules, which are not JSON rules, so decode them exactly.
export function unquoteGo(literal: string): string {
  if (literal.length < 2 || literal[0] !== '"' || literal[literal.length - 1] !== '"') throw new ChainError('BAD_RESPONSE', 'The chain returned an unexpected value.');
  const body = literal.slice(1, -1);
  let out = '';
  const bytes: number[] = [];
  const flushBytes = () => { if (bytes.length) { out += new TextDecoder().decode(new Uint8Array(bytes)); bytes.length = 0; } };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== '\\') { flushBytes(); out += c; continue; }
    const n = body[++i];
    const hex = (len: number) => {
      const digits = body.slice(i + 1, i + 1 + len);
      if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(digits)) throw new ChainError('BAD_RESPONSE', 'The chain returned a malformed string.');
      i += len;
      return parseInt(digits, 16);
    };
    switch (n) {
      case 'a': flushBytes(); out += '\x07'; break;
      case 'b': flushBytes(); out += '\b'; break;
      case 'f': flushBytes(); out += '\f'; break;
      case 'n': flushBytes(); out += '\n'; break;
      case 'r': flushBytes(); out += '\r'; break;
      case 't': flushBytes(); out += '\t'; break;
      case 'v': flushBytes(); out += '\v'; break;
      case '\\': flushBytes(); out += '\\'; break;
      case '"': flushBytes(); out += '"'; break;
      case '\'': flushBytes(); out += '\''; break;
      case 'x': bytes.push(hex(2)); break;
      case 'u': flushBytes(); out += String.fromCodePoint(hex(4)); break;
      case 'U': flushBytes(); out += String.fromCodePoint(hex(8)); break;
      default: {
        if (n >= '0' && n <= '7') {
          const digits = body.slice(i, i + 3);
          if (!/^[0-7]{3}$/.test(digits)) throw new ChainError('BAD_RESPONSE', 'The chain returned a malformed string.');
          bytes.push(parseInt(digits, 8));
          i += 2;
          break;
        }
        throw new ChainError('BAD_RESPONSE', 'The chain returned a malformed string.');
      }
    }
  }
  flushBytes();
  return out;
}

export function parseQevalString(raw: string): string {
  const match = /^\((".*") string\)$/s.exec(raw.trim());
  if (!match) throw new ChainError('BAD_RESPONSE', 'The chain returned an unexpected value type.');
  return unquoteGo(match[1]);
}

function decodeBase64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

const TIMEOUT_MS = 10_000;

async function rpc(rpcUrl: string, method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!response.ok) throw new ChainError('RPC_UNAVAILABLE', `The Gno RPC answered ${response.status}. Try again shortly.`);
    const json: unknown = await response.json();
    if (!json || typeof json !== 'object') throw new ChainError('BAD_RESPONSE', 'The Gno RPC returned an unexpected response.');
    const envelope = json as { error?: { message?: string }; result?: unknown };
    if (envelope.error) throw new ChainError('RPC_ERROR', envelope.error.message || 'The Gno RPC returned an error.');
    return envelope.result;
  } catch (error) {
    if (error instanceof ChainError) throw error;
    if (signal?.aborted) throw new ChainError('ABORTED', 'The request was cancelled.');
    if (controller.signal.aborted) throw new ChainError('RPC_TIMEOUT', 'The Gno RPC did not answer in time.');
    throw new ChainError('RPC_UNAVAILABLE', 'The Gno RPC is unreachable. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function qeval(rpcUrl: string, realm: string, expression: string, signal?: AbortSignal): Promise<string> {
  return parseQevalString(await qevalRaw(rpcUrl, realm, expression, signal));
}

// The typed qeval result as returned, e.g. ("g1…" address).
export async function qevalRaw(rpcUrl: string, realm: string, expression: string, signal?: AbortSignal): Promise<string> {
  const result = await rpc(rpcUrl, 'abci_query', { path: 'vm/qeval', data: encodeBase64(`${realm}.${expression}`) }, signal) as { response?: { ResponseBase?: { Error?: unknown; Data?: string | null; Log?: string } } } | undefined;
  const base = result?.response?.ResponseBase;
  if (!base) throw new ChainError('BAD_RESPONSE', 'The Gno RPC returned an unexpected response.');
  if (base.Error) {
    const log = base.Log ?? '';
    if (/package not found|invalid package path|unknown package|not found/i.test(log)) throw new ChainError('REALM_NOT_FOUND', 'The markets contract is not deployed on this network yet.');
    throw new ChainError('QUERY_FAILED', 'The markets contract could not be read.');
  }
  if (typeof base.Data !== 'string') throw new ChainError('BAD_RESPONSE', 'The markets contract returned no data.');
  return decodeBase64(base.Data);
}

export async function fetchStatus(rpcUrl: string, signal?: AbortSignal): Promise<ChainStatus> {
  const result = await rpc(rpcUrl, 'status', {}, signal) as { node_info?: { network?: unknown }; sync_info?: { latest_block_height?: unknown; latest_block_time?: unknown } } | undefined;
  const chainId = result?.node_info?.network;
  const height = Number(result?.sync_info?.latest_block_height);
  const blockTime = Date.parse(String(result?.sync_info?.latest_block_time ?? ''));
  if (typeof chainId !== 'string' || !Number.isSafeInteger(height) || !Number.isFinite(blockTime)) throw new ChainError('BAD_RESPONSE', 'The Gno RPC returned an invalid status.');
  return { chainId, height, blockTime: Math.floor(blockTime / 1000) };
}

// ---- validation

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
function str(o: Json, key: string, max = 40_000): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length > max) throw new ChainError('BAD_RESPONSE', `The markets contract returned an invalid ${key}.`);
  return v;
}
function int(o: Json, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new ChainError('BAD_RESPONSE', `The markets contract returned an invalid ${key}.`);
  return v;
}
function big(o: Json, key: string): bigint {
  const v = o[key];
  if (typeof v !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(v)) throw new ChainError('BAD_RESPONSE', `The markets contract returned an invalid ${key}.`);
  return BigInt(v);
}
function bool(o: Json, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new ChainError('BAD_RESPONSE', `The markets contract returned an invalid ${key}.`);
  return v;
}

export function parseMarket(value: unknown, realm = ''): ChainMarket {
  if (!isObject(value)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid market.');
  const yesPricePpm = int(value, 'yesPricePpm');
  if (yesPricePpm <= 0 || yesPricePpm >= 1_000_000) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid quote.');
  const winner = str(value, 'winner', 3);
  if (winner !== '' && winner !== 'Yes' && winner !== 'No') throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid outcome.');
  const finalized = bool(value, 'finalized');
  if (finalized !== (winner !== '')) throw new ChainError('BAD_RESPONSE', 'The markets contract returned a contradictory outcome.');
  const id = str(value, 'id', 64);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid market ID.');
  const historyRaw = value.history;
  if (!Array.isArray(historyRaw) || historyRaw.length === 0 || historyRaw.length > 240) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid quote history.');
  const history = historyRaw.map(point => {
    if (!isObject(point)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid quote history.');
    const p = int(point, 'yesPricePpm');
    if (p <= 0 || p >= 1_000_000) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid quote history.');
    return { at: int(point, 'at'), yesPricePpm: p, noPricePpm: 1_000_000 - p, version: int(point, 'version') };
  });
  return {
    realm, version: 1, noPricePpm: 1_000_000 - yesPricePpm, state: finalized ? 'final' : 'open', outcome: winner, proposedAt: 0,
    feePpm: 0, feesUgnot: 0n, limits: null, treasury: null, quotedAt: history[history.length - 1].at, quoteExpiresAt: null, realmPaused: false, topic: null, labels: { ...YES_NO },
    id, question: str(value, 'question', 1024), rules: str(value, 'rules', 20_000), rulesHash: str(value, 'rulesHash', 64),
    conditionId: str(value, 'conditionId', 66), yesTokenId: str(value, 'yesTokenId', 78), noTokenId: str(value, 'noTokenId', 78),
    closesAt: int(value, 'closesAt'), yesPricePpm, oracle: str(value, 'oracle', 64),
    escrowUgnot: big(value, 'escrowUgnot'), yesMicroShares: big(value, 'yesMicroShares'), noMicroShares: big(value, 'noMicroShares'),
    finalized, winner, evidenceHash: str(value, 'evidenceHash', 64), finalizedAt: int(value, 'finalizedAt'), paidUgnot: big(value, 'paidUgnot'),
    quoteVersion: int(value, 'quoteVersion'), createdAt: int(value, 'createdAt'), volumeUgnot: big(value, 'volumeUgnot'),
    trades: int(value, 'trades'), holders: int(value, 'holders'), history,
  };
}

const PRICE_BAND = (p: number) => p >= 30_000 && p <= 970_000;

// A realm v2 market (contracts/v2/json.gno), normalized to the shared shape.
export function parseMarketV2(value: unknown, realm: string, settings: RealmSettings): ChainMarket {
  if (!isObject(value)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid market.');
  const yesPricePpm = int(value, 'yesPricePpm');
  const noPricePpm = int(value, 'noPricePpm');
  if (!PRICE_BAND(yesPricePpm) || !PRICE_BAND(noPricePpm) || yesPricePpm + noPricePpm < 1_000_000) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid quote.');
  const state = str(value, 'state', 10);
  if (state !== 'open' && state !== 'paused' && state !== 'proposed' && state !== 'final') throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid state.');
  const outcome = str(value, 'outcome', 4);
  if (outcome !== '' && outcome !== 'Yes' && outcome !== 'No' && outcome !== 'Void') throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid outcome.');
  if ((state === 'final' || state === 'proposed') !== (outcome !== '')) throw new ChainError('BAD_RESPONSE', 'The markets contract returned a contradictory outcome.');
  const id = str(value, 'id', 64);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid market ID.');
  const feePpm = int(value, 'feePpm');
  if (feePpm > 70_000) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid fee rate.');
  const historyRaw = value.history;
  if (!Array.isArray(historyRaw) || historyRaw.length === 0 || historyRaw.length > 96) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid quote history.');
  const history = historyRaw.map(point => {
    if (!isObject(point)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid quote history.');
    const yes = int(point, 'yesPricePpm'); const no = int(point, 'noPricePpm');
    if (!PRICE_BAND(yes) || !PRICE_BAND(no)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid quote history.');
    return { at: int(point, 'at'), yesPricePpm: yes, noPricePpm: no, version: int(point, 'version') };
  });
  const quotedAt = int(value, 'quotedAt');
  const final = state === 'final';
  return {
    realm, version: 2, id, question: str(value, 'question', 1024), rules: str(value, 'rules', 20_000), rulesHash: str(value, 'rulesHash', 64),
    conditionId: str(value, 'conditionId', 66), yesTokenId: str(value, 'yesTokenId', 78), noTokenId: str(value, 'noTokenId', 78),
    closesAt: int(value, 'tradingEndsAt'), yesPricePpm, noPricePpm, oracle: str(value, 'oracle', 64),
    escrowUgnot: big(value, 'escrowUgnot'), yesMicroShares: big(value, 'yesMicroShares'), noMicroShares: big(value, 'noMicroShares'),
    finalized: final, winner: final && (outcome === 'Yes' || outcome === 'No') ? outcome : '', evidenceHash: str(value, 'evidenceHash', 64),
    finalizedAt: int(value, 'finalizedAt'), paidUgnot: big(value, 'paidUgnot'),
    quoteVersion: int(value, 'quoteVersion'), createdAt: int(value, 'createdAt'), volumeUgnot: big(value, 'volumeUgnot'),
    trades: int(value, 'trades'), holders: int(value, 'holders'), history,
    state, outcome, proposedAt: int(value, 'proposedAt'), feePpm, feesUgnot: big(value, 'feesUgnot'),
    limits: { trade: big(value, 'maxTradeMicroShares'), holder: big(value, 'maxHolderMicroShares'), side: big(value, 'maxSideMicroShares') },
    treasury: str(value, 'treasury', 64), quotedAt, quoteExpiresAt: quotedAt + settings.quoteTtl, realmPaused: settings.paused,
    topic: typeof value.topic === 'string' && /^[A-Za-z ]{1,24}$/.test(value.topic) ? value.topic : null,
    labels: labelsOf(value),
  };
}

function labelsOf(value: Record<string, unknown>): { Yes: string; No: string } {
  const { yesLabel, noLabel } = value;
  if (yesLabel === undefined && noLabel === undefined) return { ...YES_NO }; // listed before names were recorded
  if (!isOutcomeLabel(yesLabel) || !isOutcomeLabel(noLabel) || yesLabel === noLabel) throw new ChainError('BAD_RESPONSE', 'The markets contract returned invalid outcome names.');
  return { Yes: yesLabel, No: noLabel };
}

export function parseRealmSettings(value: unknown): RealmSettings {
  if (!isObject(value)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned invalid settings.');
  return { quoteTtl: int(value, 'quoteTtl'), paused: bool(value, 'paused'), disputeWindow: int(value, 'disputeWindow') };
}

export function parsePositions(value: unknown, realm = '', version: RealmVersion = 1): ChainPosition[] {
  if (!Array.isArray(value)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned invalid positions.');
  return value.map(entry => {
    if (!isObject(entry) || !isObject(entry.position)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid position.');
    const p = entry.position;
    const shared = { realm, marketId: str(entry, 'marketId', 64), yesMicroShares: big(p, 'yesMicroShares'), noMicroShares: big(p, 'noMicroShares'), spentUgnot: big(p, 'spentUgnot') };
    // v2 deletes a position when it is claimed, so every listed one is open.
    return version === 2 ? { ...shared, feeUgnot: big(p, 'feeUgnot'), claimed: false, paidUgnot: 0n }
      : { ...shared, feeUgnot: 0n, claimed: bool(p, 'claimed'), paidUgnot: big(p, 'paidUgnot') };
  });
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new ChainError('BAD_RESPONSE', 'The markets contract returned malformed data.'); }
}

export async function fetchMarkets(rpcUrl: string, realm: string, signal?: AbortSignal, version: RealmVersion = 1): Promise<ChainMarket[]> {
  if (version === 2) {
    const [settings, value] = await Promise.all([
      qeval(rpcUrl, realm, 'RealmJSON()', signal).then(text => parseRealmSettings(parseJson(text))),
      qeval(rpcUrl, realm, 'MarketsJSON()', signal).then(parseJson),
    ]);
    if (!Array.isArray(value)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned invalid markets.');
    return value.map(item => parseMarketV2(item, realm, settings));
  }
  const value = parseJson(await qeval(rpcUrl, realm, 'MarketsJSON()', signal));
  if (!Array.isArray(value)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned invalid markets.');
  return value.map(item => parseMarket(item, realm));
}

export async function fetchPositions(rpcUrl: string, realm: string, owner: string, signal?: AbortSignal, version: RealmVersion = 1): Promise<ChainPosition[]> {
  if (!/^g1[02-9ac-hj-np-z]{38}$/.test(owner)) throw new ChainError('BAD_ADDRESS', 'The wallet address is not a valid Gno address.');
  return parsePositions(parseJson(await qeval(rpcUrl, realm, `PositionsJSON("${owner}")`, signal)), realm, version);
}

// ---- exact quote arithmetic, identical to the realm

export function quoteCost(microShares: bigint, pricePpm: bigint): bigint {
  if (microShares <= 0n || pricePpm <= 0n || pricePpm >= SCALE) return 0n;
  const product = microShares * pricePpm;
  return product / SCALE + (product % SCALE === 0n ? 0n : 1n);
}

// Largest share amount whose exact cost does not exceed the spend.
export function sharesForSpend(spendUgnot: bigint, pricePpm: bigint): bigint {
  if (spendUgnot <= 0n || pricePpm <= 0n || pricePpm >= SCALE) return 0n;
  return (spendUgnot * SCALE) / pricePpm;
}

export function outcomePricePpm(market: Pick<ChainMarket, 'yesPricePpm' | 'noPricePpm'>, outcome: 'Yes' | 'No'): bigint {
  return BigInt(outcome === 'Yes' ? market.yesPricePpm : market.noPricePpm);
}

// The v2 service fee, exactly as the realm computes it:
// ceil(microShares × feePpm × price × (10^6 − price) / 10^18) ugnot.
export function feeUgnot(microShares: bigint, pricePpm: bigint, feePpm: number): bigint {
  if (feePpm <= 0 || microShares <= 0n || pricePpm <= 0n || pricePpm >= SCALE) return 0n;
  const product = microShares * BigInt(feePpm) * pricePpm * (SCALE - pricePpm);
  const denominator = 1_000_000_000_000_000_000n;
  return product / denominator + (product % denominator === 0n ? 0n : 1n);
}

// Largest share amount whose cost plus fee does not exceed the spend.
export function sharesForTotal(spendUgnot: bigint, pricePpm: bigint, feePpm: number): bigint {
  let high = sharesForSpend(spendUgnot, pricePpm);
  if (feePpm <= 0) return high;
  let low = 0n;
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    if (quoteCost(mid, pricePpm) + feeUgnot(mid, pricePpm, feePpm) <= spendUgnot) low = mid; else high = mid - 1n;
  }
  return low;
}

// Largest purchase the market's collateral can cover for one outcome. The
// realm requires max(yes, no) shares <= escrow after the purchase.
export function maxPurchase(market: ChainMarket, outcome: 'Yes' | 'No'): { microShares: bigint; costUgnot: bigint } {
  const price = outcomePricePpm(market, outcome);
  const held = outcome === 'Yes' ? market.yesMicroShares : market.noMicroShares;
  const other = outcome === 'Yes' ? market.noMicroShares : market.yesMicroShares;
  const headroom = market.escrowUgnot - held;
  if (headroom <= 0n || other > market.escrowUgnot) return { microShares: 0n, costUgnot: 0n };
  const fits = (shares: bigint) => held + shares <= market.escrowUgnot + quoteCost(shares, price);
  let microShares = (headroom * SCALE) / (SCALE - price);
  // The contract rounds cost up, which can leave room for a few more
  // micro-shares than the exact division; step to the true maximum.
  while (microShares > 0n && !fits(microShares)) microShares -= 1n;
  for (let step = 0; step < 64 && fits(microShares + 1n); step++) microShares += 1n;
  // v2 limits per trade and per market side bound it too.
  if (market.limits) {
    const side = market.limits.side - held;
    microShares = [microShares, market.limits.trade, side > 0n ? side : 0n].reduce((a, b) => (a < b ? a : b));
  }
  return { microShares, costUgnot: quoteCost(microShares, price) + feeUgnot(microShares, price, market.feePpm) };
}

export function formatUgnot(value: bigint, maxDecimals = 6, minDecimals = 2): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  let fraction = (abs % SCALE).toString().padStart(6, '0').slice(0, maxDecimals).replace(/0+$/, '');
  if (fraction.length < minDecimals) fraction = fraction.padEnd(minDecimals, '0');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

// Parse a user-entered GNOT amount into ugnot without floating point.
export function parseGnot(text: string): bigint | null {
  const trimmed = text.trim();
  if (!/^\d{1,12}(\.\d{0,6})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
}

// The realm's administrator (the operator that lists markets and publishes quotes).
// Realm v2's roles, from RealmJSON. An empty role is "".
export interface RolesV2 { administrator: string; quoter: string; guardian: string; lister: string; pendingAdministrator: string; pendingQuoter: string; pendingGuardian: string; pendingLister: string }
export async function fetchRolesV2(rpcUrl: string, realm: string, signal?: AbortSignal): Promise<RolesV2> {
  const value = parseJson(await qeval(rpcUrl, realm, 'RealmJSON()', signal));
  if (!isObject(value)) throw new ChainError('BAD_RESPONSE', 'The markets contract returned invalid settings.');
  const role = (key: string) => { const v = value[key]; if (v === undefined) return ''; if (typeof v !== 'string' || (v !== '' && !/^g1[0-9a-z]{38}$/.test(v))) throw new ChainError('BAD_RESPONSE', `The markets contract returned an invalid ${key}.`); return v; };
  return { administrator: role('administrator'), quoter: role('quoter'), guardian: role('guardian'), lister: role('lister'),
    pendingAdministrator: role('pendingAdministrator'), pendingQuoter: role('pendingQuoter'), pendingGuardian: role('pendingGuardian'), pendingLister: role('pendingLister') };
}

export async function fetchAdministrator(rpcUrl: string, realm: string, signal?: AbortSignal): Promise<string> {
  const raw = await qevalRaw(rpcUrl, realm, 'Administrator()', signal);
  const match = raw.match(/g1[0-9a-z]{38}/);
  if (!match) throw new ChainError('BAD_RESPONSE', 'The markets contract returned an invalid administrator.');
  return match[0];
}
