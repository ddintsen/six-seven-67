import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CHAIN } from '../live/config';
import { fetchAdministrator } from '../live/gno';
import type { MarketView } from '../view';
import type { ChainMarket } from '../live/gno';
import type { Load } from '../live/store';
import { relativeTime } from '../ui/format';
import { GLASS, cubePaths, order } from '../brand/BrandMark';
import type { Cell } from '../brand/mark';

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

// One glass cube (or a small cluster) drawn with the mark's own geometry.
function Cubes({ cells, glass, x, y, scale }: { cells: Cell[]; glass: keyof typeof GLASS | ((cell: Cell) => keyof typeof GLASS); x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {order(cells).flatMap((cell, i) => cubePaths(cell, GLASS[typeof glass === 'function' ? glass(cell) : glass], scale < 2).map((path, j) => <path key={`${i}-${j}`} d={path.d} fill={path.fill} />))}
    </g>
  );
}

// Who does what around the realm, drawn as flows of light between glass
// blocks. Each flow is a real call or read; the flows play once each time the
// section comes into view, and never with reduced motion.
function Diagram() {
  return (
    <svg className="parties-diagram" viewBox="0 0 640 420" role="img" aria-labelledby="parties-diagram-title">
      <title id="parties-diagram-title">Polymarket feeds the operator and the oracle; the operator publishes quotes, the oracle finalizes results, and you buy and claim, all through the 67 realm.</title>
      <g className="flow-tracks">
        <path id="f-source-operator" d="M92 164 V 288" />
        <path id="f-source-oracle" d="M150 92 H 490" />
        <path id="f-operator-realm" d="M150 336 C 220 336 240 262 270 240" />
        <path id="f-oracle-realm" d="M548 164 C 548 196 420 174 372 188" />
        <path id="f-you-realm" d="M490 336 C 420 336 400 262 372 240" />
      </g>
      <g className="flow-pulses">
        <path className="pulse pulse-quote" d="M92 164 V 288" />
        <path className="pulse pulse-result" d="M150 92 H 490" />
        <path className="pulse pulse-quote slow" d="M150 336 C 220 336 240 262 270 240" />
        <path className="pulse pulse-result slow" d="M548 164 C 548 196 420 174 372 188" />
        <path className="pulse pulse-yes" d="M490 336 C 420 336 400 262 372 240" />
        <path className="pulse pulse-claim" d="M372 240 C 400 262 420 336 490 336" />
      </g>
      <g className="flow-labels">
        <text x="104" y="214">midpoint</text>
        <text x="320" y="80" textAnchor="middle">result, once closed</text>
        <text x="160" y="300">SetQuote, every 10 min</text>
        <text x="470" y="168" textAnchor="end">FinalizeByOracle</text>
        <text x="476" y="300" textAnchor="end">Buy, Claim</text>
      </g>
      <Cubes cells={[[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]} glass={([c]) => (c === 0 ? 'yes' : c === 2 ? 'no' : 'clear')} x={268} y={176} scale={3.4} />
      <text className="node-label strong" x="320" y="270" textAnchor="middle">67 realm</text>
      <Cubes cells={[[0, 0]]} glass="clear" x={70} y={74} scale={4} />
      <text className="node-label" x="92" y="148" textAnchor="middle" dy="0">Polymarket</text>
      <Cubes cells={[[0, 0]]} glass="clear" x={70} y={300} scale={4} />
      <text className="node-label" x="92" y="374" textAnchor="middle">Operator</text>
      <Cubes cells={[[0, 0]]} glass="clear" x={526} y={74} scale={4} />
      <text className="node-label" x="548" y="148" textAnchor="middle">Oracle</text>
      <Cubes cells={[[0, 0], [1, 0]]} glass={([c]) => (c === 0 ? 'yes' : 'no')} x={504} y={300} scale={4} />
      <text className="node-label" x="548" y="374" textAnchor="middle">You</text>
    </svg>
  );
}

// One screen: the diagram is the dominant and names every party and call;
// the copy says what the diagram cannot (who holds the money, what 67 never
// does) and, once the realm is live, who the operator and the oracle are.
export default function Parties({ markets, load }: { markets: MarketView[] | null; load: Load<ChainMarket[]> }) {
  const [admin, setAdmin] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const deployed = markets !== null;
  useEffect(() => {
    const node = section.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!deployed) return;
    const controller = new AbortController();
    fetchAdministrator(CHAIN.rpcUrl, CHAIN.realm, controller.signal).then(setAdmin).catch(() => setAdmin(null));
    return () => controller.abort();
  }, [deployed]);

  const chain = deployed ? (markets ?? []).map(market => market.chain).filter(Boolean) : [];
  const lastQuote = chain.reduce((latest, market) => Math.max(latest, ...(market!.history.map(point => point.at))), 0);
  const oracles = [...new Set(chain.map(market => market!.oracle))];
  const finalized = chain.filter(market => market!.finalized).length;
  const operator = admin ? <span className="mono">{short(admin)}</span> : 'reading the address';

  let status: ReactNode;
  if (deployed && chain.length > 0) {
    status = <>
      <span className="party-line">Operator {operator}{lastQuote > 0 && <>, last quote {relativeTime(lastQuote)}</>}</span>
      <span className="party-line">Oracle {oracles.map((oracle, index) => <span key={oracle}>{index > 0 && ', '}<span className="mono">{short(oracle)}</span></span>)}, {finalized} of {chain.length} final</span>
    </>;
  } else if (deployed) {
    status = <span className="party-line">Operator {operator}, no markets listed yet</span>;
  } else if (load.status === 'idle' || load.status === 'loading') {
    status = `Reading ${CHAIN.chainName}`;
  } else if (load.status === 'error' && load.code !== 'REALM_NOT_FOUND') {
    status = `${CHAIN.chainName} could not be read just now.`;
  } else {
    status = `The operator and the oracle start with the realm on ${CHAIN.chainName}.`;
  }

  return (
    <section ref={section} className={`parties${inView ? ' is-live' : ''}`} aria-labelledby="parties-title">
      <div className="parties-copy">
        <h2 id="parties-title" className="section-title">Who does what</h2>
        <p>The realm holds the collateral and checks every rule; nobody can withdraw it. Polymarket only supplies the questions and the results: 67 never trades there.</p>
        <p className="party-live">{status}</p>
      </div>
      <Diagram />
    </section>
  );
}
