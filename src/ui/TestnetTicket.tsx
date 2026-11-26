import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Outcome } from '../domain';
import { adenaActions, useAdenaWallet } from '../adena';
import { CHAIN, explorerTxUrl } from '../live/config';
import { DISPUTE_WINDOW, fetchMarkets, fetchPositions, feeUgnot, formatUgnot, maxPurchase, outcomePricePpm, parseGnot, quoteCost, sharesForTotal } from '../live/gno';
import type { ChainPosition } from '../live/gno';
import { refreshMarkets, refreshPositions, refreshTrades } from '../live/store';
import type { LiveState } from '../live/store';
import { canTrade } from '../view';
import type { MarketView } from '../view';
import { formatDayTime, formatPrice } from './format';
import { explainFailure } from '../live/failures';

// costUgnot is the price of the shares; feeUgnot the v2 service fee (0 in v1); the buyer sends both.
interface Review { outcome: Outcome; pricePpm: bigint; quoteVersion: number; microShares: bigint; costUgnot: bigint; feeUgnot: bigint }
type Phase =
  | { phase: 'idle' }
  | { phase: 'review'; review: Review }
  | { phase: 'signing'; review: Review }
  | { phase: 'confirming'; review: Review; hash: string | null }
  | { phase: 'confirmed'; review: Review; hash: string | null }
  | { phase: 'rejected'; review: Review }
  | { phase: 'failed'; review: Review; message: string }
  | { phase: 'changed'; review: Review; message: string }
  | { phase: 'unknown'; review: Review; message: string; hash: string | null };

const MIN_SPEND = 10_000n; // 0.01 GNOT
const FEE_HEADROOM = 300_000n; // leave room for gas and the storage deposit

function ugnotOf(coins: string): bigint {
  const match = /(?:^|,)(\d+)ugnot(?:,|$)/.exec(coins);
  return match ? BigInt(match[1]) : 0n;
}

function positionSpent(positions: ChainPosition[] | null, marketId: string, outcome: Outcome) {
  const position = positions?.find(item => item.marketId === marketId);
  return { spent: position?.spentUgnot ?? 0n, shares: position ? (outcome === 'Yes' ? position.yesMicroShares : position.noMicroShares) : 0n };
}

interface Props { market: MarketView; outcome: Outcome; onOutcome: (outcome: Outcome) => void; live?: LiveState; onOpenWallet: () => void }

