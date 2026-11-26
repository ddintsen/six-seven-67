// Polymarket settles every market in its Conditional Tokens contract on
// Polygon. Once payouts are reported they never change, so this is the record
// the oracle relies on (docs/SYSTEM.md, "Talking to the oracle").

export const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
export const POLYGON_RPCS = ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org', 'https://1rpc.io/matic'];

const PAYOUT_DENOMINATOR = '0xdd34de67'; // payoutDenominator(bytes32)
const PAYOUT_NUMERATORS = '0x0504c814'; // payoutNumerators(bytes32,uint256)
const OUTCOME_SLOTS = '0xd42dc0c2'; // getOutcomeSlotCount(bytes32)

export type Settlement =
  | { state: 'unprepared' }
  | { state: 'unresolved' }
  | { state: 'Yes' | 'No' | 'void'; numerators: [string, string]; denominator: string }
  | { state: 'invalid'; numerators: string[]; denominator: string };

export interface PolygonRead { settlement: Settlement | null; agreed: string[]; failed: string[]; note: string }

type Call = (rpc: string, data: string) => Promise<bigint>;

export const ethCall: Call = async (rpc, data) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(rpc, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: CONDITIONAL_TOKENS, data }, 'latest'] }),
    });
    const json = await response.json() as { result?: unknown; error?: unknown };
    if (json.error || typeof json.result !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(json.result)) throw new Error('bad eth_call result');
    return BigInt(json.result);
  } finally {
    clearTimeout(timer);
  }
};

const word = (value: bigint) => value.toString(16).padStart(64, '0');

// The settlement as one RPC sees it. The binary markets we bind have two
// outcome slots in Yes, No order; [1,0] is Yes, [0,1] No, [1,1] a 50-50.
export async function readSettlement(conditionId: string, rpc: string, call: Call = ethCall): Promise<Settlement> {
  if (!/^0x[0-9a-f]{64}$/.test(conditionId)) throw new Error('invalid condition ID');
  const id = conditionId.slice(2);
  const slots = await call(rpc, OUTCOME_SLOTS + id);
  if (slots === 0n) return { state: 'unprepared' };
  const denominator = await call(rpc, PAYOUT_DENOMINATOR + id);
  if (denominator === 0n) return { state: 'unresolved' };
  const numerators: bigint[] = [];
  for (let i = 0n; i < slots; i++) numerators.push(await call(rpc, PAYOUT_NUMERATORS + id + word(i)));
  const text = numerators.map(String);
  if (slots !== 2n) return { state: 'invalid', numerators: text, denominator: String(denominator) };
  const [yes, no] = numerators;
  const pair: [string, string] = [String(yes), String(no)];
  if (yes > 0n && no === 0n) return { state: 'Yes', numerators: pair, denominator: String(denominator) };
  if (yes === 0n && no > 0n) return { state: 'No', numerators: pair, denominator: String(denominator) };
  if (yes > 0n && yes === no) return { state: 'void', numerators: pair, denominator: String(denominator) };
  return { state: 'invalid', numerators: text, denominator: String(denominator) };
}

// Two independent RPCs must return the same settlement; otherwise nothing is
// trusted and the market waits.
export async function readAgreedSettlement(conditionId: string, rpcs: string[] = POLYGON_RPCS, call: Call = ethCall): Promise<PolygonRead> {
  const seen: { rpc: string; key: string; settlement: Settlement }[] = [];
  const failed: string[] = [];
  for (const rpc of rpcs) {
    try {
      const settlement = await readSettlement(conditionId, rpc, call);
      seen.push({ rpc, key: JSON.stringify(settlement), settlement });
    } catch {
      failed.push(rpc);
    }
    const counts = new Map<string, string[]>();
    for (const entry of seen) counts.set(entry.key, [...(counts.get(entry.key) ?? []), entry.rpc]);
    for (const [key, agreed] of counts) {
      if (agreed.length >= 2) return { settlement: JSON.parse(key) as Settlement, agreed, failed, note: 'two RPCs agree' };
    }
  }
  const note = seen.length < 2 ? 'fewer than two Polygon RPCs answered' : 'Polygon RPCs disagree';
  return { settlement: null, agreed: [], failed, note };
}
