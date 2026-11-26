import { CHAIN, explorerRealmUrl } from '../live/config';
import type { ChainMarket, ChainStatus } from '../live/gno';
import type { Load } from '../live/store';
import { EVENTS, READ_FUNCTIONS, SOURCE_EXCERPT, WRITE_FUNCTIONS } from './contractFacts';
import { Scene } from '../brand/Scene';
import { UNITS_SPLIT } from '../brand/scenes';

export default function ContractPage({ load, chain }: { load: Load<ChainMarket[]>; chain: ChainStatus | null }) {
  const deployed = 'data' in load && Boolean(load.data);
  const missing = load.status === 'error' && load.code === 'REALM_NOT_FOUND';
  const realmUrl = explorerRealmUrl();
  const count = deployed && 'data' in load && load.data ? load.data.length : 0;

  return (
    <div className="contract-page">
      <section className="contract-hero" aria-labelledby="contract-title">
        <h1 id="contract-title" className="display">One realm, every rule.</h1>
        <p className="lede">67 is one Gno package. It holds each market’s collateral, the published quotes, every position and the payouts. The app only reads it and asks Adena to sign calls to it.</p>
        <dl className="contract-facts">
          <div><dt>Realm</dt><dd className="mono">{CHAIN.realm}</dd></div>
          <div><dt>Network</dt><dd>{CHAIN.chainName} <span className="muted">({CHAIN.chainId}){chain ? `, block ${chain.height.toLocaleString('en-US')}` : ''}</span></dd></div>
          <div><dt>Status</dt><dd>
            {deployed
              ? <span className="contract-status live">Deployed, {count} {count === 1 ? 'market' : 'markets'}</span>
              : missing ? <span className="contract-status">Not deployed yet</span>
                : <span className="contract-status">{load.status === 'error' ? 'Could not be read' : 'Checking'}</span>}
          </dd></div>
          <div><dt>Checked</dt><dd>27 test groups pass with gno 1.5.0</dd></div>
          {deployed && realmUrl && <div><dt>Source</dt><dd><a className="text-link" href={realmUrl} target="_blank" rel="noopener noreferrer">Open the realm in gnoweb<span className="sr-only"> (opens in a new tab)</span></a></dd></div>}
        </dl>
      </section>

      <section className="chapter has-scene" aria-labelledby="units-title">
        <h2 id="units-title" className="chapter-title">Units</h2>
        <div className="chapter-scene"><Scene scene={UNITS_SPLIT} /></div>
        <div className="chapter-body">
          <p>All amounts are whole <code>ugnot</code>: one GNOT is 1,000,000 ugnot. A share is 1,000,000 micro-shares, and a winning micro-share pays 1 ugnot, so a winning share pays exactly 1 GNOT.</p>
          <p>Prices are parts per million of that payout. A Yes price of <code>420000</code> means 0.42 GNOT per share; the No price is always the rest, <code>580000</code>.</p>
        </div>
      </section>

      <section className="contract-functions" aria-labelledby="functions-title">
        <div className="section-head">
          <h2 id="functions-title">What each call does</h2>
          <p>Each function checks its own conditions and stops the whole transaction when one fails. The labels under each call are its exact refusal messages.</p>
        </div>
        <div className="functions">
          <div className="functions-main">
            {WRITE_FUNCTIONS.map(fn => (
              <article className="function" key={fn.name} aria-labelledby={`fn-${fn.name}`}>
                <h3 id={`fn-${fn.name}`}>{fn.name}</h3>
                <p className="function-who">{fn.who}</p>
                <div className="function-body">
                  <p>{fn.text}</p>
                  <p className="function-sig">{fn.signature}</p>
                  <ul className="function-guards" aria-label={`${fn.name} refuses with`}>
                    {fn.guards.map(guard => <li key={guard}>{guard}</li>)}
                  </ul>
                </div>
              </article>
            ))}
          </div>
          <aside className="functions-aside" aria-label="Reading the realm">
            <div>
              <h3>Read without signing</h3>
              <ul>{READ_FUNCTIONS.map(fn => <li key={fn}><code>{fn}</code></li>)}</ul>
            </div>
            <div>
              <h3>Events for indexers</h3>
              <ul>{EVENTS.map(event => <li key={event}><code>{event}</code></li>)}</ul>
            </div>
            <div>
              <h3>What it cannot do</h3>
              <ul>
                <li>Edit a question, its rules, its source or its oracle</li>
                <li>Withdraw collateral, for anyone</li>
                <li>Sell or cancel a position</li>
                <li>Learn a result by itself: only the pinned oracle can finalize</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <section className="source" aria-labelledby="guard-title">
        <div className="section-head">
          <h2 id="guard-title">The purchase guard</h2>
          <p>Three checks from <code>Buy</code>. The price, the payment and the collateral are verified by the chain for every trade.</p>
        </div>
        <pre className="code" tabIndex={0} aria-label="Excerpt from Buy in the 67 realm"><code>{SOURCE_EXCERPT.map(([kind, text], index) => <span key={index} className={`tok-${kind}`}>{text}</span>)}</code></pre>
      </section>
    </div>
  );
}
