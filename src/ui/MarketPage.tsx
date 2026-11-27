import { useEffect, useRef, useState } from 'react';
import type { Outcome } from '../domain';
import { CHAIN, explorerRealmUrl, explorerTxUrl } from '../live/config';
import { DISPUTE_WINDOW, formatUgnot } from '../live/gno';
import type { LiveState } from '../live/store';
import { usePolygonSettlement } from '../live/settlement';
import { canTrade, priceOf } from '../view';
import type { MarketView } from '../view';
import TestnetTicket from './TestnetTicket';
import { PriceChart } from './Chart';
import { QuoteFreshness } from './QuoteFreshness';
import { MarketThumb } from './MarketThumb';
import { useMarketImages } from '../live/images';
import { usePolymarketHistory } from '../live/history';
import { formatDayTime, formatPrice, relativeTime, shortAddress } from './format';


interface Props {
  market: MarketView;
  backHref: string;
  initialOutcome: Outcome;
  live: LiveState;
  onOpenWallet: () => void;
}


export function Rules({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 520;
  return (
    <section className="detail-section rules" aria-labelledby="rules-heading">
      <h2 id="rules-heading">Resolution rules</h2>
      <div id="rules-text" className={`rules-text${long && !open ? ' clamped' : ''}`}>
        {text.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
      {long && <button type="button" className="text-button" aria-expanded={open} aria-controls="rules-text" onClick={() => setOpen(value => !value)}>{open ? 'Show less' : 'Show full rules'}</button>}
    </section>
  );
}

function Trades({ market, live }: { market: MarketView; live: LiveState }) {
  const load = live.trades;
  const trades = 'data' in load && load.data ? load.data.filter(trade => trade.marketId === market.id).slice(0, 8) : [];
  return (
    <section className="detail-section" aria-labelledby="trades-heading">
      <h2 id="trades-heading">Recent trades</h2>
      {load.status === 'loading' && !trades.length && <p className="muted" aria-busy="true">Reading trades from the indexer.</p>}
      {load.status === 'error' && !trades.length && <p className="muted">Trade history is unavailable right now. Positions and prices above come straight from the contract.</p>}
      {load.status === 'ready' && !trades.length && <p className="muted">No trades yet. The first position on this question sets the volume above.</p>}
      {trades.length > 0 && (
        <table className="trades">
          <thead><tr><th scope="col">Side</th><th scope="col">Shares</th><th scope="col">Paid</th><th scope="col">Account</th><th scope="col">Time</th></tr></thead>
          <tbody>{trades.map(trade => {
            const url = explorerTxUrl(trade.hash);
            return (
              <tr key={`${trade.hash}-${trade.buyer}-${trade.outcome}`}>
                <td className={trade.outcome === 'Yes' ? 'yes-text' : 'no-text'}>{market.chain.labels[trade.outcome]}</td>
                <td>{formatUgnot(trade.microShares, 2)}</td>
                <td>{formatUgnot(trade.costUgnot, 2)} GNOT</td>
                <td className="mono">{shortAddress(trade.buyer)}</td>
                <td>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{trade.time ? relativeTime(trade.time) : `Block ${trade.height}`}<span className="sr-only"> (opens in a new tab)</span></a> : trade.time ? relativeTime(trade.time) : `Block ${trade.height}`}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </section>
  );
}

function ContractDetails({ market }: { market: MarketView }) {
  const chain = market.chain;
  const realmUrl = explorerRealmUrl(chain.realm || CHAIN.realm);
  return (
    <section className="detail-section" aria-labelledby="source-heading">
      <h2 id="source-heading">Source and contract</h2>
      <p>This position is held on Gno.land. The contract fixes the question, rules and source at listing.</p>
      <p>{chain.version === 2
        ? 'The oracle proposes the outcome. The guardian can cancel it within 24 hours. After that window, anyone can finalize the proposal and eligible holders can claim.'
        : 'The designated oracle records the final outcome on chain. Eligible holders can then claim their payout.'}</p>
      <div className="source-links">
        {market.sourceLink && <a className="text-link" href={market.sourceLink} target="_blank" rel="noopener noreferrer">Source market on Polymarket<span className="sr-only"> (opens in a new tab)</span></a>}
        {realmUrl && <a className="text-link" href={realmUrl} target="_blank" rel="noopener noreferrer">Contract on {CHAIN.chainName}<span className="sr-only"> (opens in a new tab)</span></a>}
      </div>
      <details className="identifiers">
        <summary>Identifiers</summary>
        <dl>
          <div><dt>Contract</dt><dd className="mono">{chain.realm || CHAIN.realm}</dd></div>
          <div><dt>Market ID</dt><dd className="mono">{chain.id}</dd></div>
          <div><dt>Condition ID</dt><dd className="mono">{chain.conditionId}</dd></div>
          <div><dt>{chain.labels.Yes} token</dt><dd className="mono">{chain.yesTokenId}</dd></div>
          <div><dt>{chain.labels.No} token</dt><dd className="mono">{chain.noTokenId}</dd></div>
          <div><dt>Rules hash</dt><dd className="mono">{chain.rulesHash}</dd></div>
          <div><dt>Oracle</dt><dd className="mono">{chain.oracle}</dd></div>
          <div><dt>Quote version</dt><dd>{chain.quoteVersion}</dd></div>
          <div><dt>Collateral held</dt><dd>{formatUgnot(chain.escrowUgnot)} GNOT</dd></div>
          {chain.version === 2 && <div><dt>Fee rate</dt><dd>{(chain.feePpm / 1e6).toFixed(2)} × shares × price × (1 − price)</dd></div>}
          {chain.version === 2 && <div><dt>Fees held</dt><dd>{formatUgnot(chain.feesUgnot)} GNOT, released when the market is final</dd></div>}
          {chain.treasury && <div><dt>Treasury</dt><dd className="mono">{chain.treasury}</dd></div>}
          {chain.finalized && <div><dt>Evidence hash</dt><dd className="mono">{chain.evidenceHash}</dd></div>}
        </dl>
      </details>
    </section>
  );
}

export default function MarketPage({ market, backHref, initialOutcome, live, onOpenWallet }: Props) {
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  const [ticketVisible, setTicketVisible] = useState(true);
  const ticketRef = useRef<HTMLDivElement>(null);
  const history = market.history;
  const tradable = canTrade(market);
  const quote = Math.round(market.yesPrice * 100);
  const chainMarket = market.chain;
  const imageOf = useMarketImages([market.chain.conditionId]);
  const reference = usePolymarketHistory(market.chain.finalized ? null : market.chain.yesTokenId);
  const settled = usePolygonSettlement(chainMarket?.conditionId ?? null, Boolean(chainMarket && !chainMarket.finalized));
  const winner = market.finalOutcome;
  const name = (value: 'Yes' | 'No') => market.chain.labels[value]; // a match market names its teams
  const named = (value: string) => value === 'Yes' || value === 'No' ? name(value) : value;
  const voided = Boolean(chainMarket?.finalized && chainMarket.outcome === 'Void');
  const sourceText = voided ? `Void, final on ${formatDayTime(chainMarket!.finalizedAt)}`
    : chainMarket?.finalized ? `${named(chainMarket.winner)}, finalized on ${formatDayTime(chainMarket.finalizedAt)}`
    : chainMarket?.state === 'proposed' ? `${named(chainMarket.outcome)} proposed by the oracle on ${formatDayTime(chainMarket.proposedAt)}; final from ${formatDayTime(chainMarket.proposedAt + DISPUTE_WINDOW)} unless the guardian cancels it`
      : settled?.state === 'Yes' || settled?.state === 'No' ? `${name(settled.state)}, settled on Polygon. Waiting for the oracle to record it here.`
        : settled?.state === 'void' ? (chainMarket?.version === 2 ? 'Settled 50-50 on Polygon. The oracle will propose Void, which refunds every holder.' : 'Settled 50-50 on Polygon. This version of the contract cannot settle it yet.')
          : 'Not reported yet';

  useEffect(() => {
    const ticket = ticketRef.current;
    const footer = document.querySelector('.site-footer');
    if (!ticket || typeof IntersectionObserver === 'undefined') return;
    // Hide the bar before the ticket or the footer reaches the strip it
    // occupies, so the bar never covers a control.
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target); });
      setTicketVisible(visible.size > 0);
    }, { rootMargin: '0px 0px -96px 0px', threshold: 0 });
    observer.observe(ticket);
    if (footer) observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  function chooseFromBar(next: Outcome) {
    setOutcome(next);
    const node = ticketRef.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    node.querySelector<HTMLInputElement>('input[name="amount"]')?.focus({ preventScroll: true });
  }

  return (
    <div className={`market-page${tradable ? ' has-trade-bar' : ''}`}>
      <a className="back-link" href={backHref}>All markets</a>
      <div className="market-layout">
        <article className="market-main">
          <header className="market-head">
            <div className="market-title">
              <MarketThumb src={imageOf(market.chain.conditionId)} size="page" />
              <h1 style={{ viewTransitionName: `question-${market.id}` }}>{market.question}</h1>
            </div>
            <dl className="market-facts">
              <div><dt>Trading closes</dt><dd><time dateTime={new Date(market.closesAt * 1000).toISOString()}>{formatDayTime(market.closesAt)}</time></dd></div>
              {market.resolvesAt && <div><dt>Resolution target</dt><dd><time dateTime={new Date(market.resolvesAt * 1000).toISOString()}>{formatDayTime(market.resolvesAt)}</time></dd></div>}
              {market.stats && <div><dt>Volume</dt><dd>{market.stats.volume} GNOT</dd></div>}
              {market.stats && <div><dt>Trades</dt><dd>{market.stats.trades}</dd></div>}
              {market.stats && <div><dt>Holders</dt><dd>{market.stats.holders}</dd></div>}
            </dl>
          </header>

          <section className="detail-chart" aria-labelledby="quote-heading">
            <div className="chart-head">
              <div className="quote-figure">
                {voided ? <>
                  <p className="quote-number result-word void-text" aria-describedby="quote-heading">Void</p>
                  <div>
                    <h2 id="quote-heading" className="quote-label">Result</h2>
                    <p className="quote-sub">Final on {formatDayTime(chainMarket!.finalizedAt)}. Every holder takes back what they paid, the fee included.</p>
                  </div>
                </> : winner ? <>
                  <p className={`quote-number result-word ${winner === 'Yes' ? 'yes-text' : 'no-text'}`} aria-describedby="quote-heading">{name(winner)}</p>
                  <div>
                    <h2 id="quote-heading" className="quote-label">Result</h2>
                    <p className="quote-sub">Final on {formatDayTime(chainMarket!.finalizedAt)}. A {name(winner)} share pays 1 GNOT.</p>
                  </div>
                </> : <>
                  <p className="quote-number" aria-describedby="quote-heading">{quote}<span>%</span></p>
                  <div>
                    <h2 id="quote-heading" className="quote-label">{market.trading !== 'open' ? `Last ${name('Yes')} price` : `${name('Yes')} price`}</h2>
                    <p className="quote-sub">{market.trading !== 'open' ? 'Trading is closed. Waiting for the result.' : `${formatPrice(priceOf(market, 'Yes'))} ${market.unit} per ${name('Yes')} share, ${formatPrice(priceOf(market, 'No'))} per ${name('No')} share`}</p>
                    <QuoteFreshness market={market} />
                  </div>
                </>}
              </div>
            </div>
            <PriceChart question={market.question} points={history} unit={market.unit} until={live.chain?.blockTime} reference={reference} />
            <p className="chart-caption">
              {`Quote history since listing on ${formatDayTime(market.chain.createdAt)}. Each quote holds until the operator publishes the next one.`}
              {reference ? ' The grey line shows Polymarket’s price over the last month as a separate reference.' : ''}
            </p>
          </section>

          <div ref={ticketRef} className="ticket-slot">
            <TestnetTicket key={market.id} market={market} outcome={outcome} onOutcome={setOutcome} live={live} onOpenWallet={onOpenWallet} />
          </div>

          <Rules text={market.rules} />

          <section className="detail-section" aria-labelledby="lifecycle-heading">
            <h2 id="lifecycle-heading">Question status</h2>
            <dl className="status-grid">
              <div><dt>Trading</dt><dd>{market.trading === 'open' ? (market.quoteAvailable ? 'Open' : 'Open, waiting for a new quote') : market.trading === 'paused' ? 'Paused' : 'Closed'}</dd></div>
              <div><dt>Source outcome</dt><dd>{sourceText}</dd></div>
              <div><dt>Payouts</dt><dd>{voided ? 'Refunds open in Portfolio' : market.finalOutcome ? 'Open to claim in Portfolio' : 'After the outcome is finalized'}</dd></div>
            </dl>
            <p className="muted">{`A winning share pays 1 GNOT. A Polymarket price near 100% is not a result; only the oracle’s finalization on ${CHAIN.chainName} is.`}</p>
          </section>

          <ContractDetails market={market} />
          <Trades market={market} live={live} />
        </article>
      </div>

      {tradable && (
        <div className={`trade-bar${ticketVisible ? ' is-hidden' : ''}`} aria-hidden={ticketVisible}>
          <button type="button" className="outcome-link yes" tabIndex={ticketVisible ? -1 : 0} onClick={() => chooseFromBar('Yes')}><span>Buy {name('Yes')}</span><strong>{formatPrice(priceOf(market, 'Yes'))}</strong></button>
          <button type="button" className="outcome-link no" tabIndex={ticketVisible ? -1 : 0} onClick={() => chooseFromBar('No')}><span>Buy {name('No')}</span><strong>{formatPrice(priceOf(market, 'No'))}</strong></button>
        </div>
      )}
    </div>
  );
}
