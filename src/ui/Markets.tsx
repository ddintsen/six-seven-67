import { useState } from 'react';
import EmptyState from './EmptyState';
import { NOT_FOUND, PLOT_WAITING } from '../brand/scenes';
import type { Category } from '../domain';
import { CHAIN } from '../live/config';
import type { ChainMarket, ChainStatus } from '../live/gno';
import { refreshMarkets } from '../live/store';
import type { Load } from '../live/store';
import { canTrade, priceOf } from '../view';
import type { MarketView } from '../view';
import { QuoteFreshness } from './QuoteFreshness';
import { PriceChart } from './Chart';
import Catalogue from './Catalogue';
import { MarketThumb } from './MarketThumb';
import { useMarketImages } from '../live/images';
import { usePolymarketHistory } from '../live/history';
import { formatClock, formatDay, formatPrice } from './format';

export const categories: Category[] = ['All', 'Politics', 'World', 'Economy', 'Crypto', 'Technology', 'Science', 'Culture', 'Sports'];

interface Props {
  markets: MarketView[] | null;
  load: Load<ChainMarket[]>;
  chain: ChainStatus | null;
  query: string;
  category: Category;
  onCategory: (value: Category) => void;
  onClear: () => void;
  onQuery: (value: string) => void;
}

function OutcomeLinks({ market, size = 'row' }: { market: MarketView; size?: 'row' | 'lead' }) {
  if (!canTrade(market)) {
    const chain = market.chain;
    const named = (value: string) => value === 'Yes' || value === 'No' ? market.chain.labels[value] : value;
    const text = market.finalOutcome ? `${named(market.finalOutcome)} won` : chain?.finalized && chain.outcome === 'Void' ? 'Void, refunds open'
      : market.source === 'proposed' ? `${named(chain?.outcome ?? '')} proposed` : market.trading === 'paused' ? 'Paused'
        : market.trading === 'open' ? 'Quote unavailable' : 'Trading closed';
    return <p className={`outcome-closed outcome-closed-${size}`}>{text}</p>;
  }
  return (
    <div className={`outcome-links outcome-links-${size}${market.chain.labels.Yes !== 'Yes' ? ' named' : ''}`}>
      <a className="outcome-link yes" href={`#/market/${market.id}?outcome=Yes`} aria-label={`${market.chain.labels.Yes} ${formatPrice(priceOf(market, 'Yes'))}`}>
        <span>{market.chain.labels.Yes}</span><strong>{formatPrice(priceOf(market, 'Yes'))}</strong>
      </a>
      <a className="outcome-link no" href={`#/market/${market.id}?outcome=No`} aria-label={`${market.chain.labels.No} ${formatPrice(priceOf(market, 'No'))}`}>
        <span>{market.chain.labels.No}</span><strong>{formatPrice(priceOf(market, 'No'))}</strong>
      </a>
    </div>
  );
}

function VenueNote({ load, chain, count }: { load: Load<ChainMarket[]>; chain: ChainStatus | null; count: number }) {
  const retained = load.status === 'error' && load.data;
  return (
    <p className="venue-note">
      <span className="venue-mark testnet">{CHAIN.chainName}</span>
      {load.status === 'error' && !load.data ? <span>Contract unavailable.</span> : 'data' in load && load.data ? <span>{count} {count === 1 ? 'market' : 'markets'} on the 67 contract, priced in test GNOT.</span> : <span>Reading the 67 contract.</span>}
      {chain && !retained && <span className="venue-meta">Block {chain.height.toLocaleString('en-US')}</span>}
      {retained && load.observedAt && <span className="venue-meta caution">Showing data read at {formatClock(load.observedAt / 1000)} UTC</span>}
    </p>
  );
}

