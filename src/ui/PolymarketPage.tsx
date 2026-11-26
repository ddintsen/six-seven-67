// The page of a Polymarket market that 67 has not listed: what it asks, what
// Polymarket shows, and why it cannot be traded here yet.
import { useEffect, useState } from 'react';
import { fetchCatalogueMarket, formatChance, formatUsd, polymarketEventUrl } from '../live/gamma';
import type { CatalogueMarket } from '../live/gamma';
import { usePolymarketHistory } from '../live/history';
import { PriceChart } from './Chart';
import { Rules } from './MarketPage';
import { MarketThumb } from './MarketThumb';
import { formatDayTime, formatPrice } from './format';

type State = { status: 'loading' } | { status: 'ready'; market: CatalogueMarket } | { status: 'missing' } | { status: 'error' };

export default function PolymarketPage({ conditionId, listedId, backHref }: { conditionId: string; listedId: string | null; backHref: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (listedId) { window.location.replace(`#/market/${encodeURIComponent(listedId)}`); return; }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchCatalogueMarket(conditionId, { signal: controller.signal })
      .then(market => { if (!controller.signal.aborted) setState(market ? { status: 'ready', market } : { status: 'missing' }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }); });
    return () => controller.abort();
  }, [conditionId, listedId, attempt]);

  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.market.question} | 67`;
  }, [state]);

  // Polymarket's price over the last month, for the first outcome.
  const history = usePolymarketHistory(state.status === 'ready' ? state.market.yesTokenId : null);

  if (state.status !== 'ready') {
    return (
      <div className="market-page">
        <a className="back-link" href={backHref}>All markets</a>
        <section className="page-state" aria-busy={state.status === 'loading'}>
          {state.status === 'loading' && <><h1>Reading Polymarket</h1><p>The question, its rules and its prices come from Polymarket.</p></>}
          {state.status === 'missing' && <><h1>This market is not open on Polymarket</h1><p>It may have closed or been removed. Every open market is in the list.</p><a className="button" href={backHref}>All markets</a></>}
          {state.status === 'error' && <><h1>Polymarket could not be read</h1><p>Nothing is wrong with 67; Polymarket did not answer.</p><button type="button" className="button" onClick={() => setAttempt(a => a + 1)}>Try again</button></>}
        </section>
      </div>
    );
  }

  const m = state.market;
  return (
    <div className="market-page">
      <a className="back-link" href={backHref}>All markets</a>
      <div className="market-layout">
        <article className="market-main">
          <header className="market-head">
            <div className="market-title">
              <MarketThumb src={m.image} size="page" />
              <h1>{m.question}</h1>
            </div>
            <dl className="market-facts">
              {m.endsAt && <div><dt>Ends on Polymarket</dt><dd><time dateTime={new Date(m.endsAt * 1000).toISOString()}>{formatDayTime(m.endsAt)}</time></dd></div>}
              <div><dt>Volume on Polymarket</dt><dd>{formatUsd(m.volume)}</dd></div>
            </dl>
          </header>

          <section className="detail-chart polymarket-prices" aria-labelledby="prices-heading">
            <h2 id="prices-heading" className="sr-only">Prices on Polymarket</h2>
            <dl className="polymarket-outcomes">
              {m.outcomes.slice(0, 2).map((name, i) => (
                <div key={name}><dt>{name}</dt><dd>{formatChance(m.prices[i])}</dd></div>
              ))}
            </dl>
            {history && <PriceChart question={m.question} outcome={m.outcomes[0]} points={history} unit="USDC" sampled until={history[history.length - 1].at ?? undefined} />}
            <p className="chart-caption">{history ? `${m.outcomes[0]} price on Polymarket over the last month. ` : ''}{m.outcomes.length === 2 && m.prices.every(p => p != null) ? `${m.outcomes[0]} ${formatPrice(m.prices[0]!)}, ${m.outcomes[1]} ${formatPrice(m.prices[1]!)} USDC per share on Polymarket.` : 'As Polymarket last showed it.'}</p>
          </section>

          <div className="ticket-slot">
          <section className="ticket not-listed" aria-labelledby="listed-heading">
            <h2 id="listed-heading">Not on 67 yet</h2>
            <p>{m.binary
              ? 'This question is on Polymarket but not listed in the 67 contract, so it cannot be traded with GNOT yet. Once it is listed, this page becomes its trading page.'
              : `This question is on Polymarket but not listed on 67 yet. The next 67 contract lists markets with named outcomes like ${m.outcomes[0]} and ${m.outcomes[1]}; once it is listed, this page becomes its trading page.`}</p>
            <a className="text-link" href={polymarketEventUrl(m.eventSlug)} target="_blank" rel="noopener noreferrer">See it on Polymarket<span className="sr-only"> (opens in a new tab)</span></a>
          </section>
          </div>

          {m.rules && <Rules text={m.rules} />}
        </article>
      </div>
    </div>
  );
}
