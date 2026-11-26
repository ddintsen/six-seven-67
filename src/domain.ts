export type Outcome = 'Yes' | 'No';
export type TradingState = 'open' | 'closed' | 'paused';
export type SourceState = 'awaiting' | 'proposed' | 'disputed' | 'final' | 'stale' | 'unavailable' | 'mismatch' | 'invalid';
export type SettlementState = 'not_ready' | 'pending' | 'confirmed';
export type Category = 'All' | 'Politics' | 'World' | 'Economy' | 'Crypto' | 'Technology' | 'Science' | 'Culture' | 'Sports';
export interface Market {
  id: string; question: string; category: Exclude<Category, 'All'>;
  description: string; yesPrice: number; quoteVersion: number; quoteAvailable: boolean; liquidity: number;
  closesAt: string; resolvesAt: string; trading: TradingState; source: SourceState;
  settlement: SettlementState; finalOutcome?: Outcome;
  rules: string; rulesVersion: string; sourceUrl: string; sourceId: string;
  history: number[]; evidence: string; sourceObservedAt: string;
}
export interface Position {
  id: string; marketId: string; outcome: Outcome; shares: number; cost: number;
  example: boolean; openedAt: string; proceeds?: number; settledAt?: string;
}
export interface Transaction {
  id: string; marketId: string; outcome: Outcome; spend: number; shares: number; createdAt: string;
}
export interface DemoState {
  walletConnected: boolean; balance: number; positions: Position[]; transactions: Transaction[];
  marketOverrides: Record<string, Partial<Market>>; storageNotice: string | null;
}
export interface TradeInput {
  id: string; marketId: string; outcome: Outcome; spend: number; unitPrice: number; quoteVersion: number;
}
export type MarketScenario = 'normal' | 'no_liquidity' | 'quote_unavailable' | 'stale' | 'unavailable' | 'mismatch' | 'paused' | 'invalid' | 'awaiting' | 'proposed' | 'disputed' | 'final_yes' | 'final_no';
export type TradeBehavior = 'success' | 'rejected' | 'failed' | 'changed';
const moneyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantityFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const money = (value: number) => moneyFormatter.format(value);
export const quantity = (value: number) => quantityFormatter.format(value);
export function priceFor(market: Market, outcome: Outcome): number { return outcome === 'Yes' ? market.yesPrice : 1 - market.yesPrice; }
export function lifecycle(market: Market): string {
  if (market.settlement === 'confirmed') return 'Settled';
  if (market.source === 'disputed') return 'Disputed';
  if (market.source === 'invalid') return 'Invalid';
  if (market.trading === 'paused') return 'Paused';
  if (market.source === 'final') return 'Settlement pending';
  if (market.source === 'proposed') return 'Outcome under review';
  if (market.trading === 'closed') return 'Awaiting outcome';
  return 'Trading';
}
