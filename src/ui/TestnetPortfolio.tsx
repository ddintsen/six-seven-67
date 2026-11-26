import EmptyState from './EmptyState';
import { FIRST_POSITION, POSITIONS_LOCKED } from '../brand/scenes';
import { useEffect, useState } from 'react';
import { adenaActions, useAdenaWallet } from '../adena';
import { CHAIN, REALMS, explorerTxUrl } from '../live/config';
import { fetchPositions, formatUgnot, SCALE } from '../live/gno';
import type { ChainPosition } from '../live/gno';
import { fetchTrades } from '../live/indexer';
import type { TradeEvent } from '../live/indexer';
import { refreshMarkets, refreshPositions } from '../live/store';
import type { LiveState } from '../live/store';
import type { MarketView } from '../view';
import { formatClock, formatDay, relativeTime } from './format';

type Group = 'Open' | 'Awaiting outcome' | 'Claimable' | 'Settled';
const groups: Group[] = ['Open', 'Awaiting outcome', 'Claimable', 'Settled'];
type Filter = 'All' | Group;

interface Row { position: ChainPosition; market: MarketView | undefined; group: Group; payout: bigint; value: bigint | null }

const YES_NO = { Yes: 'Yes', No: 'No' };
function describe(position: ChainPosition, labels: { Yes: string; No: string } = YES_NO): string {
  const parts: string[] = [];
  if (position.yesMicroShares > 0n) parts.push(`${formatUgnot(position.yesMicroShares, 2)} ${labels.Yes}`);
  if (position.noMicroShares > 0n) parts.push(`${formatUgnot(position.noMicroShares, 2)} ${labels.No}`);
  return `${parts.join(' and ')} shares`;
}

function rowFor(position: ChainPosition, market: MarketView | undefined): Row {
  const chain = market?.chain;
  if (!chain) return { position, market, group: 'Awaiting outcome', payout: 0n, value: null };
  if (chain.finalized) {
    // A void market refunds what was paid, the fee included; otherwise winners take 1 GNOT a share.
    const payout = chain.outcome === 'Void' ? position.spentUgnot + position.feeUgnot : chain.winner === 'Yes' ? position.yesMicroShares : position.noMicroShares;
    return { position, market, group: position.claimed || payout === 0n ? 'Settled' : 'Claimable', payout, value: null };
  }
  if (market.trading === 'open') {
    const value = (position.yesMicroShares * BigInt(chain.yesPricePpm) + position.noMicroShares * BigInt(chain.noPricePpm)) / SCALE;
    return { position, market, group: 'Open', payout: 0n, value };
  }
  return { position, market, group: 'Awaiting outcome', payout: 0n, value: null };
}

type ClaimState = { phase: 'signing' | 'confirming' } | { phase: 'done'; hash: string | null } | { phase: 'error'; message: string };

