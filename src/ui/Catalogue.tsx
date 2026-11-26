// "More on Polymarket": the live mirror of Polymarket's open markets below the
// markets listed on 67. Read from Polymarket in the browser; a market listed
// on 67 links to its trading page, the rest to a read-only page.
import { useEffect, useRef, useState } from 'react';
import type { Category } from '../domain';
import { fetchCatalogue, formatChance, formatUsd, searchCatalogue } from '../live/gamma';
import type { CatalogueMarket } from '../live/gamma';
import { formatDay } from './format';
import { MarketThumb } from './MarketThumb';

const PAGE = 50;

type State =
  | { status: 'loading'; items: CatalogueMarket[] }
  | { status: 'ready'; items: CatalogueMarket[]; done: boolean }
  | { status: 'error'; items: CatalogueMarket[]; message: string };

export function useCatalogue(topic: Category, query: string) {
  const [state, setState] = useState<State>({ status: 'loading', items: [] });
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const key = `${topic}\u0000${query.trim()}`;
  const keyRef = useRef(key);

  useEffect(() => { setPage(0); }, [key]);

  useEffect(() => {
    const controller = new AbortController();
    const q = query.trim();
    keyRef.current = key;
    setState(previous => ({ status: 'loading', items: page === 0 ? [] : previous.items }));
    // Search waits for typing to pause; topic pages load at once.
    const timer = setTimeout(async () => {
      try {
        const next = q ? await searchCatalogue(q, { signal: controller.signal })
          : await fetchCatalogue({ topic, offset: page * PAGE, limit: PAGE, signal: controller.signal });
        if (controller.signal.aborted || keyRef.current !== key) return;
        setState(previous => {
          const items = page === 0 ? [] : previous.items;
          const seen = new Set(items.map(m => m.conditionId));
          return { status: 'ready', items: [...items, ...next.filter(m => !seen.has(m.conditionId))], done: Boolean(q) || next.length < PAGE / 2 };
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState(previous => ({ status: 'error', items: previous.items, message: (error as Error).message }));
      }
    }, q ? 350 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [key, page, topic, query, attempt]);

  return { state, more: () => setPage(p => p + 1), retry: () => setAttempt(a => a + 1) };
}

function Price({ market }: { market: CatalogueMarket }) {
  const [first, second] = [0, 1].map(i => ({ name: market.outcomes[i], price: market.prices[i] }));
  return (
    <div className="catalogue-price" aria-label={`${first.name} ${formatChance(first.price)}${second.name ? `, ${second.name} ${formatChance(second.price)}` : ''}`}>
      <span className="catalogue-outcome"><span>{first.name}</span><strong>{formatChance(first.price)}</strong></span>
      {second.name && <span className="catalogue-outcome"><span>{second.name}</span><strong>{formatChance(second.price)}</strong></span>}
    </div>
  );
}

interface Props { topic: Category; query: string; listed: Map<string, string> }

export default function Catalogue({ topic, query, listed }: Props) {
  const { state, more, retry } = useCatalogue(topic, query);
  const items = state.items.filter(m => !listed.has(m.conditionId));
  const searching = Boolean(query.trim());
  return (
    <section className="market-list catalogue" aria-labelledby="catalogue-heading" aria-busy={state.status === 'loading'}>
      <div className="list-heading">
        <h2 id="catalogue-heading">{searching ? 'Matching on Polymarket' : 'More on Polymarket'} {items.length > 0 && <span className="count">{items.length}</span>}</h2>
      </div>
      <p className="catalogue-note">Polymarket’s open markets, live. Prices here are Polymarket’s. A market can be traded on 67 once it is listed in the 67 contract.</p>
      {items.length > 0 && (
        <div className="rows rows-catalogue">
          <div className="rows-head" aria-hidden="true"><span>Question</span><span>Ends</span><span>Volume</span><span>On Polymarket</span></div>
          {items.map(market => (
            <article key={market.conditionId} className="row">
              <div className="row-copy">
                <MarketThumb src={market.image} />
                <a href={`#/polymarket/${market.conditionId}`} className="question-link"><h3>{market.question}</h3></a>
              </div>
              <p className="row-date">{market.endsAt ? <><span className="row-label">Ends </span>{formatDay(market.endsAt)}</> : null}</p>
              <p className="row-volume"><span className="row-label">Volume </span>{formatUsd(market.volume)}</p>
              <Price market={market} />
            </article>
          ))}
        </div>
      )}
      {state.status === 'loading' && <p className="list-end">Reading Polymarket.</p>}
      {state.status === 'error' && <div className="list-end catalogue-error"><p>Polymarket could not be read just now.{items.length > 0 ? ' The markets above were read earlier.' : ''}</p><button type="button" className="button" onClick={retry}>Try again</button></div>}
      {state.status === 'ready' && items.length === 0 && <p className="list-end">{searching ? 'Nothing on Polymarket matches this search.' : 'Every open market in this topic is already on 67.'}</p>}
      {state.status === 'ready' && !state.done && <button type="button" className="button catalogue-more" onClick={more}>Show more</button>}
    </section>
  );
}
