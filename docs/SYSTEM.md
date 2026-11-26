# How 67 works and runs

Date: 14 October 2026. The owner asked for the whole system to be thought through before more building: "как будем общаться с оракулом … чтобы никто не потерял деньги", then "нам же и интерфейс надо доделать и логику … чтобы парсер все время работал … продумать всю инфраструктуру". This document is that design. The findings it answers are in [SECURITY-REVIEW.md](SECURITY-REVIEW.md); the staged path to real money, costs and legal questions stay in [LAUNCH-PLAN.md](LAUNCH-PLAN.md), whose architecture this replaces where they differ.

## The parts

```
                 Polymarket                         Polygon
          CLOB API: prices, rules,          Conditional Tokens contract:
          closed and winner flags           the final payout of each condition
                    │                                    │
                    └──────────────┬─────────────────────┘
                                   ▼
                 watcher, every minute (no keys): reads both sources and the realm,
                 decides what should happen, publishes /api/status and evidence,
                 sends alerts
                    │                         │                          │
                    ▼                         ▼                          ▼
        keeper (quoter key, hot):    owner's phone: alert        oracle console in the app:
        SetQuote when the price       "Fed market resolved       owner reviews the evidence,
        moves; extreme quote as       on Polygon: No"            Adena signs FinalizeByOracle
        the brake in v1                                          (oracle key, cold)
                    │                                                    │
                    ▼                                                    ▼
        ┌───────────────── gno.land: Onyx now, gnoland-1 later ─────────────────┐
        │ markets: collateral, quotes, positions, outcomes, claims               │
        │ home: 67's pages on gno.land, read the markets realm                   │
        └────────────────────────────────────────────────────────────────────────┘
                    ▲                                                    ▲
        web app (Vercel): reads RPC, Adena signs Buy and Claim     gnoweb: the same realm,
        #/status for everyone, actions for role holders             readable and callable without us
```

| Part | Runs where | Holds | Can do | Cannot do |
| --- | --- | --- | --- | --- |
| Markets realm | Gno chain | All collateral | Everything in [SECURITY-REVIEW.md](SECURITY-REVIEW.md), "How money moves" | Pay anyone but a claimant |
| Home realm | Gno chain (private, updatable) | Nothing | Show 67 on gno.land | Anything with money |
| Watcher | Scheduler, every minute | No keys | Read, compare, publish status and evidence, alert | Sign anything |
| Keeper | Same scheduler | Quoter key (in v1 the administrator key) | Requote, brake (v1), pause (v2) | Finalize, withdraw |
| Oracle console | The app, in the owner's browser | Nothing; Adena holds the oracle key | Prepare `FinalizeByOracle` from the evidence for Adena to sign | Sign on its own |
| Web app | Vercel, static | Nothing | Read the chain; ask Adena to sign Buy and Claim | Move money by itself |
| Alerts | Telegram bot or e-mail | Bot token | Tell the owner | Act |

## Talking to the oracle

The oracle is not a server. It is an address the market pins at listing, and one call: `FinalizeByOracle`. "Talking to it" means: something notices that the result is final, prepares the exact call with evidence anyone can check, and a person signs it.

1. **Notice.** Every minute the watcher reads Polygon's Conditional Tokens contract for each open market: `payoutDenominator(conditionId)` and the two payout numerators, through two independent public RPCs that must agree. It also reads the CLOB market. Polygon is the record of settlement: once written it never changes. The API alone is not enough (finding R4).
2. **Decide.** `[1, 0]` is Yes, `[0, 1]` is No. `[1, 1]` is a 50-50: in v1 nothing can settle it (finding R2), so the watcher alerts and the market waits for v2's void. A disagreement between Polygon and the API, a binding that no longer matches (question, rules hash, token order), or anything else stops and alerts.
3. **Brake.** In v1, as soon as the result is final on Polygon, the keeper sets the quote to the extreme toward the winner (Yes 0.999999 or 0.000001). Nobody can then profit from the known answer (finding R3). In v2 the keeper pauses the market instead, and the oracle's proposal stops trading by itself.
4. **Evidence.** The watcher builds the evidence record: the binding, the Polygon block and transaction of `ConditionResolution`, the payouts and the CLOB snapshot, without a local clock, so anyone running the same tool gets the same SHA-256. The record is published at `/api/evidence/<market>` and its hash is the call's last argument.
5. **Alert.** The owner gets one message: which market, which result, a link to the oracle console.
6. **Sign.** The owner opens the site's status page (`#/status`) with the oracle account in Adena. Under "Results to sign" it shows the market, the Polygon payout, the API's answer, the evidence and the exact seven arguments; Adena shows the call again. The owner approves. No server ever holds the oracle key.
7. **Check.** The watcher reads the realm back: final, the right winner, the evidence hash it published. Holders see Claim in the app and on gno.land.

