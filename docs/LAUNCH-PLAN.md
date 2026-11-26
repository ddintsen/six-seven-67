# Launch plan: from a testnet prototype to a real exchange

Status: proposal, 2026-10-12. Nothing here is bought, deployed or published until the owner approves that step in chat. It extends [BACKEND-PLAN.md](BACKEND-PLAN.md): its keeper and oracle jobs remain the design for stage 1, and its "order of work" is replaced by the stages below.

## The short answer

- **Users' money.** The realm already keeps every market fully collateralized: a purchase is refused unless the market can pay every possible winner, and nobody, the operator included, can withdraw collateral. What v1 does not protect against: a stolen or mistaken oracle key finalizing the wrong outcome, a source that cannot be settled as Yes or No (a 50-50 or cancelled market), and funds locked forever if we disappear. Realm v2 closes all three (two of three hardware signatures plus a 24-hour cancel window, a void outcome with refunds, an abandonment deadline) and caps every exposure. No design removes all risk: a realm bug or a chain failure can still hurt, which is why real money comes only after an external audit and starts with small limits.
- **200 GNOT** is about $14 at the October price (about $0.069 per GNOT). On mainnet it pays for deploying the realm, listing a few markets and many months of keeper transactions. As the reserve that takes the other side of trades it backs only about $14 of bets in total. On testnet it is not needed: test GNOT comes free from the faucet.
- **Real money needs a legal answer first.** Ukraine blocked polymarket.com in December 2025 as unlicensed gambling, the CFTC fined Polymarket in 2022 for unregistered event contracts, and Polymarket's terms restrict copying its content and data. A lawyer in the owner's country decides whether stage 3 happens at all.
- **Service fee.** v2 charges a fee on every purchase so the exchange pays for itself: `0.04 × shares × price × (1 − price)`, the formula Kalshi and Polymarket use, at most 0.01 GNOT per share at a price of 0.50. Fixed per market when listed, shown before signing, returned on a void market. Running costs (about $23 a month) are covered from about $1,200–1,600 of purchases a month. See "Service fee".
- **Domain.** `sixseven.markets` is available for $9.99 for the first year, then $16.99 a year.

## Facts this plan rests on (checked 12 October 2026)

