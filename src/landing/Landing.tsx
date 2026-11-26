import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { CHAIN } from '../live/config';
import type { ChainStatus } from '../live/gno';
import type { Load } from '../live/store';
import type { ChainMarket } from '../live/gno';
import { canTrade, priceOf } from '../view';
import type { MarketView } from '../view';
import { formatDay, formatPrice } from '../ui/format';
import type { ScaleHandle } from './forestScene';
import type { StoryHandle } from './storyScene';
import Parties from './Parties';
import { canRun3D } from './gpu';
import { Scene } from '../brand/Scene';
import type { SceneData } from '../brand/Scene';
import { BUY_DROP, CLAIM_PAYOUT, ORACLE_RESULT, QUESTION_FROZEN } from '../brand/scenes';
import { SOURCE_EXCERPT } from '../site/contractFacts';

const SHORT: Record<string, string> = {
  'btc-vs-gold-2026': 'Bitcoin vs gold', 'starship-reusable-2026': 'Starship', 'apple-new-line-2026': 'Apple', 'fed-hike-2026': 'Fed hike',
  'bitcoin-150k': 'Bitcoin $150k', 'ethereum-5000': 'Ethereum $5k', 'gno-mainnet': 'Gno mainnet', 'fed-rate-cut': 'Fed cut', 'euro-digital': 'Digital euro',
};
const shortName = (market: MarketView) => SHORT[market.id] ?? market.question.split(' ').slice(0, 3).join(' ');