In v2 step 6 becomes `ProposeOutcome` signed by two of three oracle keys; after 24 hours without a guardian cancel, anyone finalizes. In v1 the result is final at once, which is why the oracle key must never be the administrator's (finding R1).

## The watcher ("the parser that always runs")

Every minute, for every market in `MarketsJSON()`:

| Read | From | Used for |
| --- | --- | --- |
| Yes midpoint, `closed`, winner flags, rules | `clob.polymarket.com/midpoint` and `/markets/<condition>` | Quotes; binding check; a second opinion on the result |
| Payout denominator and numerators | Conditional Tokens on Polygon, two RPCs | The result |
| Quote, version, escrow, shares, `ClosesAt`, finalized | The realm, `MarketsJSON()` | What to do |
| Keeper balance, last role actions | The realm and the indexer | Alerts |

It writes nothing on chain. It publishes `/api/status` (one JSON for everyone: per market our quote, the Polymarket midpoint, quote age, Polygon state, oracle state, exposure, last run) and `/api/evidence/<market>`. Its decisions go to the keeper and to alerts.

Alerts (Telegram or e-mail, the owner chooses):

- a market resolved on Polygon (with the console link), or resolved 50-50;
- Polygon and the API disagree, or a binding changed;
- a quote is older than 15 minutes while Polymarket moved more than 2 cents, or the keeper failed three runs in a row;
- the keeper's balance is below 5 GNOT;
- any administrator, oracle or guardian transaction we did not send;
- the realm's invariants fail: balance below total escrow, or `max(Yes, No) > escrow`;
- trading closes within 24 hours on a market with no result yet (a reminder).

## The keeper

Runs after the watcher in the same job. For each open market: when the midpoint moved by a cent or more, send `SetQuote(id, price, expectedVersion)` with the version it just read, so a lost or repeated run can never overwrite a newer quote. Then read the realm back. An unknown result is settled by reading, never by sending again. The quote is the midpoint itself, without the 0.02–0.98 clamp the earlier plan had: a clamp sells a near-certain outcome below its value. Before the result the midpoint rarely leaves that range anyway; the brake (step 3 above) is the deliberate extreme.

In v1 `SetQuote` needs the administrator key, so the keeper holds it. That is acceptable only because the oracle is a different key: a stolen keeper key can drain a market's reserve through bad quotes, never a winner's payout. In v2 the keeper gets a quoter key that can only quote inside the band and pause.

Signing in JavaScript uses `@gnolang/gno-js-client` 3.1.0 and `@gnolang/tm2-js-client` 3.3.0 (both updated 22 September 2026). Gas is about 1–5 million per call, so 0.001–0.005 GNOT; storage grows only with the quote history.

## Where it runs

The watcher and keeper need a scheduler that fires every minute and keeps a secret. Options, prices as published:

| Option | Every minute | Cost | Notes |
| --- | --- | --- | --- |
| Vercel Pro cron | Yes | $20 a month with $20 usage | Same project and panel as the site; secrets in Vercel; recommended. Hobby's cron runs once a day. |
| Cloudflare Workers Paid | Yes | $5 a month | 30 s CPU per run; a second platform and account. The free plan allows only 10 ms CPU per cron run, too little for signing. |
| GitHub Actions schedule | Every 5 minutes at best, often 5–20 minutes late, sometimes skipped | Free | Acceptable for the testnet only; needs a GitHub repository. |
| Small server | Yes | About $5 a month | Runs gnokey natively; we would also own its security updates. Not recommended. |

Any paid option needs the owner's approval of the price. Reads that need no schedule (`/api/status`, `/api/evidence`) run on request on Vercel and work on Hobby.

## Keys

