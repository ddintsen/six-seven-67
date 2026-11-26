// Trade activity from the public tx-indexer. It is an observation service, not
// the source of truth: balances and positions always come from the realm.

export interface TradeEvent {
  hash: string; height: number; time: number | null;
  marketId: string; buyer: string; outcome: 'Yes' | 'No';
  microShares: bigint; costUgnot: bigint; pricePpm: number;
}

const QUERY = `query Trades($filter: TransactionFilter!) {
  transactions(filter: $filter) {
    hash block_height success
    response { events { __typename ... on GnoEvent { type pkg_path attrs { key value } } } }
  }
}`;
const BLOCKS = `query Blocks($filter: BlockFilter!) { blocks(filter: $filter) { height time } }`;

async function gql(url: string, query: string, variables: unknown, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }), signal: controller.signal });
    if (!response.ok) throw new Error(`Indexer answered ${response.status}`);
    const json = await response.json() as { data?: unknown; errors?: { message?: string }[] };
    if (json.errors?.length) throw new Error(json.errors[0].message || 'Indexer error');
    return json.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

type RawTx = { hash?: unknown; block_height?: unknown; success?: unknown; response?: { events?: { __typename?: string; type?: string; pkg_path?: string; attrs?: { key?: string; value?: string }[] }[] } };

export function parseTrades(transactions: unknown, realm: string): TradeEvent[] {
  if (!Array.isArray(transactions)) return [];
  const trades: TradeEvent[] = [];
  for (const tx of transactions as RawTx[]) {
    if (tx?.success !== true || typeof tx.hash !== 'string' || typeof tx.block_height !== 'number') continue;
    for (const event of tx.response?.events ?? []) {
      if (event?.__typename !== 'GnoEvent' || event.type !== 'Bought' || event.pkg_path !== realm) continue;
      const attrs = new Map((event.attrs ?? []).map(a => [a.key, a.value]));
      const outcome = attrs.get('outcome');
      const shares = attrs.get('microShares'); const cost = attrs.get('costUgnot'); const price = attrs.get('pricePpm');
      if ((outcome !== 'Yes' && outcome !== 'No') || !/^\d{1,19}$/.test(shares ?? '') || !/^\d{1,19}$/.test(cost ?? '') || !/^\d{1,7}$/.test(price ?? '')) continue;
      const marketId = attrs.get('market'); const buyer = attrs.get('buyer');
      if (!marketId || !buyer) continue;
      trades.push({ hash: tx.hash, height: tx.block_height, time: null, marketId, buyer, outcome, microShares: BigInt(shares!), costUgnot: BigInt(cost!), pricePpm: Number(price) });
    }
  }
  return trades.sort((a, b) => b.height - a.height);
}

export async function fetchTrades(url: string, realm: string, signal?: AbortSignal, limit = 40, buyer?: string): Promise<TradeEvent[]> {
  const exec: Record<string, string> = { pkg_path: realm, func: 'Buy' };
  if (buyer) exec.caller = buyer;
  const data = await gql(url, QUERY, { filter: { success: true, message: [{ route: 'vm', vm_param: { exec } }] } }, signal) as { transactions?: unknown };
  const trades = parseTrades(data?.transactions, realm).filter(trade => !buyer || trade.buyer === buyer).slice(0, limit);
  // Block times come from a separate query; fetch only the heights we show.
  const heights = [...new Set(trades.map(trade => trade.height))];
  const times = new Map<number, number>();
  await Promise.all(heights.map(async height => {
    try {
      const blocks = await gql(url, BLOCKS, { filter: { from_height: height, to_height: height } }, signal) as { blocks?: { height?: number; time?: string }[] };
      const block = blocks?.blocks?.find(b => b.height === height);
      const time = block?.time ? Date.parse(block.time) : NaN;
      if (Number.isFinite(time)) times.set(height, Math.floor(time / 1000));
    } catch { /* a missing time stays unknown */ }
  }));
  return trades.map(trade => ({ ...trade, time: times.get(trade.height) ?? null }));
}