function Stage({ yes }: { yes: number }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<ScaleHandle | null>(null);
  const yesRef = useRef(yes);
  const [mode, setMode] = useState<'flat' | 'ready'>('flat');
  yesRef.current = yes;

  useEffect(() => {
    let cancelled = false;
    const node = host.current;
    if (!node) return;
    // Without a hardware GPU the still stays and three.js is never loaded.
    if (!canRun3D()) return;
    import('./forestScene').then(({ mountScale }) => {
      if (cancelled || !host.current) return;
      handle.current = mountScale(node, { yes: yesRef.current, onReady: () => setMode('ready'), onFallback: () => setMode('flat') });
    }).catch(() => setMode('flat'));
    return () => {
      cancelled = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  useEffect(() => { handle.current?.setYes(yes); }, [yes]);

  return (
    // Until the scene is ready, and on devices that cannot run it, the stage
    // shows a still of the same forest with the balance at rest.
    <div className={`scale-stage is-${mode}`} ref={host} />
  );
}

// The four calls, one per viewport. Titles are broken by meaning, so each
// line can rise through its own mask.
const MOVES: { call: string; title: [string, string]; text: string; scene: SceneData }[] = [
  { call: 'CreateMarket', scene: QUESTION_FROZEN, title: ['The question', 'is fixed.'], text: 'Question and rules are copied word for word and frozen in the realm. Nothing can edit them.' },
  { call: 'Buy', scene: BUY_DROP, title: ['You pay the price', 'you reviewed.'], text: 'The realm refuses any other price, any other amount, and any purchase the market cannot cover.' },
  { call: 'FinalizeByOracle', scene: ORACLE_RESULT, title: ['The oracle records', 'the result.'], text: 'Only the oracle pinned to the market can, once, with the full source binding. Trading stops at once.' },
  { call: 'Claim', scene: CLAIM_PAYOUT, title: ['A winning share', 'pays 1 GNOT.'], text: 'Straight from the market’s own collateral to your address. A second claim is refused.' },
];
// The title page, then one page per call.
const PAGES = MOVES.length + 1;
const stateOf = (index: number, page: number) => (index === page ? 'active' : index < page ? 'past' : 'next');

function Lines({ lines }: { lines: readonly string[] }) {
  // The space keeps the accessible name readable ("Four calls settle a market").
  return <>{lines.map((line, index) => <Fragment key={index}>{index > 0 && ' '}<span className="story-line" style={{ '--i': index } as CSSProperties}><span>{line}</span></span></Fragment>)}</>;
}

// "Four calls settle a market" as one pinned, full-screen scene: the plot of
// the night forest plays each call while the page scrolls under it, and the
// type changes page by page, at display size, through masks. Scrolling back
// plays everything in reverse. Without a GPU the plot becomes each call's
// block picture.
function Story() {
  const section = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<StoryHandle | null>(null);
  // Devices that cannot run the scene get the pictures from the first paint.
  const [mode, setMode] = useState<'idle' | 'ready' | 'flat'>(() => (canRun3D() ? 'idle' : 'flat'));
  const [page, setPage] = useState(0);

  useEffect(() => {
    const node = section.current;
    if (!node) return;
    let cancelled = false;
    // Load the scene when the section comes near.
    const near = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || handle.current || cancelled || !canRun3D()) return;
      near.disconnect();
      import('./storyScene').then(({ mountStory }) => {
        if (cancelled || !host.current) return;
        handle.current = mountStory(host.current, { onReady: () => setMode('ready'), onFallback: () => setMode('flat') });
        update();
      }).catch(() => setMode('flat'));
    }, { rootMargin: '600px 0px' });
    near.observe(node);

    let ticking = false;
    function update() {
      ticking = false;
      const rect = node!.getBoundingClientRect();
      const pinHeight = pin.current?.offsetHeight ?? window.innerHeight;
      const pageSize = Math.max(1, (rect.height - pinHeight) / PAGES);
      const pages = Math.min(PAGES - 0.0001, Math.max(0, -rect.top / pageSize));
      const current = Math.floor(pages);
      // A call plays over the first two thirds of its page, then holds while
      // it is read.
      const progress = current === 0 ? 0 : current - 1 + Math.min(1, (pages - current) / 0.66);
      handle.current?.setProgress(progress);
      setPage(current);
    }
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      cancelled = true;
      near.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  // The index jumps to a call's page.
  function jump(index: number) {
    const node = section.current;
    if (!node) return;
    const pinHeight = pin.current?.offsetHeight ?? window.innerHeight;
    const pageSize = (node.offsetHeight - pinHeight) / PAGES;
    const top = node.getBoundingClientRect().top + window.scrollY + index * pageSize + 2;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  }

  return (
    <section ref={section} className={`moves story is-${mode}`} aria-labelledby="moves-title" style={{ '--pages': PAGES } as CSSProperties}>
      <div className="story-pin" ref={pin}>
        <div className="story-stage" aria-hidden="true">
          <div className="story-host" ref={host} />
          {mode === 'flat' && MOVES.map((move, index) => (
            <div key={move.call} className="story-picture" data-state={stateOf(index + 1, Math.max(1, page))}><Scene scene={move.scene} /></div>
          ))}
        </div>
        <div className="story-copy">
          <div className="story-panel" data-state={stateOf(0, page)}>
            <h2 id="moves-title" className="story-title"><Lines lines={['Four calls', 'settle a market.']} /></h2>
            <p>No server decides a payout. Each step is a public function of the 67 realm, and each one checks its own rules.</p>
          </div>
          {MOVES.map((move, index) => (
            <article key={move.call} className="story-panel" data-state={stateOf(index + 1, page)} aria-labelledby={`move-${move.call}`}>
              <h3 id={`move-${move.call}`} className="story-title"><Lines lines={move.title} /></h3>
              <p>{move.text}</p>
            </article>
          ))}
          <ol className="story-index" aria-label="The four calls">
            {MOVES.map((move, index) => (
              <li key={move.call}>
                <button type="button" aria-current={page === index + 1 ? 'step' : undefined} onClick={() => jump(index + 1)}><code>{move.call}</code></button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

interface Props {
  markets: MarketView[] | null;
  load: Load<ChainMarket[]>;
  chain: ChainStatus | null;
}

export default function Landing({ markets, load, chain }: Props) {
  // The balance weighs a live market; until the realm answers it stays level and says so.
  const open = (markets ?? []).filter(canTrade);
  const [selected, setSelected] = useState<string | null>(null);
  const market = open.find(item => item.id === selected) ?? open[0];
  const yes = market ? priceOf(market, 'Yes') : 0.5;

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <figure className="hero-scene" aria-hidden="true"><Stage yes={yes} /></figure>
        <div className="hero-copy">
          <h1 id="hero-title" className="hero-title display"><span className="yes-text">Six.</span><span className="no-text">Seven.</span>Take a side.</h1>
          <p className="lede">A prediction exchange on Gno.land. Buy Yes or No on real questions with test GNOT. Every price, position and payout lives in one realm anyone can read.</p>
          <div className="hero-actions">
            <a className="button primary" href="#/markets">Open markets</a>
            <a className="text-link" href="#/how">How it works</a>
          </div>
        </div>
        <div className="hero-market">
          {market ? (
            <div className="scale-caption">
              <a className="scale-question" href={`#/market/${market.id}`}>{market.question}</a>
              <p className="scale-prices">
                <span className="yes-text"><strong>{Math.round(yes * 100)}%</strong> Yes at {formatPrice(yes)}</span>
                <span className="no-text"><strong>{Math.round((1 - yes) * 100)}%</strong> No at {formatPrice(priceOf(market, 'No'))}</span>
              </p>
              <p className="scale-venue">Live on {CHAIN.chainName}, weighed by the balance</p>
            </div>
          ) : (
            <div className="scale-caption"><p className="scale-venue">{load.status === 'error' ? 'Markets could not be read' : `Reading ${CHAIN.chainName}`}</p></div>
          )}
          {open.length > 1 && (
            <div className="scale-picker" role="group" aria-label="Weigh another question">
              {open.slice(0, 5).map(item => (
                <button type="button" key={item.id} aria-pressed={item.id === market?.id} onClick={() => setSelected(item.id)}>{shortName(item)}</button>
              ))}
            </div>
          )}
        </div>
      </section>

      <Story />

      <Parties markets={markets} load={load} />

      {markets && markets.length > 0 && (
        <section className="landing-markets" aria-labelledby="landing-markets-title">
          <div className="section-head">
            <h2 id="landing-markets-title">Open on {CHAIN.chainName}</h2>
            <a className="text-link" href="#/markets">All markets</a>
          </div>
          <ul className="landing-rows">
            {markets.filter(canTrade).slice(0, 4).map(item => (
              <li key={item.id}>
                <a className="landing-row" href={`#/market/${item.id}`}>
                  <span className="landing-row-question">{item.question}</span>
                  <span className="landing-row-meta">Closes {formatDay(item.closesAt)}{item.stats ? `, ${item.stats.volume} GNOT volume` : ''}</span>
                  <span className="landing-row-price yes-text"><span>Yes</span> <span>{formatPrice(priceOf(item, 'Yes'))}</span></span>
                  <span className="landing-row-price no-text"><span>No</span> <span>{formatPrice(priceOf(item, 'No'))}</span></span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="source" id="source" aria-labelledby="source-title">
        <div className="section-head">
          <h2 id="source-title">Read every line</h2>
          <p>The rules that protect a purchase are three checks in Gno. They run on chain for every trade, whatever any app shows.</p>
        </div>
        <pre className="code" tabIndex={0} aria-label="Excerpt from Buy in the 67 realm"><code>{SOURCE_EXCERPT.map(([kind, text], index) => <span key={index} className={`tok-${kind}`}>{text}</span>)}</code></pre>
        <p className="source-foot">
          <span className="mono">{CHAIN.realm}</span>
          <a className="text-link" href="#/contract">Every function of the realm</a>
          {chain && <span>Block {chain.height.toLocaleString('en-US')}</span>}
        </p>
      </section>
    </div>
  );
}