| Key | v1 on Onyx | Where it lives | If stolen | If lost |
| --- | --- | --- | --- | --- |
| Administrator (and namespace, deployer) | Operator key `g1z86x…uw9q` | gnomcp keystore in the container now; a backup in `D:\Studio\.secrets\`; the keeper's copy as a Vercel sensitive variable | Bad quotes drain reserves; new fake markets | No new markets, no quotes, no `home` updates, the namespace |
| Oracle | A separate account in the owner's Adena (proposed: a new account named "67 oracle") | Adena on the owner's computer, its recovery phrase on paper | Wrong results: honest winners lose (R1). Never on a server | Markets cannot finalize: money locked in v1 (R2) |
| Vercel token | Deploys the site | `D:\Studio\.secrets\` | A malicious site (R8) | A new token |
| Alert bot token | Sends alerts | Vercel variable | Fake alerts | A new bot |

v2 replaces the single administrator and oracle with two-of-three multisigs on hardware keys and adds a guardian and a treasury ([LAUNCH-PLAN.md](LAUNCH-PLAN.md), "Keys").

## The interface still to build

| Where | What | Why |
| --- | --- | --- |
| Market page | Every state in plain words: open until …; trading closed, waiting for Polymarket; resolved on Polymarket, waiting for the oracle; final, claim; (v2) paused, proposed with the time left, void and refund | A holder always knows what happens next and when |
| Ticket | (v2) the fee and the exact total before signing; the realm path; "the price expired" | No surprises at signing |
| Portfolio | Claim; (v2) refund on void; what was paid and when | Getting paid |
| `#/status`, built 14 October | One page for everyone: per market our quote, Polymarket's midpoint, Polygon's settlement and the realm's state, plus the realm's balance against its escrow. Role holders get the actions on the same page: the oracle signs a settled result with the prepared evidence; the administrator updates every drifting price (and the brake) in one Adena signature; a proposed administrator accepts the role. Reads in the browser through the same `src/live/oracle.ts` the watcher runs. | Anyone can see the system is alive and honest; the owner runs the oracle and prices without a terminal |
| (v2) | Propose, cancel, pause, keeper health | |
| gno.land pages | The same states on `home` and the market pages | Users who never open our site |
| Alerts | One clear message per event with a link | The owner reacts in minutes |

## When something breaks

| Failure | Effect | What happens |
| --- | --- | --- |
| Polymarket API down | No new quotes | Keeper skips; quote-age alert; in v2 the quote expires and trading stops by itself |
| One Polygon RPC down or wrong | Result uncertain | Two RPCs must agree; otherwise wait and alert |
| Onyx RPC down | Nobody can trade or claim | Keeper retries; alert; the realm keeps everything as it was |
| Keeper out of gas | Quotes freeze | Low-balance alert at 5 GNOT |
| Keeper sends twice | Nothing | `expectedVersion` refuses the second `SetQuote` |
| Owner away when a result lands | Claims wait; the brake already stopped trading | In v2, abandonment voids after 60 days |
| Vercel down | Site down | Trading and claims still work from the gno.land pages and gnoweb's call forms |
| A wrong result signed | v1: final at once | v2: the guardian cancels within 24 hours |

## Build order

Each step ends with a check and waits for the owner's word where the rules require it.

1. **Before deploying to Onyx (no realm code changes):** back up the operator key to `D:\Studio\.secrets\`; create the "67 oracle" account in Adena and use its address as every market's oracle; set closing times before each event (Fed 9 December 18:00 UTC, the year-end markets 31 December 23:00 UTC); refresh opening prices from Polymarket; then "да, деплой".
2. **Watcher and status page** (read-only, no keys, no cost): done on 14 October (`ops/watcher/`, `#/status`); the watcher waits for the GitHub repository.
3. **Oracle and price actions** on the status page: done on 14 October and tested with mocks (`e2e/status.spec.ts`) and on a local chain (`ops/watcher/lifecycle.local.ts`); next, a short-dated market on Onyx.
4. **Keeper and alerts** (needs a scheduler, so the hosting decision): requotes, the brake, the alerts.
5. **Realm v2** with the 0.04 fee, void, abandonment, pause, roles, limits, quote expiry and the 24-hour window, plus its interface; deployed next to v1.
6. Then [LAUNCH-PLAN.md](LAUNCH-PLAN.md) stage 2 onwards: drills, audit, bounty, and only after the legal answer, mainnet.

## Decisions for the owner

1. Back up the operator key to `D:\Studio\.secrets\` (yes or no).
2. The oracle: a separate "67 oracle" account in Adena (recommended), or another arrangement.
3. Closing times before each event, as above.
4. Where the watcher and keeper run: Vercel Pro ($20 a month), Cloudflare Workers ($5 a month), or GitHub Actions for the testnet only.
5. Alerts by Telegram or e-mail.
6. "да, деплой" once 1–3 are done.

## Sources

- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [pricing](https://vercel.com/pricing), as checked on 12 October in [LAUNCH-PLAN.md](LAUNCH-PLAN.md).
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free 10 ms CPU per cron run and 5 cron triggers; Paid 30 s.
- [GitHub Actions scheduled workflows are unreliable](https://runhooks.app/blog/github-actions-scheduled-workflows-unreliable/): 5-minute minimum, 5–20 minute delays, skipped runs.
- [Polymarket contracts](https://docs.polymarket.com/resources/contracts) and [resolution](https://docs.polymarket.com/concepts/resolution); npm registry for the Gno JavaScript clients (14 October 2026).