export default function Markets({ markets, load, chain, query, category, onCategory, onClear, onQuery }: Props) {
  const [sort, setSort] = useState('listed');
  const all = markets ?? [];
  const imageOf = useMarketImages(all.map(m => m.chain.conditionId));
  const filtered = all.filter(market => (category === 'All' || market.category === category) && market.question.toLowerCase().includes(query.toLowerCase()));
  const sorted = [...filtered];
  if (sort === 'closing') sorted.sort((a, b) => a.closesAt - b.closesAt);
  if (sort === 'price') sorted.sort((a, b) => b.yesPrice - a.yesPrice);
  if (sort === 'volume') sorted.sort((a, b) => (b.chain?.volumeUgnot ?? 0n) > (a.chain?.volumeUgnot ?? 0n) ? 1 : -1);
  // The lead is the first open market in the current order, so a settled
  // question never takes the most prominent position.
  const leadIndex = Math.max(0, sorted.findIndex(canTrade));
  const lead = sorted[leadIndex];
  const leadReference = usePolymarketHistory(lead && canTrade(lead) ? lead.chain.yesTokenId : null);
  const rows = sorted.filter((_, index) => index !== leadIndex);
  const filtering = Boolean(query) || category !== 'All';

  let body;
  if (!markets) {
    if (load.status === 'error') {
      body = load.code === 'REALM_NOT_FOUND'
        ? <EmptyState scene={PLOT_WAITING} title={`The 67 contract is not on ${CHAIN.chainName} yet`}
          action={<a className="button primary" href="#/how">How it works</a>}>
          Markets appear here once the contract is deployed.
        </EmptyState>
        : <section className="page-state"><h2>Markets could not be read</h2><p>{load.message}</p><button type="button" className="button" onClick={() => void refreshMarkets()}>Try again</button></section>;
    } else {
      body = <section className="page-state" aria-busy="true"><h2>Reading markets from {CHAIN.chainName}</h2><p>Questions, quotes and volume come straight from the 67 contract.</p></section>;
    }
  } else if (!lead && filtering) {
    // Polymarket's own markets follow below, so a short line is enough here.
    body = <section className="page-state compact"><h2>Nothing on 67 matches yet</h2><p>{query ? 'No listed market matches this search.' : 'No market in this topic is listed on 67 yet.'} Polymarket’s markets are below.</p></section>;
  } else if (!lead) {
    body = filtering
      ? <EmptyState scene={NOT_FOUND} title="No questions found" action={<button type="button" className="button" onClick={onClear}>Clear filters</button>}>Try another search or explore all topics.</EmptyState>
      : <EmptyState scene={PLOT_WAITING} title="No markets yet">New questions appear here when the operator lists them.</EmptyState>;
  } else {
    const change = lead.history.length > 1 ? Math.round((lead.history[lead.history.length - 1].yes - lead.history[0].yes) * 100) : 0;
    body = <>
      <section className="lead" aria-labelledby="lead-question">
        <div className="lead-copy">
          <div className="lead-title">
            <MarketThumb src={imageOf(lead.chain.conditionId)} size="lead" />
            <a href={`#/market/${lead.id}`} data-market-id={lead.id} className="question-link">
              <h2 id="lead-question" className="lead-question" style={{ viewTransitionName: `question-${lead.id}` }}>{lead.question}</h2>
            </a>
          </div>
          <dl className="lead-facts">
            <div><dt>Trading closes</dt><dd>{formatDay(lead.closesAt)}</dd></div>
            {lead.stats && <div><dt>Volume</dt><dd>{lead.stats.volume} GNOT</dd></div>}
            {lead.stats && <div><dt>Trades</dt><dd>{lead.stats.trades}</dd></div>}
          </dl>
          <OutcomeLinks market={lead} size="lead" />
        </div>
        <div className="lead-quote">
          <div className="quote-figure">
            <p className="quote-number">{Math.round(lead.yesPrice * 100)}<span>%</span></p>
            <div>
              <p className="quote-label">{lead.chain.labels.Yes} price</p>
              <p className="quote-sub">{formatPrice(lead.yesPrice)} {lead.unit} per share{change !== 0 && <>, {change > 0 ? 'up' : 'down'} {Math.abs(change)} {Math.abs(change) === 1 ? 'point' : 'points'} since listing</>}</p>
              <QuoteFreshness market={lead} />
            </div>
          </div>
          <PriceChart question={lead.question} points={lead.history} unit={lead.unit} until={chain?.blockTime} reference={leadReference} compact />
        </div>
      </section>

      <section className="market-list" aria-labelledby="more-questions">
        <div className="list-heading">
          <h2 id="more-questions">{filtering ? 'Matching questions' : 'More questions'} <span className="count">{filtering ? sorted.length : rows.length}</span></h2>
          <label className="sort-field"><span className="sr-only">Sort by</span>
            <select value={sort} onChange={event => setSort(event.target.value)}>
              <option value="listed">Listing order</option>
              <option value="closing">Closing soon</option>
              <option value="price">Yes price</option>
              <option value="volume">Volume</option>
            </select>
          </label>
        </div>
        {rows.length === 0 ? <p className="list-end">All matching questions are shown above.</p> : (
          <div className="rows rows-testnet">
            <div className="rows-head" aria-hidden="true"><span>Question</span><span>Closes</span><span>Volume</span><span>Buy</span></div>
            {rows.map(market => (
              <article key={market.id} className="row">
                <div className="row-copy">
                  <MarketThumb src={imageOf(market.chain.conditionId)} />
                  <a href={`#/market/${market.id}`} data-market-id={market.id} className="question-link">
                    <h3 style={{ viewTransitionName: `question-${market.id}` }}>{market.question}</h3>
                  </a>
                </div>
                <p className="row-date"><span className="row-label">Closes </span>{formatDay(market.closesAt)}</p>
                <p className="row-volume">{market.stats ? <><span className="row-label">Volume </span>{market.stats.volume} GNOT</> : null}</p>
                <OutcomeLinks market={market} />
              </article>
            ))}
          </div>
        )}
      </section>
    </>;
  }

  return (
    <div className="markets-page">
      <div className="page-head">
        <div className="page-title">
          <h1>Big questions. Questionable confidence.</h1>
          <VenueNote load={load} chain={chain} count={all.length} />
        </div>
        <div className="page-tools">
          {/* Search and topics appear only when there is something to narrow. */}
          {all.length > 0 && (
            <label className="search-field">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
              <input type="search" aria-label="Search questions" placeholder="Search questions" value={query} onChange={event => onQuery(event.target.value)} />
            </label>
          )}
        </div>
      </div>
      {all.length > 0 && (
        <nav className="topics" aria-label="Market topics">
          {categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => onCategory(item)}>{item}</button>)}
        </nav>
      )}
      {body}
      {markets && <Catalogue topic={category} query={query} listed={new Map(all.map(m => [m.chain.conditionId, m.id]))} />}
    </div>
  );
}
