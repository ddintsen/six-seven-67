// Status: what the realm holds, what Polymarket says and what Polygon has
// settled, for every market. People who hold a role on the realm (the oracle,
// the administrator) also get the actions it needs; Adena signs every one.
import { useState } from 'react';
import { adenaActions, useAdenaWallet } from '../adena';
import type { ContractCall } from '../adena';
import { CHAIN, explorerTxUrl } from '../live/config';
import { formatUgnot } from '../live/gno';
import type { Action, MarketStatus } from '../live/oracle';
import { refreshMarkets } from '../live/store';
import { refreshStatus, statusSnapshot, useStatus } from '../live/status';
import type { Roles } from '../live/status';
import { formatClock, formatDay, formatPrice, shortAddress } from './format';

const price = (ppm: number | null) => (ppm == null ? null : formatPrice(ppm / 1_000_000));

function polygonLabel(state: string): string {
  switch (state) {
    case 'Yes': case 'No': return `Settled ${state}`;
    case 'void': return 'Settled 50-50';
    case 'unresolved': return 'Not settled';
    case 'unprepared': return 'Not on Polygon yet';
    case 'invalid': return 'Unexpected payout';
    default: return 'No answer';
  }
}
function realmLabel(m: MarketStatus): string {
  if (m.realm.state === 'final') return m.realm.outcome === 'Void' ? 'Final, void: refunds open' : `Final, ${m.realm.winner} won`;
  if (m.realm.state === 'proposed') return `${m.realm.outcome} proposed, final from ${formatDay(m.realm.proposedAt + 24 * 3600)}`;
  if (m.realm.state === 'closed') return 'Trading closed, waiting for the result';
  if (m.realm.state === 'paused') return 'Paused';
  return `Open until ${formatDay(m.realm.closesAt)}`;
}

type Phase = { phase: 'idle' } | { phase: 'signing' } | { phase: 'confirming' } | { phase: 'done'; message: string; hash: string | null } | { phase: 'error'; message: string };

