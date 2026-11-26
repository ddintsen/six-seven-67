import { useEffect, useState } from 'react';
import { freshnessText } from '../live/freshness';
import { usePolymarketMidpoint } from '../live/midpoint';
import type { MarketView } from '../view';

// How old 67's price is, and where Polymarket is now when the two differ.
// Shown only while the market trades; the text refreshes every minute.
export function QuoteFreshness({ market }: { market: MarketView }) {
  const open = market.trading === 'open' && !market.chain.finalized;
  const mid = usePolymarketMidpoint(open ? market.chain.yesTokenId : null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(timer);
  }, [open]);
  if (!open) return null;
  return <p className="quote-fresh">{freshnessText(market.chain.quotedAt, market.chain.yesPricePpm, mid, market.chain.labels.Yes, now)}</p>;
}