| Fact | Source |
| --- | --- |
| Gno.land Beta Mainnet went live on 25 March 2026 with transfers locked. The full mainnet was announced on 18 September 2026, with GNOT transferable at the protocol level. Our gateway probe saw chain `gnoland-1` producing blocks on 10 October. | [Beta Mainnet post](https://gno.land/r/gnoland/blog:p/beta-mainnet), [mainnet release](https://www.einpresswire.com/article/943210544/gno-land-mainnet-is-live-newtendermint-puts-readable-go-code-on-chain), [BACKEND.md](BACKEND.md) |
| GNOT trades on KuCoin (GNOT/USDT since 16 September 2026) and Kraken (listed 15 September 2026), around $0.069 in October. The public sale in July 2026 cleared at $0.0645. | [KuCoin listing](https://www.kucoin.com/news/flash/kucoin-lists-gno-land-gnot-for-spot-trading), [KuCoin price note](https://www.kucoin.com/square/post/content_6aca06e84bae8c0007c09707), [Kraken](https://www.kraken.com/gb/prices-new-123/gno.land), [sale](https://sale.gno.land/) |
| Gas on `gnoland-1` costs 1 ugnot per 1,000 gas. That is the floor; the price rises with demand. The fee is gas wanted × price and is deducted in full whatever the transaction uses. | [Gas fees](https://docs.gno.land/resources/gas-fees), [memba PR #1280, 24 Sep 2026](https://github.com/samouraiworld/memba/pull/1280), [gno PR #6099](https://github.com/gnolang/gno/pull/6099) |
| Storage deposit: 100 ugnot per byte (1 GNOT per 10 KB), settled after every call and deployment: locked when stored state grows, released to whoever frees it. | [Storage deposit](https://docs.gno.land/resources/storage-deposit) |
| Anyone can deploy under their address namespace `gno.land/r/g1…/`. Username namespaces are not available yet. | [Users and teams](https://docs.gno.land/resources/users-and-teams/) |
| `AddPackage` refuses an occupied path, so a non-private realm's code can never be replaced. Only realms marked `private` can be re-added, which wipes their state. | [moul/gno-contracts#241](https://github.com/moul/gno-contracts/issues/241) |
| gnokey supports M-of-N multisig accounts (`add multisig`, `sign`, `multisign`) and airgapped signing; Ledger needs a CGO build. Adena lists Ledger support. | [gnokey](https://docs.gno.land/users/interact-with-gnokey/), [Adena](https://github.com/onbloc/adena-wallet) |
| Vercel Hobby is for non-commercial personal use only, and its cron runs at most once a day. Pro costs $20 a month with $20 of usage credit, and its cron runs every minute. | [Fair use](https://vercel.com/docs/limits/fair-use-guidelines), [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [pricing](https://vercel.com/pricing) |
| Polymarket's Terms of Use (effective 11 August 2026) forbid copying site material by any process, scraping, and certain uses of its data "directly or through an API … including on-chain"; its content is licensed for personal use only. | [Terms of Use §4.2, §5.1](https://polymarket.com/tos) |
| Prediction-market fees follow `θ × contracts × price × (1 − price)`: Kalshi θ = 0.07 (at most 1.75¢ per contract), Polymarket US 0.0695, Polymarket international 0.04 for politics, finance and tech, 0.05 sports, 0.07 crypto, geopolitics free. | [DeFi Rate fee comparison, updated 2 Oct 2026](https://defirate.com/prediction-markets/fees/) |
| Ukraine's NCEC blocked polymarket.com on 10 December 2025 (Resolution 695) as gambling without a licence; PlayCity issues gambling licences. The CFTC fined Polymarket's operator $1.4 million in January 2022 for offering event-based binary options without registration. Polymarket itself blocks or limits trading in more than 40 countries and regions. | [Cointelegraph](https://cointelegraph.com/news/ukraine-blocks-polymarket-unlicensed-gambling), [PlayCity](https://igamingbusiness.com/legal-compliance/playcity-ukraine-250-licences-first-year/), [CFTC order](https://mondovisione.com/news/cftc-orders-event-based-binary-options-markets-operator-to-pay-14-million-pena-202213/), [geoblock list](https://docs.polymarket.com/api-reference/geoblock) |

## What realm v1 guarantees today

From `contracts/markets.gno`:

- **Full collateral per market.** `Buy` is refused unless `max(Yes shares, No shares) ≤ market escrow` after the purchase, and the realm's balance must cover the sum of all escrows. A winning claim is always payable.
- **Exact price and amount.** The buyer's reviewed price must equal the live quote and the exact cost must be sent; rounding favours the realm.
- **Direct user calls only** (`IsUserCall`, and `AssertOriginCall` on `Buy` and `Fund`): no other realm can call in.
- **Fixed terms.** Question, rules, source binding and oracle are fixed per market; one finalization; one claim per holder.
- **One way out.** No function sends coins except `Claim`, to the caller.

## What v1 lacks for real money

| Gap | Who it hurts |
| --- | --- |
| One oracle key per market, final at once: a stolen or mistaken key pays the wrong side | Users |
| No void outcome: a Polymarket 50-50 or cancelled market cannot be settled fairly | Users |
| If the operator disappears before finalizing, collateral stays locked forever | Users |
| Yes + No = 1 exactly and a quote never expires: anyone faster than the keeper trades against a stale price, and the planned clamp to 0.02–0.98 sells near-certain outcomes below value | Operator reserve |
| No limit per trade or per holder, and no pause | Operator reserve |
| One administrator key both lists and quotes, so it must live on a server | Both |
| The reserve and any surplus are locked forever, so every market permanently consumes capital | Operator |
| Quote history keeps 240 points and rules may be 20 KB, and every stored byte locks 100 ugnot | Operator |

## Threat model

| Threat | Worst case today | After v2 and stage 2 |
| --- | --- | --- |
| Wrong or malicious finalization | Users on the true side lose their stake | Two of three hardware signatures; a separate guardian can cancel within 24 hours; ambiguous sources settle as void |
| Realm bug | Anything | Small code, invariant tests, an internal gno-audit pass, an external audit, a public bug bounty, low limits at launch |
| Stale quotes and news latency | Reserve drained by fast traders | Spread, quote expiry enforced by the realm, per-trade cap, keeper pauses on jumps |
| Quoter key stolen | Whole reserve exposed | The quoter can only quote inside the band and pause; per-market limits and the realm-wide exposure cap bound the loss to the operator's reserve; the monitor alerts and the guardian pauses. Users' money stays out of reach |
| Administrator key stolen | Bad quotes | Two-of-three multisig on hardware; even it cannot touch money owed to users |
| Site, DNS or npm package tampered with | Users sign a transaction to another realm | CSP and a pinned realm path, registrar lock and two-factor sign-in everywhere, minimal dependencies. Adena shows the call before it is signed, and the site tells users which realm path to expect; gnoweb's `$help` stays an independent way to trade and claim |
| Operator disappears | Funds locked forever | 60 days after trading ends, anyone can void an unsettled market and every holder takes a refund |
| Chain halt or a governance change on a new mainnet | Delays, in theory losses | Cannot be removed; limits and plain risk text |
| Legal action | Fines, blocking | Stage 0 decides; geoblocking in the app; no real money without a legal opinion |

Per-holder limits are weak on their own (new addresses are free), so the binding bounds are per trade, per market and for the whole realm.

## Realm v2 (`markets/v2`)

Keeps every v1 guarantee and adds:

1. **Roles.** `admin`, a two-of-three multisig, lists markets, sets limits, rotates roles and unpauses. `quoter`, the server key, only quotes and pauses. `guardian` pauses and cancels a proposed outcome and never moves funds. Each market pins its oracle, also a two-of-three multisig, and the realm has a fixed `treasury` address. Every handover is two-step, like v1's administrator handover.
2. **Two-sided quotes with a spread.** `SetQuote(id, yesPpm, noPpm, expectedVersion)`, each price within 30,000–970,000 ppm and `yes + no ≥ 1,000,000 + minSpreadPpm`. Outside that band the market pauses instead of clamping. With the service fee in place the spread can be small or zero; it stays as a guard for fast markets.
3. **Quote expiry.** Each quote records its block time, and `Buy` is refused once it is older than `quoteTTL` (for example one hour). The keeper's checks every few minutes are the first defence; the expiry is the fail-safe: if the keeper stops, trading stops by itself. Claims are unaffected.
4. **Limits.** Maximum shares per trade, per holder and per market, plus a cap on open exposure across the realm.
5. **Trading end.** `tradingEndsAt` is set at listing, before the source event and separately from resolution.
6. **Pause.** Quoter, guardian and admin can pause one market or all; only the admin unpauses. Claims and refunds can never be paused.
7. **Resolution with a window.** The oracle proposes `Yes`, `No` or `Void` with the full source binding and an evidence hash, and trading stops at once. After `disputeWindow` (24 hours) anyone can finalize; within it the guardian can cancel the proposal.
8. **Void.** Every holder reclaims what they spent (`SpentUgnot`), which escrow always covers. A Polymarket 50-50 result settles as void.
9. **Abandonment.** If no outcome is final by `tradingEndsAt + abandonAfter` (60 days, fixed at listing), anyone can void the market.
10. **Surplus.** Only after finalization, the admin can send `escrow − unclaimed liability`, and on Yes or No the market's fees, to the treasury. Nothing leaves a market before it is final.
11. **Storage.** Quote history keeps 96 points, and events carry the full record for the indexer. A claimed position is deleted, so its storage deposit returns to the holder who claims (the portfolio then reads claimed history from events).
12. **Deployment.** Non-private, at `gno.land/r/<admin address>/markets/v2` until username namespaces exist. The code is final once deployed: a fix is a new path, and the old realm keeps paying its claims.
13. **Service fee.** A fee on every purchase, held per market outside the collateral and released at settlement; specified in the next section.

Invariants, each a property test over random sequences of calls:

- The realm's balance is at least the sum of all escrows plus every fee still held.
- A market's fee rate never changes after listing and never exceeds the cap in the code.
- An open market's escrow covers both `max(Yes, No)` and every refund owed if it is voided.
- After finalization, escrow covers every unclaimed payout or refund.
- Only `Claim` and `Refund` pay holders, always to the caller; only `WithdrawSurplus` pays the treasury (surplus and released fees).
- A market moves only between Open and Paused, from either to Proposed, and from Proposed to Final (Yes, No or Void). A cancelled proposal returns it to Paused, and abandonment takes any unsettled market to Final (Void).

**Pricing model.** v2 keeps the mirrored fixed quote: it matches the product and the interface. If Polymarket does not allow its prices to be used, the alternative is a market maker inside the realm (LMSR): prices move with trades, no keeper is needed for quotes, and the operator's worst loss per market is fixed in advance at `b × ln 2`. That would be a v3 decision.

## Service fee

The owner wants the exchange to pay for itself (12 October: "нам надо еще комиссия сервиса чтобы была для самообеспечения"). v2 charges a service fee on every purchase, separate from the price.

- **Formula.** `fee = θ × shares × price × (1 − price)`, rounded up to the ugnot, the shape Kalshi and Polymarket use. It is largest at 50/50 and small near certainty, so a buyer of a likely outcome is not charged much of a small gain.
- **Proposed rate.** θ = 0.04, Polymarket's international rate for politics, finance and tech: at most 0.01 GNOT per share, at a price of 0.50.

| Price (GNOT) | Fee per share (GNOT) | Fee as part of the purchase |
| --- | --- | --- |
| 0.10 | 0.0036 | 3.6% |
| 0.25 | 0.0075 | 3.0% |
| 0.50 | 0.0100 | 2.0% |
| 0.75 | 0.0075 | 1.0% |
| 0.90 | 0.0036 | 0.4% |

- **Fixed per market.** θ is set when a market is listed and can never change. The realm refuses any θ above 0.07 (Kalshi's rate), so nobody, the admin included, can raise a fee after people have bought. A market may list with θ = 0.
- **Shown before signing.** The ticket and the review step show price, shares, fee and the exact total; the buyer sends `cost + fee` exactly, as v1 already requires for the cost. `Quote(id, outcome, shares)` returns both, `Bought` events carry `feeUgnot`, `MarketJSON` carries θ, and the contract page states the formula. The app computes the fee with the realm's integer arithmetic, so the two can never disagree.
- **Where it goes.** Fees are held per market, outside the collateral, until the market settles. On Yes or No they become the treasury's; on Void each holder gets back both what they spent and the fee they paid. Nothing is charged on `Fund`, `Claim` or `Refund`. The alternative, fees to the treasury at once and kept on a void, brings income earlier but asks users to trust us more; not recommended.
- **What it pays for.** Running costs at today's prices are about $23 a month: Vercel Pro $20, the domain about $1.40, keeper gas $0.30–1.60, listings about $0.55. At θ = 0.04 fees come to about 1.5–2% of purchases at ordinary prices, so the exchange covers its running costs from about $1,200–1,600 of purchases a month (about 17,000–22,000 GNOT). One-off costs (audit, lawyer) need far more volume. The fee does not cover reserve losses: those depend on outcomes and are bounded by limits.
- **Testnet.** The fee runs on Onyx in test GNOT from the first v2 deployment, so the arithmetic, the ticket and the treasury withdrawal are proven before real money.
- **Legal.** A fee makes the operator a business that earns from bets, which is what licensing rules usually target. It raises the bar for stage 0.

## Backend architecture

Superseded on 14 October by [SYSTEM.md](SYSTEM.md) where they differ: the oracle reads Polygon's settlement record, the oracle key is never the administrator's, the watcher runs without keys, and the oracle signs in Adena from an operator console. Findings: [SECURITY-REVIEW.md](SECURITY-REVIEW.md).

```
 users ── Adena: Buy, Claim, Refund ───────────────────────┐
                                                           ▼
 ┌──────────── gno.land: Onyx testnet first, then gnoland-1 ────────────┐
 │  markets/v2: collateral, positions, roles, limits, outcomes          │
 │  home: read-only storefront rendered by gnoweb                       │
 └──────────────────────────────────────────────────────────────────────┘
      ▲ reads: RPC, indexer     ▲ SetQuote, Pause         ▲ Propose, Finalize, admin
      │                         │ quoter key              │ 2 of 3 hardware keys, airgapped gnokey
 web app on Vercel          keeper on Vercel cron      owner's laptop:
 sixseven.markets           Polymarket midpoint in,    oracle tool, runbooks
 static, CSP, no secrets    one quote out per market
      ▲
 /api/status and monitor, every minute: invariants, quote age, keeper balance, every role action → alerts
```

- **Keeper (quotes).** Every 2–5 minutes, for each open market: read the Polymarket midpoint; compute Yes and No with the spread; pause if the price leaves the band or jumps more than a threshold since the last quote; send `SetQuote` with the expected version when the price moved by a cent or the quote nears its expiry. After each transaction it reads the realm back and records the result; an unknown result is reconciled by reading, never by resending. It holds only the quoter key, with GNOT for about two weeks of gas.
- **Oracle (results).** Not automatic. The existing proposal tool (`server/propose-resolution.mjs`) builds the arguments and evidence hash; two signers sign `ProposeOutcome` offline with gnokey and hardware keys; anyone finalizes after the window. An ambiguous source becomes void, never a guess.
- **Status and monitor.** Read-only Vercel functions report, per market, quote, age, version, exposure, state and the last role actions. Every minute the monitor checks the invariants, quote age, keeper balance and any admin, guardian or oracle transaction, and alerts the owner by Telegram or email.
- **Web app.** Static as now: no keys, no server state. Add a strict Content-Security-Policy (`self` plus the RPC and indexer origins), `frame-ancestors 'none'` and a Permissions-Policy (today only `nosniff` and a referrer policy are set), and show the realm path with a link to its source.
- **Reads.** Public RPC and indexer first, with a fallback endpoint; our own node and indexer at stage 4.

Keys:

| Key | Holder | Can do | Kept |
| --- | --- | --- | --- |
| Admin | Two of three: owner's hardware key A, key B, a third signer or a sealed backup | List, limits, roles, unpause, surplus to treasury | Hardware only, airgapped gnokey |
| Oracle | Two of three, on accounts separate from the admin's | Propose outcomes | Hardware only |
| Guardian | Owner, separate account | Pause, cancel a proposal | Adena on a separate device |
| Quoter | Keeper | Quote and pause | Vercel sensitive environment variable, set by the owner |
| Treasury | Owner | Receives surplus | Cold |
| Vercel token | Deploy command | Deploy the site | `D:\Studio\.secrets\`, rotated before launch |

## Money: what 200 GNOT covers

Assumptions: 1 GNOT ≈ $0.069; gas at 1 ugnot per 1,000 gas; storage at 100 ugnot per byte. Gas per call and stored sizes are estimates until they are measured with `-simulate` on Onyx; the deployment figure assumes the test files are uploaded with the realm; without them it is about 2.5–3 GNOT.

| Item | Kind | GNOT |
| --- | --- | --- |
| Deploy realm v2 with its tests (about 50–80 KB stored) | Locked | 5–8 |
| List a market (question, rules and fields, about 2–6 KB) | Locked | 0.2–0.6 each |
| Quote history at 96 points | Locked | about 0.5 per market |
| One keeper transaction (about 1–5 million gas) | Spent | 0.001–0.005 |
| Keeper for 5 markets, about 30 quotes a day each (a one-hour expiry alone needs 24) | Spent | 0.15–0.75 a day |
| Reserve for one market at 50/50 when every buyer takes one side | At risk | a seed of S lets buyers stake S and win 2S |

So 200 GNOT covers the deployment, five markets and roughly eight months or more of quoting at today's gas price, with almost nothing left as reserve. A beta where buyers can stake $500 on one side of each of five markets needs about 7,250 GNOT of reserve per market, about 36,000 GNOT (about $2,500) in total. With v2 the reserve comes back to the treasury after each market, minus what the operator lost.

Fiat costs:

| Item | Cost |
| --- | --- |
| Domain `sixseven.markets` | $9.99 the first year, then $16.99 a year (Vercel search, 12 October) |
| Vercel Pro, for the keeper's cron and any commercial use | $20 a month, $20 of usage included |
| Two hardware wallets | Owner's purchase |
| External audit of v2 | By quote; the largest item |
| Legal opinion | By quote |
| Bug bounty pool | Set by the owner, paid in GNOT |

## Stages

Each stage ends with an exit check; the next starts only on the owner's word.

**Stage 0: decisions and legal (owner, about 1–2 weeks)**

- Testnet only for now, or a path to real money.
- A lawyer in the owner's country, and wherever an operator company would be registered: is a real-money prediction market gambling or a financial product there, and what licence would it need.
- Polymarket: ask for written permission to mirror questions, rules and prices (its terms mention a builder programme), or plan our own questions and the LMSR model.
- Buy the domain; settle key custody (two hardware wallets, who holds the second signature).
- Exit: a written decision on real money; the domain in the Vercel team.

**Stage 1: public testnet on the domain (about 2 weeks of agent work)**

- Domain on the Vercel project; `og:image` and the canonical URL move to it; security headers.
- After "да, деплой": realm v1 on Onyx with the four bound markets (they close in December 2026 and January 2027) plus one short-dated market, so a full cycle can finish within the stage; the keeper on Vercel Pro cron, the oracle tool, `/api/status`, the monitor with alerts and the storefront realm.
- Plain risk text on the site: testnet, no value, what the realm guarantees and what it does not.
- Exit: two weeks of stable quotes, at least one market finalized and claimed end to end on Onyx, no alert left unexplained.

**Stage 2: realm v2 and hardening (about 3–5 weeks of agent work, plus the audit)**

- Build v2 to the specification above with property tests; run the gno-audit skill; deploy v2 on Onyx next to v1, which keeps paying its claims.
- Keeper v2 (spread, expiry heartbeat, jump pause, reconciliation); admin and oracle on hardware multisigs; runbooks for an incident, a pause, a lost key and a rotation.
- Drills on Onyx: stale quote, keeper down, oracle cancel, void, abandonment, surplus withdrawal, guardian pause.
- External audit of v2, fixes, the report published; bug bounty opened.
- Exit: no open high or critical finding; every drill passed and written down.

**Stage 3: mainnet soft launch (only if stage 0 allows real money)**

- v2 on `gnoland-1`; two or three markets; low limits, for example 10 GNOT per trade and 50 GNOT per holder; a reserve per market set by the budget.
- The app blocks restricted jurisdictions (the realm itself cannot); clear risk text; the bounty live.
- Exit: 30 days without an incident; every payout reconciled against events.

**Stage 4: growth**

- Raise limits step by step; run our own RPC node and indexer; more markets; a second person on the multisigs; consider LMSR or an order book.

## What we will not do

- Hold users' funds anywhere but the realm, or keep balances in a database.
- Add any path that moves collateral before finalization, or an upgradeable proxy in front of the money.
- Let one key, or one server, decide an outcome.
- Put mnemonics or tokens in the repository, logs or chat.

## Owner decisions needed now

1. Testnet only for now, or work towards real money (then: which country, and a lawyer).
2. Domain: `sixseven.markets`, or another from the list below.
3. Polymarket: ask for permission, or plan our own questions and prices.
4. Keys: two hardware wallets, and who holds the second signature.
5. Budget: Vercel Pro from stage 1; audit and legal by quote; reserve size for stage 3.
6. Service fee: θ = 0.04 (at most 0.01 GNOT per share), returned on a void market; or another rate up to the 0.07 cap.
7. "да, деплой" for stage 1 on Onyx.

## To verify before stage 3

- Gas used by every v2 call, measured with `-simulate` on Onyx, then on mainnet.
- That a multisig account can sign every admin and oracle call with hardware keys in gnokey.
- That the storage deposit is charged to the signer and returned to whoever frees storage, as the documentation describes.
- The live gas price and any change to the storage price, both governed by GovDAO.
- Whether username namespaces have arrived on `gnoland-1`.

## Names on gno.land (checked 15 October 2026)

gno.land sells no web domains. On Onyx and on `gnoland-1` alike, `r/sys/namereg/v0` registers only names of the form `nym-<5–13 letters><3 digits>`, free; 67 holds `nym-sixseven067`. A vanity name such as `sixseven` is granted only by a GovDAO vote: `ProposeNewName(addr, newName)` renames the user, every earlier name keeps resolving, and the address can then deploy under the new namespace (realms already deployed keep their paths). A GovDAO member has to submit the proposal. The owner chose this path for now (15 October: "давай пока ним и потом будем голосовать").

## Domain candidates (Vercel search, 12 October 2026; rechecked 15 October: `sixseven.markets` $9.99/$16.99, `67markets.com` $11.25, `sixseven.exchange` $10.99/$34.51, all available)

| Domain | First year | Renewal |
| --- | --- | --- |
| `sixseven.markets` | $9.99 | $16.99 |
| `six-seven.markets` | $9.99 | $16.99 |
| `sixseven.exchange` | $10.99 | $34.51 |
| `67markets.com` | $11.25 | $11.25 |
| `sixsevenmarkets.com` | $11.25 | $11.25 |
| `sixseven.land` | $15.99 | $34.25 |
| `sixseven.trade` | $27.00 | $27.00 |
| `sixseven.market` | $50.46 | $45.49 |
| `67.exchange` (premium) | $108.90 | $108.90 |

Taken: `67.markets`, `67.trade`, `67.xyz`, `67.app`, `sixseven.com`, `sixseven.xyz`, `sixseven.app`, `sixseven.io` and others. A purchase needs the owner's approval of a fresh quote. The Vercel connector cannot quote for this team (403), so the purchase goes through the Vercel CLI with the stored token, or the owner buys in the Vercel dashboard (Domains, Buy).