// One signed action: send through Adena, then read the realm until the expected
// state shows. An unanswered request is never resent automatically.
function useAction() {
  const [state, setState] = useState<Phase>({ phase: 'idle' });
  async function run(calls: ContractCall | ContractCall[], settled: () => Promise<boolean>, done: string) {
    setState({ phase: 'signing' });
    const result = await adenaActions.call(calls);
    if (result.status === 'rejected') { setState({ phase: 'error', message: 'Rejected in Adena. Nothing was sent.' }); return; }
    if (result.status === 'failed') { setState({ phase: 'error', message: explain(result.chainLog || result.message) }); void refreshStatus(); return; }
    const hash = result.status === 'sent' || result.status === 'broadcast' ? result.hash : null;
    setState({ phase: 'confirming' });
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      await refreshStatus();
      if (await settled()) { setState({ phase: 'done', message: done, hash }); void refreshMarkets(); return; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    setState({ phase: 'error', message: 'The realm does not show the change yet. Refresh in a minute before trying again.' });
  }
  return { state, run };
}

function explain(log: string): string {
  if (/oracle only/.test(log)) return 'Only this market’s oracle can sign its result.';
  if (/administrator only|quoter only/.test(log)) return 'Only the administrator or the quoter can change prices.';
  if (/an outcome is already proposed or final/.test(log)) return 'A result is already proposed or final for this market.';
  if (/the dispute window is still open/.test(log)) return 'The dispute window has not ended yet.';
  if (/market is not open/.test(log)) return 'A market in this change is not open any more. Nothing was applied.';
  if (/quote version changed/.test(log)) return 'A price changed in the meantime. Nothing was applied; review the new prices and try again.';
  if (/outcome already final/.test(log)) return 'This market is already final.';
  if (/source binding mismatch/.test(log)) return 'The result does not match the market’s source. Nothing was applied.';
  if (/pending administrator only/.test(log)) return 'This account is not the proposed administrator.';
  return log || 'The transaction was not executed.';
}

function ActionStatus({ state }: { state: Phase }) {
  const url = state.phase === 'done' && state.hash ? explorerTxUrl(state.hash) : null;
  const text = state.phase === 'signing' ? 'Approve in Adena.' : state.phase === 'confirming' ? 'Sent. Reading the realm…' : state.phase === 'done' ? state.message : state.phase === 'error' ? state.message : '';
  return <p className={`action-status${state.phase === 'error' ? ' is-error' : ''}`} role="status">{text}{url && <> <a className="text-link" href={url} target="_blank" rel="noopener noreferrer">View transaction<span className="sr-only"> (opens in a new tab)</span></a></>}</p>;
}

const currentMarkets = (): MarketStatus[] => { const s = statusSnapshot(); return s.status === 'ready' ? s.markets : []; };

function ResultToSign({ market, oracle, me, onDone }: { market: MarketStatus; oracle: string; me: string | null; onDone: (message: string) => void }) {
  const finalize = market.actions.find((a): a is Extract<Action, { kind: 'finalize' }> => a.kind === 'finalize')!;
  const outcome = finalize.outcome;
  // A match market names its teams; the contract still takes Yes or No.
  const said = outcome === 'Yes' || outcome === 'No' ? (market.labels[outcome] === outcome ? outcome : `${market.labels[outcome]} (${outcome})`) : outcome;
  const proposal = finalize.func === 'ProposeOutcome';
  const { state, run } = useAction();
  const mine = me === oracle;
  const busy = state.phase === 'signing' || state.phase === 'confirming';
  const sign = async () => {
    const message = proposal
      ? `${said} is proposed for “${market.question}”. It becomes final after 24 hours unless the guardian cancels it.`
      : `“${market.question}” is final: ${said} won. Holders can claim now.`;
    await run({ pkgPath: market.realmPath, func: finalize.func, args: finalize.args, sendUgnot: 0n },
      async () => {
        const s = currentMarkets().find(m => m.id === market.id);
        const ok = proposal ? s?.realm.state === 'proposed' && s.realm.outcome === outcome : s?.realm.state === 'final' && s.realm.winner === outcome;
        if (ok) onDone(message);
        return Boolean(ok);
      }, message);
  };
  const tone = outcome === 'Yes' ? 'yes-text' : outcome === 'No' ? 'no-text' : '';
  return (
    <article className="result-card" aria-labelledby={`result-${market.id}`}>
      <h3 id={`result-${market.id}`}><a href={`#/market/${market.id}`}>{market.question}</a></h3>
      <p className="result-line">{outcome === 'Void' ? <>Settled 50-50 on Polygon, so the market is void and every holder is refunded.</> : <><span className={tone}>{said}</span> on Polygon, and Polymarket’s own record agrees.</>}</p>
      <p className="result-evidence"><span className="muted">Evidence</span> <span className="mono">{finalize.evidenceHash}</span></p>
      {mine
        ? <button type="button" className={`button primary${outcome === 'No' ? ' side-no' : ''}`} disabled={busy || state.phase === 'done'} onClick={() => void sign()}>
            {busy ? 'Signing…' : `${proposal ? 'Propose' : 'Sign'} ${said} in Adena`}</button>
        : <p className="muted">Only this market’s oracle, <span className="mono">{shortAddress(oracle)}</span>, can sign it.</p>}
      <ActionStatus state={state} />
    </article>
  );
}

// Every result this account may sign, in one Adena transaction: all apply or none.
function SignAll({ markets, onDone }: { markets: MarketStatus[]; onDone: (message: string) => void }) {
  const { state, run } = useAction();
  const busy = state.phase === 'signing' || state.phase === 'confirming';
  const finalizes = markets.map(m => ({ m, a: m.actions.find((x): x is Extract<Action, { kind: 'finalize' }> => x.kind === 'finalize')! }));
  const ids = new Set(markets.map(m => m.id));
  const proposal = finalizes.every(({ a }) => a.func === 'ProposeOutcome');
  const message = proposal ? `${markets.length} results are proposed. They become final after 24 hours unless the guardian cancels them.` : `${markets.length} results are signed.`;
  const send = () => run(finalizes.map(({ m, a }) => ({ pkgPath: m.realmPath, func: a.func, args: a.args, sendUgnot: 0n })),
    async () => { const ok = currentMarkets().every(m => !ids.has(m.id) || m.realm.state === 'proposed' || m.realm.state === 'final'); if (ok) onDone(message); return ok; }, message);
  return (
    <div className="sign-all">
      <button type="button" className="button primary" disabled={busy || state.phase === 'done'} onClick={() => void send()}>
        {busy ? 'Signing…' : `Sign all ${markets.length} in Adena`}</button>
      <p className="muted">One signature for every result below, each exactly as Polygon settled it.</p>
      <ActionStatus state={state} />
    </div>
  );
}

// v2: proposals past their 24 hours. Anyone may send Finalize; one signature makes them all final.
function ReadyToFinalize({ markets, onDone }: { markets: MarketStatus[]; onDone: (message: string) => void }) {
  const { state, run } = useAction();
  const busy = state.phase === 'signing' || state.phase === 'confirming';
  const ids = new Set(markets.map(m => m.id));
  const message = markets.length === 1 ? 'The result is final. Holders can claim now.' : `${markets.length} results are final. Holders can claim now.`;
  const send = () => run(markets.map(m => ({ pkgPath: m.realmPath, func: 'Finalize', args: [m.id], sendUgnot: 0n })),
    async () => { const ok = currentMarkets().every(m => !ids.has(m.id) || m.realm.state === 'final'); if (ok) onDone(message); return ok; }, message);
  return (
    <div className="price-update">
      <ul className="change-list">{markets.map(m => <li key={m.id}><span>{m.question}</span><span className="change-value">{m.realm.outcome}</span></li>)}</ul>
      <button type="button" className="button primary" disabled={busy || state.phase === 'done'} onClick={() => void send()}>
        {busy ? 'Signing…' : markets.length === 1 ? 'Make it final in Adena' : `Make ${markets.length} results final in Adena`}</button>
      <ActionStatus state={state} />
    </div>
  );
}

function PriceUpdate({ markets }: { markets: MarketStatus[] }) {
  const { state, run } = useAction();
  const changes = markets.flatMap(m => m.actions.filter((a): a is Extract<Action, { kind: 'requote' | 'brake' | 'pause' }> => a.kind === 'requote' || a.kind === 'brake' || a.kind === 'pause')
    .map(a => ({ market: m, kind: a.kind, price: 'yesPricePpm' in a ? a.yesPricePpm : m.realm.yesPricePpm, noPrice: a.kind === 'requote' ? a.noPricePpm : 0 })));
  const busy = state.phase === 'signing' || state.phase === 'confirming';
  if (changes.length === 0 && state.phase === 'idle') return <p className="muted status-note">Every open price is within a cent of Polymarket.</p>;
  // v1 quotes Yes only; v2 quotes both sides. v2 pauses where v1 would brake.
  const calls: ContractCall[] = changes.map(c => c.kind === 'pause'
    ? { pkgPath: c.market.realmPath, func: 'Pause', args: [c.market.id], sendUgnot: 0n }
    : { pkgPath: c.market.realmPath, func: 'SetQuote', args: c.market.version === 2 ? [c.market.id, String(c.price), String(c.noPrice), String(c.market.realm.quoteVersion)] : [c.market.id, String(c.price), String(c.market.realm.quoteVersion)], sendUgnot: 0n });
  const expected = new Map(changes.map(c => [c.market.id, c]));
  const send = () => run(calls, async () => currentMarkets().every(m => { const c = expected.get(m.id); return !c || (c.kind === 'pause' ? m.realm.state !== 'open' : m.realm.yesPricePpm === c.price); }),
    changes.some(c => c.kind === 'pause') ? (changes.length === 1 ? 'The change is live.' : `${changes.length} changes are live.`)
      : changes.length === 1 ? 'The new price is live.' : `${changes.length} new prices are live.`);
  return (
    <div className="price-update">
      {changes.length > 0 && <h3 className="change-title">{changes.length === 1 ? '1 price to change' : `${changes.length} prices to change`}</h3>}
      {changes.length > 0 && <ul className="change-list">
        {changes.map(c => <li key={c.market.id}><span>{c.market.question}</span><span className="change-value">{c.kind === 'pause' ? 'Pause trading' : <>Yes {price(c.market.realm.yesPricePpm)} → {price(c.price)}{c.kind === 'brake' ? ', trading stops at the final price' : ''}</>}</span></li>)}
      </ul>}
      {changes.length > 0 && <button type="button" className="button primary" disabled={busy} onClick={() => void send()}>
        {busy ? 'Signing…' : changes.length === 1 ? 'Update 1 price in Adena' : `Update ${changes.length} prices in Adena`}</button>}
      <ActionStatus state={state} />
    </div>
  );
}

// A role waiting for this account: v1's administrator, or a v2 role.
interface Pending { label: string; call: ContractCall; holds: (roles: Roles) => boolean }
function pendingFor(me: string, roles: Roles): Pending[] {
  const out: Pending[] = [];
  if (roles.pending === me) out.push({ label: 'administrator', call: { pkgPath: CHAIN.realm, func: 'AcceptAdministrator', args: [], sendUgnot: 0n }, holds: r => r.administrator === me });
  const v2 = roles.v2;
  const v2Path = CHAIN.realmV2;
  if (v2 && v2Path) {
    const roleMap = [['admin', 'administrator of v2', 'pendingAdministrator', 'administrator'], ['quoter', 'quoter', 'pendingQuoter', 'quoter'], ['guardian', 'guardian', 'pendingGuardian', 'guardian'], ['lister', 'lister', 'pendingLister', 'lister']] as const;
    for (const [role, label, pendingKey, holderKey] of roleMap) {
      if (v2[pendingKey] === me) out.push({ label, call: { pkgPath: v2Path, func: 'AcceptRole', args: [role], sendUgnot: 0n }, holds: r => r.v2?.[holderKey] === me });
    }
  }
  return out;
}

function AcceptRole({ pending, onDone }: { pending: Pending; onDone: (message: string) => void }) {
  const { state, run } = useAction();
  const done = `This account is the ${pending.label} now.`;
  const accepted = async () => { const s = statusSnapshot(); const ok = s.status === 'ready' && pending.holds(s.roles); if (ok) onDone(done); return ok; };
  const busy = state.phase === 'signing' || state.phase === 'confirming';
  return (
    <div className="role-notice">
      <p>The {pending.label} role is waiting for this account.</p>
      <button type="button" className="button primary small" disabled={busy || state.phase === 'done'} onClick={() => void run(pending.call, accepted, done)}>
        {busy ? 'Signing…' : 'Accept in Adena'}</button>
      <ActionStatus state={state} />
    </div>
  );
}

export default function StatusPage() {
  const load = useStatus();
  const wallet = useAdenaWallet();
  const me = wallet.status === 'connected' ? wallet.account.address : null;
  const [notice, setNotice] = useState<string | null>(null);

  const head = (
    <div className="page-head">
      <div className="page-title">
        <h1>Status</h1>
        <p className="venue-note"><span className="venue-mark testnet">{CHAIN.chainName}</span>
          {load.status === 'ready' && <span>Block {load.chain.height.toLocaleString('en-US')}, read at {formatClock(load.observedAt / 1000)} UTC</span>}</p>
      </div>
    </div>
  );

  if (load.status === 'missing') return <div className="status-page">{head}<section className="page-state"><h2>The 67 realm is not on {CHAIN.chainName} yet</h2><p>Its status appears here once it is deployed.</p></section></div>;
  if (load.status === 'error') return <div className="status-page">{head}<section className="page-state"><h2>The status could not be read</h2><p>{load.message}</p><button type="button" className="button" onClick={() => void refreshStatus()}>Try again</button></section></div>;
  if (load.status !== 'ready') return <div className="status-page">{head}<section className="page-state" aria-busy="true"><h2>Reading the realm, Polymarket and Polygon</h2><p>This takes a few seconds.</p></section></div>;

  const { markets, oracles, roles, banks } = load;
  const toSign = markets.filter(m => m.actions.some(a => a.kind === 'finalize'));
  const toSettle = markets.filter(m => m.actions.some(a => a.kind === 'settle'));
  const admin = me !== null && me === roles.administrator;
  const quoterV2 = me !== null && roles.v2 !== null && (me === roles.v2.quoter || me === roles.v2.administrator);
  // Who may change a market's price: v1's administrator; v2's quoter or administrator.
  const quotable = markets.filter(m => (m.version === 1 && admin) || (m.version === 2 && quoterV2));
  const oracleOf = me ? markets.filter(m => oracles[m.id] === me).length : 0;
  const attention = markets.flatMap(m => m.alerts.filter(a => a.severity !== 'notice' && !a.key.includes(':resolved:')).map(a => ({ key: a.key, question: m.question, text: a.title.replace(`${m.id}: `, '') })));
  const pending = me ? pendingFor(me, roles) : [];

  return (
    <div className="status-page">
      {head}
      <p className="status-lede">For every market: what the 67 realm holds, Polymarket’s price and what Polygon has settled. Read again every minute.</p>

      {me && (admin || quoterV2 || oracleOf > 0) && <p className="role-line">This account is {[admin && 'the administrator', quoterV2 && !admin && 'the quoter', oracleOf > 0 && `the oracle of ${oracleOf === 1 ? '1 market' : `${oracleOf} markets`}`].filter(Boolean).join(' and ')}.</p>}
      <p className={notice ? 'inline-notice success' : 'sr-only'} role="status">{notice}</p>
      {pending.map(p => <AcceptRole key={p.label} pending={p} onDone={setNotice} />)}

      {toSign.length > 0 && (
        <section className="status-section" aria-labelledby="results-title">
          <h2 id="results-title">Results to sign</h2>
          {me && toSign.filter(m => oracles[m.id] === me).length > 1 && <SignAll markets={toSign.filter(m => oracles[m.id] === me)} onDone={setNotice} />}
          {toSign.map(m => <ResultToSign key={m.id} market={m} oracle={oracles[m.id]} me={me} onDone={setNotice} />)}
        </section>
      )}

      {toSettle.length > 0 && (
        <section className="status-section" aria-labelledby="settle-title">
          <h2 id="settle-title">Ready to make final</h2>
          <p className="muted status-note">These results were proposed more than 24 hours ago and nobody cancelled them. Anyone can make them final.</p>
          <ReadyToFinalize markets={toSettle} onDone={setNotice} />
        </section>
      )}

      {attention.length > 0 && (
        <section className="status-section" aria-labelledby="attention-title">
          <h2 id="attention-title">Needs attention</h2>
          <ul className="attention-list">{attention.map(a => <li key={a.key}><span className="attention-question">{a.question}</span>{a.text}</li>)}</ul>
        </section>
      )}

      <section className="status-section" aria-labelledby="markets-title">
        <h2 id="markets-title">Markets</h2>
        {markets.length === 0 ? <p className="muted">No markets are listed yet.</p> : (
          <div className="ledger status-ledger">
            <div className="ledger-head" aria-hidden="true"><span>Market</span><span>Our Yes</span><span>Polymarket Yes</span><span>Polygon</span></div>
            {markets.map(m => (
              <article key={m.id} className="ledger-row" aria-labelledby={`status-${m.id}`}>
                <div className="ledger-question">
                  <h3 id={`status-${m.id}`}><a href={`#/market/${m.id}`}>{m.question}</a></h3>
                  <p className="muted">{realmLabel(m)}</p>
                </div>
                <dl className="ledger-values">
                  <div><dt>Our Yes</dt><dd>{m.realm.state === 'final' ? <span>–</span> : price(m.realm.yesPricePpm)}</dd></div>
                  <div><dt>Polymarket Yes</dt><dd>{price(m.polymarket.midYesPpm) ?? <span>{m.polymarket.reachable ? '–' : 'No answer'}</span>}</dd></div>
                  <div><dt>Polygon</dt><dd className={m.polygon.state === 'Yes' ? 'yes-text' : m.polygon.state === 'No' ? 'no-text' : ''}>{polygonLabel(m.polygon.state)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}
        {quotable.length > 0 && <PriceUpdate markets={quotable} />}
      </section>

      <section className="status-section" aria-labelledby="collateral-title">
        <h2 id="collateral-title">Collateral</h2>
        {banks.map(bank => {
          const covered = bank.balanceUgnot === null ? null : bank.balanceUgnot >= bank.escrowUgnot;
          const name = banks.length > 1 ? (bank.version === 2 ? 'Realm v2' : 'Realm v1') : 'The realm';
          return <p key={bank.realm} className={covered === false ? 'collateral-line is-error' : 'collateral-line'}>
            {bank.balanceUgnot === null ? `${name}’s balance could not be read. Its markets hold ${formatUgnot(bank.escrowUgnot)} GNOT in escrow.`
              : `${name} holds ${formatUgnot(bank.balanceUgnot)} GNOT against ${formatUgnot(bank.escrowUgnot)} GNOT ${bank.version === 2 ? 'of escrow and fees' : 'of escrow'}.`}
          </p>;
        })}
        <p className="muted status-note">Realm address <span className="mono">{banks[0]?.address}</span>. Administrator <span className="mono">{shortAddress(roles.administrator)}</span>.</p>
      </section>
    </div>
  );
}
