import { useId, useState } from 'react';
import { formatUgnot, parseGnot, quoteCost, sharesForSpend } from '../live/gno';
import { CHAIN } from '../live/config';
import { Scene } from '../brand/Scene';
import type { SceneData } from '../brand/Scene';
import { CLAIM_PAYOUT, COLLATERAL_VAULT, ORACLE_RESULT, PRICE_SPLIT, QUESTION_FROZEN, REVIEW_TICKET, SHARE_PAYS, UNITS_SPLIT } from '../brand/scenes';

const SCALE = 1_000_000n;

// The same integer arithmetic the realm and the ticket use: shares round
// down, the cost rounds up to the next ugnot.
function Workbench() {
  const id = useId();
  const [outcome, setOutcome] = useState<'Yes' | 'No'>('Yes');
  const [yesPercent, setYesPercent] = useState(42);
  const [amount, setAmount] = useState('10');
  const yesPpm = BigInt(yesPercent) * 10_000n;
  const price = outcome === 'Yes' ? yesPpm : SCALE - yesPpm;
  const spend = parseGnot(amount);
  const valid = spend !== null && spend > 0n;
  const micro = valid ? sharesForSpend(spend, price) : 0n;
  const cost = micro > 0n ? quoteCost(micro, price) : 0n;
  const payout = micro;
  const gain = payout - cost;

  return (
    <section className="workbench" aria-labelledby={`${id}-title`}>
      <div className="workbench-head">
        <h2 id={`${id}-title`}>Work it out</h2>
        <p>Pick a side, a price and an amount. The numbers use the realm’s own rounding, so they match what the ticket asks you to sign.</p>
      </div>
      <form className="workbench-form" onSubmit={event => event.preventDefault()}>
        <fieldset className="outcome-picker">
          <legend>Outcome</legend>
          {(['Yes', 'No'] as const).map(side => {
            const sidePrice = side === 'Yes' ? yesPpm : SCALE - yesPpm;
            return (
              <label key={side} className={`outcome-option ${side.toLowerCase()}${outcome === side ? ' selected' : ''}`}>
                <input type="radio" name={`${id}-outcome`} value={side} checked={outcome === side} onChange={() => setOutcome(side)} />
                <span>{side}</span><strong>{formatUgnot(sidePrice, 2, 2)}</strong>
              </label>
            );
          })}
        </fieldset>
        <div className="slider-field">
          <label htmlFor={`${id}-price`}>Yes price <output htmlFor={`${id}-price`}>{yesPercent}%</output></label>
          <input id={`${id}-price`} type="range" min={1} max={99} step={1} value={yesPercent} onChange={event => setYesPercent(Number(event.target.value))}
            aria-valuetext={`${yesPercent} percent, Yes ${(yesPercent / 100).toFixed(2)} GNOT, No ${((100 - yesPercent) / 100).toFixed(2)} GNOT`} />
        </div>
        <div className="amount-field">
          <label htmlFor={`${id}-amount`}>You spend up to</label>
          <div className="amount-input">
            <input id={`${id}-amount`} inputMode="decimal" autoComplete="off" value={amount} aria-invalid={!valid}
              onChange={event => setAmount(event.target.value)} aria-describedby={`${id}-amount-help`} />
            <span>GNOT</span>
          </div>
          <p id={`${id}-amount-help`} className="field-help">{valid ? 'Up to six decimals.' : 'Enter an amount above zero, up to six decimals.'}</p>
        </div>
      </form>
      <div className="workbench-result" aria-live="polite">
        <dl className="result-figure">
          <dt>Shares</dt>
          <dd className={outcome === 'Yes' ? 'yes-text' : 'no-text'}>{formatUgnot(micro, 6, 2)}<span>{outcome}</span></dd>
        </dl>
        <dl className="result-list">
          <div><dt>You pay exactly</dt><dd>{formatUgnot(cost)} GNOT</dd></div>
          <div><dt>Payout if {outcome} wins</dt><dd>{formatUgnot(payout)} GNOT</dd></div>
          <div><dt>Gain if right</dt><dd>{formatUgnot(gain > 0n ? gain : 0n)} GNOT</dd></div>
          <div><dt>Loss if wrong</dt><dd>{formatUgnot(cost)} GNOT</dd></div>
        </dl>
        <p className="result-note">Network fees are extra and paid in GNOT to the chain, not to 67.</p>
      </div>
    </section>
  );
}

interface Chapter { id: string; title: string; scene: SceneData; body: string[]; formula?: string[] }

