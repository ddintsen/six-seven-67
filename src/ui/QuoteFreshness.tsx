import { useEffect, useState } from 'react';
import { freshnessText } from '../live/freshness';
import { usePolymarketMidpoint } from '../live/midpoint';
import type { MarketView } from '../view';

// Show when 67 posted the quote and when the separate reference was checked.
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
  return <p className="quote-fresh">{freshnessText(market.chain.quotedAt, mid, market.chain.labels.Yes, now)}</p>;
}
