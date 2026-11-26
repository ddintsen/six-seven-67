// The presentation model of a market in the 67 realms on Onyx testnet. The UI
// reads only this shape, so a value the realm cannot provide is explicitly null
// rather than invented.
import type { Category, Outcome, SettlementState, SourceState, TradingState } from './domain';
import { catalogFor } from './live/catalog';
import { CHAIN } from './live/config';
import type { ChainMarket } from './live/gno';
import { formatUgnot, maxPurchase } from './live/gno';

export type Venue = 'testnet';
const TOPICS: Exclude<Category, 'All'>[] = ['Politics', 'World', 'Economy', 'Crypto', 'Technology', 'Science', 'Culture', 'Sports'];
export interface PricePoint { at: number | null; yes: number }
export interface MarketView {
  venue: Venue;
  id: string;
  question: string;
  category: Exclude<Category, 'All'> | null;
  rules: string;
  closesAt: number; // unix seconds
  resolvesAt: number | null;
  yesPrice: number; // 0..1, the published Yes price per one-unit payout
  quoteVersion: number;
  quoteAvailable: boolean;
  trading: TradingState;
  source: SourceState;
  settlement: SettlementState;
  finalOutcome: Outcome | null;
  history: PricePoint[];
  unit: 'GNOT';
  stats: { volume: string; trades: number; holders: number } | null;
  // Largest spend the venue can currently accept per outcome, in display units.
  limit: Record<Outcome, string>;
  chain: ChainMarket;
  sourceLink: string | null;
}

export function fromChain(market: ChainMarket, now: number): MarketView {
  const meta = catalogFor(market.id, market.conditionId);
  // v2 carries its topic on chain; v1 markets take theirs from catalog.json.
  const topic = TOPICS.find(t => t === market.topic) ?? meta?.category ?? null;
  // v2 adds a pause, a proposed outcome that stops trading, and quotes that expire.
  const paused = market.state === 'paused' || market.realmPaused;
  const open = (market.state === 'open' || market.state === 'paused') && now < market.closesAt;
  const fresh = market.quoteExpiresAt === null || now <= market.quoteExpiresAt;
  const yes = maxPurchase(market, 'Yes');
  const no = maxPurchase(market, 'No');
  return {
    venue: 'testnet', id: market.id, question: market.question, category: topic, rules: market.rules,
    closesAt: market.closesAt, resolvesAt: null,
    yesPrice: market.yesPricePpm / 1_000_000, quoteVersion: market.quoteVersion,
    quoteAvailable: open && fresh && (yes.costUgnot > 0n || no.costUgnot > 0n),
    trading: !open ? 'closed' : paused ? 'paused' : 'open',
    source: market.finalized ? 'final' : market.state === 'proposed' ? 'proposed' : 'awaiting',
    settlement: market.finalized ? 'confirmed' : 'not_ready',
    finalOutcome: market.winner || null,
    history: market.history.map(point => ({ at: point.at, yes: point.yesPricePpm / 1_000_000 })),
    unit: 'GNOT',
    stats: { volume: formatUgnot(market.volumeUgnot, 2), trades: market.trades, holders: market.holders },
    limit: { Yes: formatUgnot(yes.costUgnot, 2), No: formatUgnot(no.costUgnot, 2) },
    chain: market,
    sourceLink: meta ? `https://polymarket.com/event/${meta.eventSlug}` : null,
  };
}

export function priceOf(market: MarketView, outcome: Outcome): number {
  return (outcome === 'Yes' ? market.chain.yesPricePpm : market.chain.noPricePpm) / 1_000_000;
}

// One short state label per market. A v1 market is open, closed or final; v2
// adds paused, a proposed outcome and Void.
export function stateLabel(market: MarketView): string {
  if (market.finalOutcome) return `${market.finalOutcome} won`;
  if (market.chain.outcome === 'Void' && market.chain.finalized) return 'Void, refunds open';
  if (market.source === 'proposed') return `${market.chain.outcome} proposed`;
  if (market.trading === 'paused') return 'Paused';
  return market.trading === 'open' ? 'Trading' : 'Awaiting outcome';
}

export function canTrade(market: MarketView): boolean {
  return market.trading === 'open' && market.source === 'awaiting' && market.quoteAvailable;
}

export function chainNow(blockTime: number | undefined): number {
  return blockTime ?? Math.floor(Date.now() / 1000);
}

export const unitLabel = (_market: Pick<MarketView, 'unit'>) => 'GNOT';
export const chainName = CHAIN.chainName;
