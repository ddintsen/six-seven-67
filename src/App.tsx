import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Category } from './domain';
import { useAdenaWallet } from './adena';
import { useLiveState } from './live/store';
import { chainNow, fromChain } from './view';
import type { MarketView } from './view';
import Header from './ui/Header';
import type { Section } from './ui/Header';
import Markets, { categories } from './ui/Markets';
import MarketPage from './ui/MarketPage';
import TestnetPortfolio from './ui/TestnetPortfolio';
import WalletDialog from './ui/WalletDialog';
import Footer from './ui/Footer';
import Landing from './landing/Landing';
import HowPage from './site/HowPage';
import ContractPage from './site/ContractPage';
import StatusPage from './ui/StatusPage';
import PolymarketPage from './ui/PolymarketPage';
import EmptyState from './ui/EmptyState';
import { NOT_FOUND } from './brand/scenes';

function readRoute() { return window.location.hash.slice(1) || '/'; }
function splitRoute(route: string) { const [path, query = ''] = route.split('?'); return { path, params: new URLSearchParams(query) }; }

export default function App() {
  const wallet = useAdenaWallet();
  const [route, setRoute] = useState(readRoute);
  const { path, params } = splitRoute(route);
  const [query, setQuery] = useState(() => params.get('q') || '');
  const [category, setCategory] = useState<Category>(() => categories.find(item => item === params.get('topic')) || 'All');
  const walletDialog = useRef<HTMLDialogElement>(null);
  const keyboard = useRef(false);
  const lastMarket = useRef('');

  const marketId = path.startsWith('/market/') ? decodeURIComponent(path.slice(8)) : '';
  const owner = wallet.status === 'connected' ? wallet.account.address : null;
  const isContract = path === '/contract';
  const isHow = path === '/how';
  const isStatus = path === '/status';
  const polymarketId = path.startsWith('/polymarket/') ? decodeURIComponent(path.slice(12)) : '';
  // 67 is one live venue on Onyx testnet; every exchange page reads it.
  const live = useLiveState(true, owner);
  const now = chainNow(live.chain?.blockTime);
  const liveMarkets = 'data' in live.markets && live.markets.data ? live.markets.data.map(market => fromChain(market, now)) : null;
  const markets: MarketView[] | null = liveMarkets;
  const market: MarketView | undefined = marketId ? liveMarkets?.find(item => item.id === marketId) : undefined;
  const initialOutcome = params.get('outcome') === 'No' ? 'No' : 'Yes';
  const isMarkets = path === '/markets';
  const isLanding = path === '/' || path === '';
  const isPortfolio = path === '/portfolio';
  const catalogueParams = new URLSearchParams();
  if (query) catalogueParams.set('q', query);
  if (category !== 'All') catalogueParams.set('topic', category);
  const marketsHref = `#/markets${catalogueParams.size ? `?${catalogueParams}` : ''}`;

  useEffect(() => {
    if (!isMarkets) return;
    const next = splitRoute(route).params;
    setQuery(next.get('q') || '');
    setCategory(categories.find(item => item === next.get('topic')) || 'All');
  }, [route, isMarkets]);

  useEffect(() => {
    const onKey = () => { keyboard.current = true; };
    const onPointer = () => { keyboard.current = false; };
    const onHash = () => {
      const next = readRoute();
      const update = () => flushSync(() => setRoute(next));
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const nextPath = splitRoute(next).path;
      const journey = nextPath.startsWith('/market/') || nextPath === '/markets';
      if (document.startViewTransition && !reduced && !keyboard.current && journey) {
        const transition = document.startViewTransition(update);
        // Resizing or a second journey can skip the visual transition after the route updates.
        void transition.ready.catch(() => undefined);
      } else update();
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  useEffect(() => {
    if (path.startsWith('/polymarket/')) { document.title = 'Polymarket market | 67'; return; }
    document.title = market ? `${market.question} | 67` : isPortfolio ? 'Portfolio | 67' : isMarkets ? 'Markets | 67'
      : isHow ? 'How it works | 67' : isContract ? 'Contract | 67' : isStatus ? 'Status | 67' : isLanding ? '67 — Six. Seven. Take a side.' : marketId ? 'Question not found | 67' : 'Page not found | 67';
  }, [market, isPortfolio, isMarkets, isHow, isContract, isStatus, isLanding, marketId]);
  // A Polymarket page sets its own title once the question is read.

  useEffect(() => {
    if (marketId) lastMarket.current = marketId;
    const target = isMarkets && lastMarket.current
      ? document.querySelector<HTMLElement>(`[data-market-id="${CSS.escape(lastMarket.current)}"]`)
      : document.querySelector<HTMLElement>('main h1');
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (target) {
      if (target.tagName !== 'A') target.tabIndex = -1;
      target.focus({ preventScroll: true });
      if (isMarkets && lastMarket.current) target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [path]); // Route changes move focus; quote and filter updates do not.

  function updateFilters(nextQuery: string, nextCategory: Category) {
    setQuery(nextQuery);
    setCategory(nextCategory);
    const search = new URLSearchParams();
    if (nextQuery) search.set('q', nextQuery);
    if (nextCategory !== 'All') search.set('topic', nextCategory);
    const next = `/markets${search.size ? `?${search}` : ''}`;
    if (isMarkets) { window.history.replaceState(null, '', `#${next}`); setRoute(next); } else window.location.hash = next;
  }

  let page;
  if (isHow) {
    page = <HowPage />;
  } else if (isContract) {
    page = <ContractPage load={live.markets} chain={live.chain} />;
  } else if (isStatus) {
    page = <StatusPage />;
  } else if (isLanding) {
    page = <Landing markets={markets} load={live.markets} chain={live.chain} />;
  } else if (isMarkets) {
    page = <Markets markets={markets} load={live.markets} chain={live.chain} query={query} category={category}
      onCategory={value => updateFilters(query, value)} onClear={() => updateFilters('', 'All')} onQuery={value => updateFilters(value, category)} />;
  } else if (polymarketId) {
    const listed = liveMarkets?.find(item => item.chain?.conditionId === polymarketId)?.id ?? null;
    page = <PolymarketPage conditionId={polymarketId} listedId={listed} backHref={marketsHref} />;
  } else if (isPortfolio) {
    page = <TestnetPortfolio live={live} markets={liveMarkets} onConnect={() => walletDialog.current?.showModal()} />;
  } else if (market) {
    page = <MarketPage key={`${market.id}-${initialOutcome}`} market={market} backHref={marketsHref} initialOutcome={initialOutcome}
      live={live} onOpenWallet={() => walletDialog.current?.showModal()} />;
  } else if (marketId && (live.markets.status === 'loading' || live.markets.status === 'idle')) {
    page = <section className="page-state" aria-busy="true"><h1>Loading market</h1><p>Reading the question from {live.chain ? 'the chain' : 'Onyx testnet'}.</p></section>;
  } else {
    page = marketId
      ? <EmptyState level={1} scene={NOT_FOUND} title="Question not found" action={<a className="button primary" href="#/markets">Explore markets</a>}>There is no market at this address on 67.</EmptyState>
      : <EmptyState level={1} scene={NOT_FOUND} title="Page not found" action={<a className="button primary" href="#/">Go home</a>}>There is nothing at this address. The markets and the guide are in the menu.</EmptyState>;
  }

  const active: Section = isLanding ? 'home' : isHow ? 'how' : isContract ? 'contract' : isPortfolio ? 'portfolio' : isMarkets ? 'markets' : marketId || polymarketId ? 'market' : 'other';

  return (
    <div className={`app-shell is-${active}`}>
      <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
      <Header marketsHref={marketsHref} active={active} route={route} wallet={wallet} onOpenWallet={() => walletDialog.current?.showModal()} />
      <main id="main-content" tabIndex={-1}>
        {page}
      </main>
      <Footer chain={live.chain} />
      <WalletDialog ref={walletDialog} />
    </div>
  );
}