function ClaimAction({ row, owner, onClaimed }: { row: Row; owner: string; onClaimed: (notice: { question: string; amount: bigint; hash: string | null }) => void }) {
  const [state, setState] = useState<ClaimState | null>(null);
  const id = row.position.marketId;
  async function claim() {
    setState({ phase: 'signing' });
    const realm = row.position.realm || CHAIN.realm;
    const version = row.market?.chain?.version ?? 1;
    const result = await adenaActions.call({ pkgPath: realm, func: 'Claim', args: [id], sendUgnot: 0n });
    if (result.status === 'rejected') { setState({ phase: 'error', message: 'Claim rejected in Adena. Nothing was sent.' }); return; }
    if (result.status === 'failed') {
      const message = /position already claimed|no position/.test(result.chainLog) ? 'This position was already claimed.' : result.message === 'The transaction was not executed.' ? 'The claim was not executed. Try again.' : result.message;
      setState({ phase: 'error', message });
      void refreshPositions(owner);
      return;
    }
    const hash = result.status === 'sent' || result.status === 'broadcast' ? result.hash : null;
    setState({ phase: 'confirming' });
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      try {
        const positions = await fetchPositions(CHAIN.rpcUrl, realm, owner, undefined, version);
        const claimed = positions.find(item => item.marketId === id);
        // v1 marks a claimed position; v2 deletes it.
        if (version === 2 ? !claimed : claimed?.claimed) {
          setState({ phase: 'done', hash });
          onClaimed({ question: row.market?.question ?? id, amount: version === 2 ? row.payout : claimed!.paidUgnot, hash });
          void refreshPositions(owner); void refreshMarkets(); void adenaActions.refresh();
          return;
        }
      } catch { /* keep polling */ }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    setState({ phase: 'error', message: 'The claim is not visible on chain yet. Refresh in a moment before trying again.' });
  }
  const url = state?.phase === 'done' && state.hash ? explorerTxUrl(state.hash) : null;
  return (
    <div className="claim">
      {state?.phase !== 'done' && <button type="button" className="button primary small" disabled={state?.phase === 'signing' || state?.phase === 'confirming'} onClick={() => void claim()}>
        {state?.phase === 'signing' ? 'Approve in Adena…' : state?.phase === 'confirming' ? 'Confirming…' : `${row.market?.chain?.outcome === 'Void' ? 'Take refund' : 'Claim'} ${formatUgnot(row.payout, 2)} GNOT`}
      </button>}
      <p className="claim-status" role="status">{state?.phase === 'done' ? 'Claimed. The GNOT is in your wallet.' : state?.phase === 'error' ? state.message : ''}{url && <> <a href={url} target="_blank" rel="noopener noreferrer">View transaction<span className="sr-only"> (opens in a new tab)</span></a></>}</p>
    </div>
  );
}

type TradesLoad = { status: 'loading' } | { status: 'ready'; trades: TradeEvent[] } | { status: 'error' };

// The owner's purchases in every realm, read once per address and shared by
// Activity and the empty state (someone with history is not a first visitor).
function useTrades(owner: string | null): TradesLoad {
  const [load, setLoad] = useState<TradesLoad>({ status: 'loading' });
  useEffect(() => {
    if (!owner) return;
    if (!CHAIN.indexerUrl) { setLoad({ status: 'error' }); return; }
    const controller = new AbortController();
    setLoad({ status: 'loading' });
    const url = CHAIN.indexerUrl;
    Promise.all(REALMS.map(r => fetchTrades(url, r.path, controller.signal, 100, owner)))
      .then(lists => setLoad({ status: 'ready', trades: lists.flat().sort((a, b) => b.height - a.height) }))
      .catch(() => { if (!controller.signal.aborted) setLoad({ status: 'error' }); });
    return () => controller.abort();
  }, [owner]);
  return load;
}