const CHAPTERS: Chapter[] = [
  {
    id: 'question', title: 'The question', scene: QUESTION_FROZEN,
    body: [
      'Every testnet question is copied word for word from a Polymarket market, rules included. When it is listed, the realm stores the question, the rules, their hash, the Polymarket condition and both outcome tokens. None of it can be edited later.',
      'Copying the words is not a link to Polymarket’s money: there is no shared order book and no shared liquidity.',
    ],
  },
  {
    id: 'price', title: 'The price', scene: PRICE_SPLIT,
    body: [
      'Prices are 67’s own fixed quotes. Every 10 minutes the operator reads Polymarket’s midpoint for the Yes token, rounds it to the cent, keeps it between 0.02 and 0.98 and publishes it if it moved. Each quote is numbered and kept in the market’s history.',
      'Yes and No always add up to 1 GNOT, so a Yes price of 0.42 is also a 42% quote. It is a price, not a forecast.',
    ],
    formula: ['shares = floor(spend × 1,000,000 ÷ price)', 'cost   = ceil(shares × price ÷ 1,000,000)'],
  },
  {
    id: 'review', title: 'The review', scene: REVIEW_TICKET,
    body: [
      'The ticket shows the exact ugnot you pay, the shares, the payout and the realm path. Adena then signs a call that carries that price.',
      'If the quote moved in the meantime, the realm refuses and only the network fee is spent. A purchase counts once the realm shows the position. If Adena never answers, the ticket offers to check again and never sends a second purchase on its own.',
    ],
  },
  {
    id: 'collateral', title: 'The collateral', scene: COLLATERAL_VAULT,
    body: [
      'Each market holds its own collateral: reserve funding first, then the cost of every purchase. The realm refuses any purchase after which the larger side could not be paid in full.',
      'In Markets v2, outstanding payouts and Void refunds stay reserved. After finalization, surplus can go only to the treasury fixed at listing.',
    ],
    formula: ['max(Yes shares, No shares) ≤ collateral   (all in ugnot)'],
  },
  {
    id: 'result', title: 'The result', scene: ORACLE_RESULT,
    body: [
      'Each market names its oracle at listing. For Markets v1, the oracle records the final result. For Markets v2, the oracle proposes an outcome with the full source binding and an evidence hash. Trading stops at the proposal.',
      'The guardian can cancel a v2 proposal within 24 hours. After the window, anyone can finalize it. Claims open once the result is final.',
    ],
  },
  {
    id: 'claim', title: 'The claim', scene: CLAIM_PAYOUT,
    body: [
      'When a market is final, winning positions show Claim in Portfolio. Each winning share pays 1 GNOT from that market’s collateral, straight to your address. A losing position closes with zero, and a second claim is refused.',
    ],
  },
  {
    id: 'testnet', title: 'Test GNOT', scene: UNITS_SPLIT,
    body: [
      `Every trade is a real transaction on ${CHAIN.chainName}, signed in Adena and checked by the contract. It is paid with test GNOT, which is free from the faucet and has no market value.`,
      'There is no selling yet: a position is held until its market is final.',
    ],
  },
];

export default function HowPage() {
  return (
    <div className="how-page">
      <section className="doc-hero" aria-labelledby="how-title">
        <h1 id="how-title" className="display">A share pays 1 GNOT if it’s right.</h1>
        <p className="lede">Everything else on 67 follows from that sentence: what a price means, why every market holds collateral, and when you get paid.</p>
        <div className="doc-hero-aside">
          <Scene scene={SHARE_PAYS} />
          <p>Seven short chapters and one calculator.</p>
          <a className="text-link" href="#/contract">Read the contract instead</a>
        </div>
      </section>
      <Workbench />
      {CHAPTERS.map(chapter => (
        <section key={chapter.id} className="chapter has-scene" aria-labelledby={`chapter-${chapter.id}`}>
          <h2 id={`chapter-${chapter.id}`} className="chapter-title">{chapter.title}</h2>
          <div className="chapter-scene"><Scene scene={chapter.scene} /></div>
          <div className="chapter-body">
            {chapter.body.map((text, index) => <p key={index}>{text}</p>)}
            {chapter.formula && <p className="formula" aria-label="Formula">{chapter.formula.map(line => <span key={line}>{line}</span>)}</p>}
          </div>
        </section>
      ))}
      <section className="chapter" aria-labelledby="chapter-next">
        <h2 id="chapter-next" className="chapter-title">Next</h2>
        <div className="chapter-body">
          <p>Open a market, review a ticket, and decide with the exact numbers in front of you.</p>
          <p><a className="button primary" href="#/markets">Open markets</a></p>
        </div>
      </section>
    </div>
  );
}
