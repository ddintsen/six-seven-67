// Read-only Onyx evidence for a Markets v2 lifecycle or a Trade Window room.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { fetchStatus, parseMarketV2, parseRealmSettings, qeval, type ChainStatus } from '../../src/live/gno.ts';
import { decide, evidenceHash } from '../../src/live/oracle.ts';
import { fetchClob } from '../../src/live/polymarket.ts';
import { readAgreedSettlement } from '../../src/live/polygon.ts';

const RPC = 'https://rpc.onyx.testnets.gno.land';
const INDEXER = 'https://indexer.onyx.testnets.gno.land/graphql/query';
const GNOWEB = 'https://onyx.testnets.gno.land/r/';
const MARKET_REALM = 'gno.land/r/nym-sixseven067/markets/v2';
const ROOMS_REALM = 'gno.land/r/nym-tradewindow001/rooms';
const MAX_TRANSACTIONS = 100;
const INDEX_QUERY = 'query OnyxEvidence($filter: FilterTransaction!, $limit: Int!) { latestBlockHeight getTransactions(where: $filter, limit: $limit) { hash block_height success } }';

type EventAttribute = { key: string; value: string };
type RawEvent = {
  '@type'?: string; type?: string; pkg_path?: string; attrs?: EventAttribute[];
  from?: string; to?: string; coins?: string; bytes_delta?: string; fee_delta?: string;
};
type TxResult = {
  hash: string; height: string; index: number; tx: string;
  tx_result: { GasUsed: string; ResponseBase: { Error?: unknown; Events?: RawEvent[] } };
};
type IndexedTx = { hash: string; block_height: number; success: boolean };
type IndexedResult = { data?: { latestBlockHeight: number; getTransactions: IndexedTx[] }; errors?: { message: string }[] };
type Receipt = {
  hash: string; height: number; index: number; url: string; gasUsed: string;
  events: { type: string; attributes: Record<string, string> }[];
  transfers: RawEvent[]; storageDeposits: RawEvent[];
};
type Trace = { indexedHeight: number; atLimit: boolean; receipts: Receipt[] };
type Selection = { kind: 'market' | 'room'; id: string };

export function selection(args: string[]): Selection {
  const [kind, id] = args;
  if (args.length === 2 && kind === 'market' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return { kind, id };
  if (args.length === 2 && kind === 'room' && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))) return { kind, id };
  throw new Error('Usage: node ops/watcher/onyx-evidence.ts market <market-id> | room <room-id>');
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(new URL(url).hostname + ' answered HTTP ' + response.status);
  return await response.json() as T;
}

function hexHash(value: string): string {
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toUpperCase();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('Invalid transaction hash');
  return Buffer.from(value, 'base64').toString('hex').toUpperCase();
}

export function verifyReceipt(tx: TxResult, candidate: IndexedTx, realm: string, key: string, id: string, types: string[]): Receipt {
  const hash = hexHash(candidate.hash);
  const bytesHash = createHash('sha256').update(Buffer.from(tx.tx, 'base64')).digest('hex').toUpperCase();
  const height = Number(tx.height);
  if (hexHash(tx.hash) !== hash || bytesHash !== hash || height !== candidate.block_height || tx.tx_result.ResponseBase.Error) {
    throw new Error('Onyx RPC does not confirm the successful indexed transaction ' + hash);
  }
  const raw = tx.tx_result.ResponseBase.Events ?? [];
  const events = raw.flatMap(event => {
    if (event.pkg_path !== realm || !event.type || !types.includes(event.type)) return [];
    const attributes = Object.fromEntries((event.attrs ?? []).map(({ key, value }) => [key, value]));
    return attributes[key] === id ? [{ type: event.type, attributes }] : [];
  });
  if (!events.length) throw new Error('The indexed transaction lacks the expected event: ' + hash);
  return {
    hash, height, index: tx.index, url: RPC + '/tx?hash=0x' + hash, gasUsed: tx.tx_result.GasUsed, events,
    transfers: raw.filter(event => event['@type'] === '/bank.TransferEvent' || event.type === 'Transfer'),
    storageDeposits: raw.filter(event => event['@type'] === '/tm.StorageDepositEvent'),
  };
}

async function traceFor(realm: string, key: string, id: string, types: string[]): Promise<Trace> {
  const filter = {
    success: { eq: true },
    _or: types.map(type => ({
      response: { events: { GnoEvent: { type: { eq: type }, pkg_path: { eq: realm }, attrs: { key: { eq: key }, value: { eq: id } } } } },
    })),
  };
  const result = await fetchJson<IndexedResult>(INDEXER, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: INDEX_QUERY, variables: { filter, limit: MAX_TRANSACTIONS } }),
  });
  const data = result.data;
  if (result.errors?.length || !data || !Number.isSafeInteger(data.latestBlockHeight) || !Array.isArray(data.getTransactions)) {
    throw new Error('Onyx indexer query failed: ' + (result.errors?.[0]?.message ?? 'invalid response'));
  }
  const receipts: Receipt[] = [];
  for (let offset = 0; offset < data.getTransactions.length; offset += 6) {
    const batch = data.getTransactions.slice(offset, offset + 6);
    receipts.push(...await Promise.all(batch.map(async candidate => {
      if (candidate.success !== true) throw new Error('Onyx indexer returned an unsuccessful transaction');
      const response = await fetchJson<{ result?: TxResult; error?: { message: string } }>(RPC + '/tx?hash=0x' + hexHash(candidate.hash));
      if (!response.result || response.error) throw new Error('Onyx receipt unavailable: ' + (response.error?.message ?? candidate.hash));
      return verifyReceipt(response.result, candidate, realm, key, id, types);
    })));
  }
  return {
    indexedHeight: data.latestBlockHeight, atLimit: data.getTransactions.length >= MAX_TRANSACTIONS,
    receipts: receipts.sort((a, b) => a.height - b.height || a.index - b.index),
  };
}