function Activity({ load, markets }: { load: TradesLoad; markets: MarketView[] | null }) {
  const labelsOf = (id: string) => markets?.find(m => m.id === id)?.chain.labels ?? YES_NO;
  return (
    <section className="ledger-activity" aria-labelledby="activity-title">
      <h2 id="activity-title" className="sr-only">Trade activity</h2>
      {load.status === 'loading' && <p className="muted" aria-busy="true">Reading your trades from the indexer.</p>}
      {load.status === 'error' && <p className="muted">Trade history is unavailable right now. Your positions above come straight from the contract.</p>}
      {load.status === 'ready' && load.trades.length === 0 && <div className="page-state compact"><h3>No trades yet</h3><p>Purchases you confirm on {CHAIN.chainName} appear here.</p><a className="button" href="#/markets">Explore markets</a></div>}
      {load.status === 'ready' && load.trades.length > 0 && (
        <ol className="activity-list">
          {load.trades.map(trade => {
            const url = explorerTxUrl(trade.hash);
            return (
              <li key={`${trade.hash}-${trade.marketId}`}>
                <a href={`#/market/${encodeURIComponent(trade.marketId)}`}>{trade.marketId}</a>
                <p><span className={trade.outcome === 'Yes' ? 'yes-text' : 'no-text'}>{formatUgnot(trade.microShares, 2)} {labelsOf(trade.marketId)[trade.outcome]}</span> for {formatUgnot(trade.costUgnot)} GNOT</p>
                {url ? <a className="activity-time" href={url} target="_blank" rel="noopener noreferrer">{trade.time ? relativeTime(trade.time) : `Block ${trade.height}`}<span className="sr-only"> (opens in a new tab)</span></a> : <span className="activity-time">{trade.time ? relativeTime(trade.time) : `Block ${trade.height}`}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default function TestnetPortfolio({ live, markets, onConnect }: { live: LiveState; markets: MarketView[] | null; onConnect: () => void }) {
  const wallet = useAdenaWallet();
  const [view, setView] = useState<'positions' | 'activity'>('positions');
  const [filter, setFilter] = useState<Filter>('All');
  const [notice, setNotice] = useState<{ question: string; amount: bigint; hash: string | null } | null>(null);
  const noticeUrl = notice?.hash ? explorerTxUrl(notice.hash) : null;
  const connected = wallet.status === 'connected';
  const owner = connected ? wallet.account.address : null;
  const trades = useTrades(owner);
  // Realm v2 removes a position once it is claimed, so an empty list can follow a win.
  const returning = notice !== null || (trades.status === 'ready' && trades.trades.length > 0);
  const load = live.positions?.owner === owner ? live.positions?.load : undefined;
  const positions = load && 'data' in load ? load.data ?? null : null;
  const rows = (positions ?? []).map(position => rowFor(position, markets?.find(market => market.id === position.marketId)));
  const counts: Record<Group, number> = { Open: 0, 'Awaiting outcome': 0, Claimable: 0, Settled: 0 };
  rows.forEach(row => { counts[row.group] += 1; });
  const visible = rows.filter(row => filter === 'All' || row.group === filter);
  const openCost = rows.filter(row => row.group !== 'Settled').reduce((sum, row) => sum + row.position.spentUgnot - row.position.paidUgnot, 0n);
  const openValue = rows.reduce((sum, row) => sum + (row.value ?? 0n), 0n);
  const claimable = rows.filter(row => row.group === 'Claimable').reduce((sum, row) => sum + row.payout, 0n);
  const claimed = rows.reduce((sum, row) => sum + row.position.paidUgnot, 0n);

  if (!connected || !owner) {
    return (
      <div className="portfolio">
        <div className="page-head">
          <div className="page-title"><h1>Your positions</h1></div>
        </div>
        <EmptyState scene={POSITIONS_LOCKED} title="Connect Adena to see your positions"
          action={<button type="button" className="button primary" onClick={onConnect}>Connect Adena</button>}>
          Positions on {CHAIN.chainName} are read from the 67 contract for your address. Nothing is stored in this browser.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="portfolio">
      <div className="page-head">
        <div className="page-title">
          <h1>Your positions</h1>
          <p className="venue-note"><span className="venue-mark testnet">{CHAIN.chainName}</span><span className="mono">{owner}</span>
            {load?.status === 'error' && load.observedAt && <span className="venue-meta caution">Showing positions read at {formatClock(load.observedAt / 1000)} UTC</span>}</p>
        </div>
      </div>
      {/* Until there is a position, the four position totals would all read
          zero: show only the balance. */}
      <dl className={`summary ${rows.length > 0 ? 'summary-5' : 'summary-1'}`} aria-label="Portfolio summary">
        <div><dt>Wallet balance</dt><dd>{wallet.balanceGnot} <span>GNOT</span></dd></div>
        {rows.length > 0 && <>
          <div><dt>Open cost</dt><dd>{formatUgnot(openCost)} <span>GNOT</span></dd></div>
          <div><dt>Open value at current quotes</dt><dd>{formatUgnot(openValue)} <span>GNOT</span></dd></div>
          <div><dt>Ready to claim</dt><dd>{formatUgnot(claimable)} <span>GNOT</span></dd></div>
          <div><dt>Claimed</dt><dd>{formatUgnot(claimed)} <span>GNOT</span></dd></div>
        </>}
      </dl>
      <p className={notice ? 'inline-notice success' : 'sr-only'} role="status">{notice && <span>Claimed {formatUgnot(notice.amount)} GNOT from “{notice.question}”.{noticeUrl && <> <a className="text-link" href={noticeUrl} target="_blank" rel="noopener noreferrer">View transaction<span className="sr-only"> (opens in a new tab)</span></a></>}</span>}</p>
      <div className="tabs" role="group" aria-label="Portfolio view">
        <button type="button" aria-pressed={view === 'positions'} onClick={() => setView('positions')}>Positions <span>{rows.length}</span></button>
        <button type="button" aria-pressed={view === 'activity'} onClick={() => setView('activity')}>Activity</button>
      </div>
      {view === 'activity' ? <Activity load={trades} markets={markets} /> : (
        load?.status === 'error' && !positions ? <section className="page-state"><h2>Positions could not be read</h2><p>{load.message}</p><button type="button" className="button" onClick={() => void refreshPositions(owner)}>Try again</button></section>
        : !positions ? <section className="page-state" aria-busy="true"><h2>Reading your positions</h2><p>From the 67 contract on {CHAIN.chainName}.</p></section>
        : rows.length === 0 ? (returning
          ? <EmptyState scene={FIRST_POSITION} title="Nothing open right now" action={<a className="button primary" href="#/markets">Explore markets</a>}>Your earlier purchases and claims are under Activity above.</EmptyState>
          : <EmptyState scene={FIRST_POSITION} title="Your first question is waiting" action={<a className="button primary" href="#/markets">Explore markets</a>}>Pick a market, read its rules and buy Yes or No with test GNOT.</EmptyState>)
        : <>
          <div className="filters" role="group" aria-label="Filter positions by lifecycle">
            {(['All', ...groups] as Filter[]).map(item => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item} <span>{item === 'All' ? rows.length : counts[item]}</span></button>)}
          </div>
          {visible.length === 0 ? <section className="page-state compact"><h2>No {filter.toLowerCase()} positions</h2><button type="button" className="button" onClick={() => setFilter('All')}>Show all positions</button></section> : (
            <div className="ledger">
              <div className="ledger-head" aria-hidden="true"><span>Market</span><span>Position</span><span>Cost</span><span>Value</span><span>Payout</span></div>
              {visible.map(row => (
                <article key={row.position.marketId} className="ledger-row" aria-labelledby={`position-${row.position.marketId}`}>
                  <div className="ledger-question">
                    <h3 id={`position-${row.position.marketId}`}>{row.market ? <a href={`#/market/${encodeURIComponent(row.position.marketId)}`}>{row.market.question}</a> : row.position.marketId}</h3>
                    <p className="muted">{row.group}{row.market?.chain?.finalized ? (row.market.chain.outcome === 'Void' ? ', void: refund of cost and fee' : `, ${row.market.chain.winner ? row.market.chain.labels[row.market.chain.winner] : ''} won`) : row.market?.chain?.state === 'proposed' ? `, ${row.market.chain.outcome === 'Yes' || row.market.chain.outcome === 'No' ? row.market.chain.labels[row.market.chain.outcome] : row.market.chain.outcome} proposed` : row.market ? `, closes ${formatDay(row.market.closesAt)}` : ''}</p>
                  </div>
                  <dl className="ledger-values">
                    <div><dt>Position</dt><dd>{describe(row.position, row.market?.chain.labels)}</dd></div>
                    <div><dt>Cost</dt><dd>{formatUgnot(row.position.spentUgnot)} <span>GNOT</span></dd></div>
                    <div><dt>Value</dt><dd>{row.value !== null ? <>{formatUgnot(row.value)} <span>GNOT</span></> : <span className="muted">Not quoted</span>}</dd></div>
                    <div><dt>Payout</dt><dd>{row.position.claimed ? <>{formatUgnot(row.position.paidUgnot)} <span>GNOT claimed</span></> : row.group === 'Claimable' ? <ClaimAction row={row} owner={owner} onClaimed={setNotice} /> : row.group === 'Settled' ? <span className="muted">No payout</span> : <span className="muted">After the outcome</span>}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {rows.length > 0 && <p className="ledger-note">Value uses the current 67 quote and is not cash: this version has no selling. A winning share pays 1 GNOT once the oracle finalizes the outcome.{CHAIN.faucetUrl && <> <a className="text-link" href={CHAIN.faucetUrl} target="_blank" rel="noopener noreferrer">Test GNOT faucet<span className="sr-only"> (opens in a new tab)</span></a></>}</p>}
    </div>
  );
}