export default function TestnetTicket({ market, outcome, onOutcome, onOpenWallet }: Props) {
  const wallet = useAdenaWallet();
  const chain = market.chain!;
  const [amount, setAmount] = useState('1');
  const [validation, setValidation] = useState('');
  const [state, setState] = useState<Phase>({ phase: 'idle' });
  const [switching, setSwitching] = useState<'idle' | 'busy' | 'rejected' | 'failed'>('idle');
  const dialog = useRef<HTMLDialogElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const operation = useRef(0);
  const baselineRef = useRef<{ spent: bigint; shares: bigint }>({ spent: 0n, shares: 0n });
  const connected = wallet.status === 'connected';
  const onNetwork = connected && wallet.network.chainId === CHAIN.chainId;
  const balance = connected ? ugnotOf(wallet.account.coins) : 0n;
  const price = outcomePricePpm(chain, outcome);
  const name = (value: 'Yes' | 'No') => chain.labels[value]; // a match market names its teams
  const spend = parseGnot(amount);
  const microShares = spend ? sharesForTotal(spend, price, chain.feePpm) : 0n;
  const cost = quoteCost(microShares, price);
  const fee = feeUgnot(microShares, price, chain.feePpm);
  const total = cost + fee;
  const limit = maxPurchase(chain, outcome);
  const tradable = canTrade(market);
  const expired = market.trading === 'open' && !market.quoteAvailable && chain.quoteExpiresAt !== null && limit.costUgnot > 0n;
  const blocked = !tradable
    ? (chain.finalized ? (chain.winner ? `This question resolved ${name(chain.winner)}. Claim winning positions in Portfolio.` : 'This market is void. Take your refund in Portfolio.')
      : market.trading === 'paused' ? 'Trading is paused in this market. Positions and claims are not affected.'
        : expired ? 'This price has expired. Trading resumes when the next quote is published.'
          : 'Trading has closed. The outcome is awaiting finalization by the oracle.')
    : limit.costUgnot === 0n ? `The market has no collateral left for ${name(outcome)} right now.` : '';

  useEffect(() => () => { operation.current += 1; }, []);
  useEffect(() => {
    if (state.phase !== 'idle' && !dialog.current?.open) dialog.current?.showModal();
    if (state.phase === 'idle' && dialog.current?.open) dialog.current.close();
  }, [state.phase]);

  // A quote revision while the review is open invalidates it before signing.
  useEffect(() => {
    if (state.phase !== 'review') return;
    if (state.review.quoteVersion !== chain.quoteVersion || state.review.pricePpm !== outcomePricePpm(chain, state.review.outcome) || !tradable) {
      setState({ phase: 'changed', review: state.review, message: 'The quote or market availability changed. Review the current terms before trying again.' });
    }
  }, [chain.quoteVersion, chain.yesPricePpm, chain.noPricePpm, tradable, state]);

  function close() {
    operation.current += 1;
    const wasActive = state.phase !== 'idle';
    setState({ phase: 'idle' });
    dialog.current?.close();
    if (wasActive) (reviewButton.current?.disabled ? amountInput.current : reviewButton.current)?.focus();
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected) { onOpenWallet(); return; }
    if (!onNetwork) return;
    let error = blocked;
    if (!error && spend === null) error = 'Enter an amount in GNOT with up to 6 decimal places.';
    if (!error && spend !== null && spend < MIN_SPEND) error = 'Enter at least 0.01 GNOT.';
    if (!error && microShares <= 0n) error = 'This amount buys no shares at the current price.';
    if (!error && total > limit.costUgnot) error = `This market can take up to ${formatUgnot(limit.costUgnot)} GNOT on ${name(outcome)} right now.`;
    if (!error && total > balance) error = `This amount exceeds your ${formatUgnot(balance)} GNOT balance.`;
    if (error) { setValidation(error); amountInput.current?.focus(); return; }
    setValidation('');
    setState({ phase: 'review', review: { outcome, pricePpm: price, quoteVersion: chain.quoteVersion, microShares, costUgnot: cost, feeUgnot: fee } });
  }

  async function confirm() {
    if (state.phase !== 'review' || wallet.status !== 'connected') return;
    const reviewed = state.review;
    const token = ++operation.current;
    const current = () => token === operation.current;
    const owner = wallet.account.address;
    setState({ phase: 'signing', review: reviewed });
    // Re-read the market and the position: the contract checks the price
    // anyway, but a known change should never reach the wallet prompt.
    let baseline;
    try {
      const [markets, positions] = await Promise.all([fetchMarkets(CHAIN.rpcUrl, chain.realm, undefined, chain.version), fetchPositions(CHAIN.rpcUrl, chain.realm, owner, undefined, chain.version)]);
      if (!current()) return;
      const latest = markets.find(item => item.id === chain.id);
      if (!latest || latest.quoteVersion !== reviewed.quoteVersion || outcomePricePpm(latest, reviewed.outcome) !== reviewed.pricePpm || latest.state !== 'open' || latest.realmPaused) {
        void refreshMarkets();
        setState({ phase: 'changed', review: reviewed, message: 'The quote changed since your review. Review the new price before trying again.' });
        return;
      }
      baseline = positionSpent(positions, chain.id, reviewed.outcome);
      baselineRef.current = baseline;
    } catch {
      if (!current()) return;
      setState({ phase: 'failed', review: reviewed, message: 'The network could not be read, so nothing was sent. Try again in a moment.' });
      return;
    }
    const result = await adenaActions.call({ pkgPath: chain.realm, func: 'Buy', args: [chain.id, reviewed.outcome, reviewed.microShares.toString(), reviewed.pricePpm.toString()], sendUgnot: reviewed.costUgnot + reviewed.feeUgnot });
    if (!current()) return;
    if (result.status === 'rejected') { setState({ phase: 'rejected', review: reviewed }); return; }
    if (result.status === 'failed') {
      const explained = explainFailure(result.chainLog, result.message === 'The transaction was not executed.' ? 'The transaction was not executed. No position was created; only a network fee may have been charged.' : result.message);
      if (explained.changed) void refreshMarkets();
      setState(explained.changed ? { phase: 'changed', review: reviewed, message: explained.message } : { phase: 'failed', review: reviewed, message: explained.message });
      return;
    }
    const hash = result.status === 'sent' || result.status === 'broadcast' ? result.hash : null;
    setState({ phase: 'confirming', review: reviewed, hash });
    await reconcile(token, owner, reviewed, baseline, hash, result.status === 'unknown' ? result.message : null);
  }

  // A purchase is confirmed only when the contract shows the new position.
  async function reconcile(token: number, owner: string, reviewed: Review, baseline: { spent: bigint; shares: bigint }, hash: string | null, unknownMessage: string | null) {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (token !== operation.current) return;
      try {
        const positions = await fetchPositions(CHAIN.rpcUrl, chain.realm, owner, undefined, chain.version);
        const now = positionSpent(positions, chain.id, reviewed.outcome);
        if (now.spent >= baseline.spent + reviewed.costUgnot && now.shares >= baseline.shares + reviewed.microShares) {
          if (token !== operation.current) return;
          setState({ phase: 'confirmed', review: reviewed, hash });
          void refreshMarkets(); void refreshPositions(owner); void refreshTrades();
          return;
        }
      } catch { /* keep polling until the deadline */ }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (token !== operation.current) return;
    setState({ phase: 'unknown', review: reviewed, hash, message: unknownMessage ?? 'The contract does not show this purchase yet. It may still be pending, or it may not have been included.' });
    void refreshPositions(owner);
  }

  function checkAgain() {
    if (state.phase !== 'unknown' || wallet.status !== 'connected') return;
    const token = ++operation.current;
    setState({ phase: 'confirming', review: state.review, hash: state.hash });
    void reconcile(token, wallet.account.address, state.review, baselineRef.current, state.hash, null);
  }

  async function switchNetwork() {
    setSwitching('busy');
    const result = await adenaActions.switchNetwork({ chainId: CHAIN.chainId, chainName: CHAIN.chainName, rpcUrl: CHAIN.rpcUrl });
    setSwitching(result === 'switched' ? 'idle' : result);
  }

  const r = state.phase === 'idle' ? null : state.review;
  const title = state.phase === 'confirmed' ? 'Position confirmed' : state.phase === 'rejected' ? 'Transaction rejected' : state.phase === 'failed' ? 'Transaction not executed'
    : state.phase === 'changed' ? 'Review required again' : state.phase === 'unknown' ? 'Result not confirmed yet' : 'Review your position';
  const status = state.phase === 'signing' ? 'Approve the transaction in Adena. Nothing is sent until you approve.'
    : state.phase === 'confirming' ? 'Sent. Waiting for the contract to show your position.'
    : state.phase === 'confirmed' ? 'The contract shows your new position.'
    : state.phase === 'rejected' ? 'You rejected the transaction in Adena. Nothing was sent.'
    : state.phase === 'failed' || state.phase === 'changed' || state.phase === 'unknown' ? state.message : '';
  const txUrl = state.phase !== 'idle' && 'hash' in state && state.hash ? explorerTxUrl(state.hash) : null;
  const busy = state.phase === 'signing' || state.phase === 'confirming';
  const remainder = balance - total;

  // A closed market has nothing to buy: show only what happens next.
  if (!tradable) {
    return (
      <aside id="trade-panel" className="ticket ticket-closed" aria-labelledby="trade-heading">
        <div className="ticket-head">
          <h2 id="trade-heading" tabIndex={-1}>{chain.finalized ? 'Result' : chain.state === 'proposed' ? 'Result proposed' : market.trading === 'paused' ? 'Trading paused' : expired ? 'Price expired' : 'Trading closed'}</h2>
          <p className="ticket-venue"><span className="venue-mark testnet">{CHAIN.chainName}</span></p>
        </div>
        {chain.finalized && chain.outcome === 'Void'
          ? <p className="ticket-closed-line">The market is void. Every holder takes back what they paid, the fee included.</p>
          : chain.finalized
            ? <p className="ticket-closed-line"><span className={chain.winner === 'Yes' ? 'yes-text' : 'no-text'}>{chain.winner && name(chain.winner)}</span> won. Each {chain.winner && name(chain.winner)} share pays 1 GNOT from this market’s collateral.</p>
            : chain.state === 'proposed'
              ? <p className="ticket-closed-line">The oracle proposed <span className={chain.outcome === 'Yes' ? 'yes-text' : chain.outcome === 'No' ? 'no-text' : ''}>{chain.outcome === 'Yes' || chain.outcome === 'No' ? name(chain.outcome) : chain.outcome}</span>. Anyone can make it final from {formatDayTime(chain.proposedAt + DISPUTE_WINDOW)} unless the guardian cancels it first.</p>
              : market.trading === 'paused'
                ? <p className="ticket-closed-line">New purchases are paused. Positions and claims are not affected.</p>
                : expired
                  ? <p className="ticket-closed-line">The last price is older than the contract accepts. Trading resumes when the next quote is published.</p>
                  : <p className="ticket-closed-line">Trading has closed. The result is recorded here by the market’s oracle once Polymarket settles it.</p>}
        {chain.finalized && <a className="button primary block" href="#/portfolio">{chain.outcome === 'Void' ? 'Take your refund in Portfolio' : 'Claim in Portfolio'}</a>}
      </aside>
    );
  }

  let action;
  if (!connected) action = <button ref={reviewButton} type="submit" className="button primary block">Connect Adena</button>;
  else if (!onNetwork) action = <button type="button" className="button primary block" disabled={switching === 'busy'} onClick={switchNetwork}>{switching === 'busy' ? 'Approve in Adena…' : `Switch to ${CHAIN.chainName}`}</button>;
  else action = <button ref={reviewButton} type="submit" className={`button primary block${outcome === 'No' ? ' side-no' : ''}`} disabled={Boolean(blocked) || busy}>Review trade</button>;

  return (
    <aside id="trade-panel" className="ticket" aria-labelledby="trade-heading">
      <div className="ticket-head">
        <h2 id="trade-heading" tabIndex={-1}>Take a position</h2>
        <p className="ticket-venue"><span className="venue-mark testnet">{CHAIN.chainName}</span><span>Paid in test GNOT through Adena</span></p>
      </div>
      <form onSubmit={review} noValidate>
        <fieldset className={`outcome-picker${chain.labels.Yes !== 'Yes' ? ' named' : ''}`}>
          <legend>Outcome <span>GNOT per share</span></legend>
          {(['Yes', 'No'] as const).map(value => (
            <label key={value} className={`outcome-option ${value.toLowerCase()}${outcome === value ? ' selected' : ''}`}>
              <input type="radio" name={`outcome-${market.id}`} value={value} checked={outcome === value} onChange={() => { onOutcome(value); setValidation(''); }} />
              <span>{name(value)}</span><strong>{formatPrice(Number(outcomePricePpm(chain, value)) / 1e6)}</strong>
            </label>
          ))}
        </fieldset>
        <div className="amount-field">
          <label htmlFor="trade-amount">Amount</label>
          <div className="amount-input">
            <input ref={amountInput} id="trade-amount" name="amount" inputMode="decimal" autoComplete="off" value={amount}
              aria-invalid={Boolean(validation)} aria-describedby="trade-amount-help trade-validation"
              onChange={event => { setAmount(event.target.value.replace(',', '.')); setValidation(''); }} />
            <span aria-hidden="true">GNOT</span>
          </div>
        </div>
        <p id="trade-amount-help" className="field-help">
          {connected ? <>Balance {formatUgnot(balance)} GNOT. Market capacity on {name(outcome)}: {formatUgnot(limit.costUgnot, 2)} GNOT.</> : 'Connect Adena to trade with test GNOT.'}
        </p>
        <div className="quick-amounts" role="group" aria-label="Set GNOT amount">
          {['0.5', '1', '5'].map(value => <button type="button" key={value} onClick={() => { setAmount(value); setValidation(''); }}>{value}</button>)}
          {connected && onNetwork && balance > FEE_HEADROOM && <button type="button" onClick={() => {
            const max = [balance - FEE_HEADROOM, limit.costUgnot].reduce((a, b) => (a < b ? a : b));
            setAmount(formatUgnot(max, 6, 0).replace(/,/g, '')); setValidation('');
          }}>Max</button>}
        </div>
        <dl className={`ticket-summary${chain.feePpm > 0 ? ' with-fee' : ''}`}>
          <div><dt>Shares</dt><dd>{formatUgnot(microShares, 2)}</dd></div>
          {chain.feePpm > 0 && <div><dt>Fee</dt><dd>{formatUgnot(fee)} GNOT</dd></div>}
          <div><dt>You pay</dt><dd>{formatUgnot(total)} GNOT</dd></div>
          <div><dt>If {name(outcome)} wins</dt><dd>{formatUgnot(microShares, 2)} GNOT</dd></div>
        </dl>
        {connected && onNetwork && total > 0n && remainder >= 0n && remainder < FEE_HEADROOM && <p className="field-help caution">Keep a little GNOT for the network fee and storage deposit.</p>}
        <p id="trade-validation" className="form-error" role="alert">{validation}</p>
        {blocked && <p className="ticket-blocked" role="status">{blocked}</p>}
        {switching === 'rejected' && <p className="form-error" role="alert">The network switch was declined in Adena.</p>}
        {switching === 'failed' && <p className="form-error" role="alert">Adena could not switch networks. Select {CHAIN.chainName} in the extension.</p>}
        {action}
        {CHAIN.faucetUrl && connected && onNetwork && balance < 1_000_000n && <a className="text-link" href={CHAIN.faucetUrl} target="_blank" rel="noopener noreferrer">Get test GNOT from the faucet<span className="sr-only"> (opens in a new tab)</span></a>}
        <p className="ticket-note">A winning share pays 1 GNOT after the oracle finalizes the outcome. You can lose the full amount.{chain.feePpm > 0 ? ` The fee is ${formatPrice(chain.feePpm / 1e6)} × shares × price × (1 − price), fixed for this market and returned if it is void.` : ''} Test GNOT has no market value.</p>
      </form>

      <dialog ref={dialog} className="dialog review-dialog" aria-labelledby="trade-dialog-heading"
        onCancel={event => { event.preventDefault(); if (!busy) close(); }} onClose={() => { if (state.phase !== 'idle') close(); }}>
        {r && <>
          <div className="dialog-header">
            <h2 id="trade-dialog-heading">{title}</h2>
            <button type="button" className="dialog-close" onClick={close} aria-label="Close trade review" disabled={state.phase === 'signing'}>×</button>
          </div>
          <p className="review-question">{market.question}</p>
          <p className="review-venue"><span className="venue-mark testnet">{CHAIN.chainName}</span><span>A real transaction on the Gno testnet, signed in Adena</span></p>
          <dl className="review-list">
            <div><dt>Outcome</dt><dd className={r.outcome === 'Yes' ? 'yes-text' : 'no-text'}>{name(r.outcome)}</dd></div>
            <div><dt>Price</dt><dd>{formatPrice(Number(r.pricePpm) / 1e6)} GNOT / share</dd></div>
            <div><dt>Shares</dt><dd>{formatUgnot(r.microShares, 6)}</dd></div>
            {r.feeUgnot > 0n && <div><dt>Shares cost</dt><dd>{formatUgnot(r.costUgnot, 6)} GNOT</dd></div>}
            {r.feeUgnot > 0n && <div><dt>Service fee</dt><dd>{formatUgnot(r.feeUgnot, 6)} GNOT</dd></div>}
            <div><dt>You pay</dt><dd>{formatUgnot(r.costUgnot + r.feeUgnot, 6)} GNOT</dd></div>
            <div><dt>Payout if {name(r.outcome)} wins</dt><dd>{formatUgnot(r.microShares, 6)} GNOT</dd></div>
            <div><dt>Maximum loss</dt><dd>{formatUgnot(r.costUgnot + r.feeUgnot, 6)} GNOT</dd></div>
            <div><dt>Contract</dt><dd className="mono">{chain.realm}</dd></div>
          </dl>
          <div className={`transaction-status phase-${state.phase}`} role="status" aria-live="polite">{status}</div>
          {txUrl && <a className="text-link" href={txUrl} target="_blank" rel="noopener noreferrer">View transaction<span className="sr-only"> (opens in a new tab)</span></a>}
          {state.phase === 'review' && <>
            <p className="muted">Adena shows the network fee and a refundable storage deposit before you approve. The contract refuses the purchase if the price differs from this review.</p>
            <div className="dialog-actions"><button type="button" className="button" onClick={close}>Back</button><button type="button" className={`button primary${state.review.outcome === 'No' ? ' side-no' : ''}`} onClick={() => void confirm()}>Confirm in Adena</button></div>
          </>}
          {busy && <div className="dialog-actions"><button type="button" className="button primary" disabled>{state.phase === 'signing' ? 'Waiting for Adena…' : 'Confirming on chain…'}</button></div>}
          {state.phase === 'confirmed' && <div className="dialog-actions"><button type="button" className="button" onClick={close}>Done</button><a className="button primary" href="#/portfolio" onClick={close}>View portfolio</a></div>}
          {state.phase === 'unknown' && <div className="dialog-actions"><button type="button" className="button" onClick={close}>Close</button><button type="button" className="button primary" onClick={checkAgain}>Check again</button></div>}
          {(state.phase === 'rejected' || state.phase === 'failed' || state.phase === 'changed') && <div className="dialog-actions"><button type="button" className="button primary" onClick={close}>Return to trade</button></div>}
        </>}
      </dialog>
    </aside>
  );
}