async function readJson(realm: string, expression: string): Promise<unknown> {
  return JSON.parse(await qeval(RPC, realm, expression));
}

export function marketPhase(state: string, proposedAt: number, disputeWindow: number, chainTime: number, holders: number, payout: bigint) {
  if (state === 'proposed') {
    const finalFrom = proposedAt + disputeWindow;
    return {
      next: chainTime >= finalFrom ? 'Finalize' : 'Dispute window',
      finalFrom: new Date(finalFrom * 1000).toISOString(),
    };
  }
  if (state === 'final') {
    const next = holders > 0 ? 'Claim if eligible' : payout > 0n ? 'Payout recorded' : 'No open positions';
    return { next, finalFrom: null };
  }
  return { next: 'Awaiting proposal', finalFrom: null };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The requested Onyx record was not found');
  return value as Record<string, unknown>;
}

function readAmount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) throw new Error('Invalid on-chain amount');
  return BigInt(value);
}

async function marketReport(id: string, chain: ChainStatus) {
  const [realm, rawMarket, trace] = await Promise.all([
    readJson(MARKET_REALM, 'RealmJSON()'),
    readJson(MARKET_REALM, 'MarketJSON("' + id + '")'),
    traceFor(MARKET_REALM, 'market', id, ['Bought', 'OutcomeProposed', 'ProposalCancelled', 'Finalized', 'Claimed']),
  ]);
  const settings = parseRealmSettings(realm);
  const market = parseMarketV2(rawMarket, MARKET_REALM, settings);
  const raw = asRecord(rawMarket);
  if (market.id !== id) throw new Error('The realm returned a different market');
  const [clob, polygon] = await Promise.all([
    fetchClob(market.conditionId, market.yesTokenId).catch(() => null),
    readAgreedSettlement(market.conditionId),
  ]);
  const decision = await decide(MARKET_REALM, market, chain.blockTime, clob, polygon);
  const computed = decision.evidence ? await evidenceHash(decision.evidence) : null;
  const onChain = market.evidenceHash || null;
  const result = !onChain ? 'no on-chain commitment' : !computed ? 'source unavailable or disagrees' : computed === onChain ? 'verified' : 'mismatch';
  const costRefund = readAmount(raw.refundedCostUgnot);
  const feeRefund = readAmount(raw.refundedFeesUgnot);
  const payout = market.outcome === 'Void' ? costRefund + feeRefund : market.paidUgnot;
  return {
    chain, id, url: GNOWEB + 'nym-sixseven067/markets/v2:' + id, question: market.question,
    state: market.state, outcome: market.outcome, oracle: market.oracle,
    phase: marketPhase(market.state, market.proposedAt, settings.disputeWindow, chain.blockTime, market.holders, payout),
    trades: market.trades, holders: market.holders, paidUgnot: String(market.paidUgnot),
    refundedCostUgnot: String(costRefund), refundedFeesUgnot: String(feeRefund),
    evidence: { result, onChain, computed, matchingPolygonRpc: polygon.agreed, record: decision.evidence },
    alerts: decision.alerts, ...trace,
  };
}

async function roomReport(id: string, chain: ChainStatus) {
  const [value, trace] = await Promise.all([
    readJson(ROOMS_REALM, 'RoomJSON(' + id + ')'),
    traceFor(ROOMS_REALM, 'id', id, ['RoomOpened', 'RoomJoined', 'Deposited', 'Withdrawn', 'Locked', 'Unlocked', 'Offered', 'Filled', 'Settled', 'Cancelled']),
  ]);
  const room = asRecord(value);
  if (String(room.id) !== id) throw new Error('The realm returned a different room');
  const settlement = room.status === 'settled'
    ? trace.receipts.find(receipt => receipt.events.some(event => event.type === 'Settled' && event.attributes.version === String(room.version)))
    : undefined;
  return {
    chain, id, url: GNOWEB + 'nym-tradewindow001/rooms:room/' + id, room,
    settlement: settlement ? { hash: settlement.hash, height: settlement.height, gasUsed: settlement.gasUsed } : null,
    ...trace,
  };
}

async function main() {
  const { kind, id } = selection(process.argv.slice(2));
  const chain = await fetchStatus(RPC);
  if (chain.chainId !== 'onyx-1') throw new Error('Expected onyx-1, got ' + chain.chainId);
  const report = kind === 'market' ? await marketReport(id, chain) : await roomReport(id, chain);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
