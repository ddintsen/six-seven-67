# Six Seven Gno market realm

This folder is a Gno workspace (`gnowork.toml`) with two realms:

- `markets` (this folder): collateral, positions, quotes and payouts. Public, so it can never change once deployed; a fix is a new path.
- `home/` (`gno.land/r/nym-sixseven067/home`): 67's site on gno.land, written in Gno and rendered by gnoweb. The home page lists the open markets read live from `markets`, then "Four calls settle a market" in columns; `:how` is how it works; `:contract` is every call with its exact refusals, each linked to gnoweb's call form. It holds no funds and no state, and it is **private** (`private = true` in its `gnomod.toml`), so the same deployer can publish a new version at the same address. Columns use `<gno-columns>` with `<gno-columns-sep>`, the syntax Onyx's gnoweb supports.


This source targets the Gno VM from `github.com/gnolang/gno@v1.5.0`. The module path is `gno.land/r/nym-sixseven067/markets`, a namespace that can be registered for free on Onyx testnet. It has been deployed to a local gnoland v1.5.0 node and exercised there through the app; Onyx deployment follows [ops/README.md](../ops/README.md) once approved.

## Execution contract

- Administrator creates a binary market: question, exact rules, Polymarket condition ID, ordered Yes/No token IDs, opening quote, closing block time and trusted oracle address. Everything except the quote is immutable.
- `SetQuote(cur, id, yesPricePpm, expectedVersion)` lets the administrator publish a new fixed quote while trading is open. `expectedVersion` must equal the current `QuoteVersion`; each published quote is appended to a bounded history (240 points) with its block time. `Buy` still requires the exact price the buyer reviewed, so a requote can never execute a purchase at a price the buyer did not see.
- `ProposeAdministrator(cur, next)` and `AcceptAdministrator(cur)` hand the administrator role over in two steps; the new address must accept from its own direct call. Existing markets keep their oracle.
- A direct user `Fund` call sends reserve capital in `ugnot`, allocated to that market only. Funding is non-refundable; this initial implementation exposes no reserve withdrawal.
- A direct user `Buy` call sends the exact rounded-up quote in `ugnot`. Amounts and prices use integer math: one million micro-shares represent one share; a winning micro-share pays one `ugnot`. Aggregate liability for either possible winner cannot exceed that market's collateral. The current quote is fixed when the market is created; this is not an AMM or order book.
- Only the pinned oracle's direct user identity can finalize once from a verified external final result. The entire immutable source binding must match. Only `Yes` or `No` is accepted, with a lowercase SHA-256 evidence hash. A source may resolve before the planned deadline: the oracle can finalize early, and that same transition immediately stops `Buy` and `Fund`. The planned `ClosesAt` is a trading deadline, not a veto on external finality.
- A position owner calls `Claim` once. Winning shares receive on-chain bank coins; losing positions close with a zero payout. Other users cannot claim their position.

`FinalizeByOracle(cur realm, id, conditionID, rulesHash, yesTokenID, noTokenID, winner, evidenceHash string)` is the exact source signature. `cur` is Gno's crossing context; the seven string values form the business arguments. `conditionID` has the `0x` prefix followed by 64 lowercase hex characters. `rulesHash` and `evidenceHash` contain 64 lowercase hex characters without a prefix. Token IDs are canonical decimal strings in Yes/No order.

## External result boundary

Gno does not fetch Polymarket. An off-chain parser verifies the bound market and finalized external result, stores the evidence and prepares an oracle transaction. The realm authenticates the pinned oracle and binding; it does not independently prove the contents of the external API record. This is a **trusted oracle** model. The evidence hash is a commitment, not an external finality proof. A price near 100%, a proposed outcome, an API outage, a void result or a binding mismatch must not authorize finalization. No signer keys or automatic broadcasts are included here. Trading stops when the signed oracle finalization is included on Gno; latency between external resolution and that inclusion remains an economic risk of the fixed quote and must be addressed before financial deployment.

The question/rules binding is `SHA256(UTF8(byteLength(question) + ":" + question + byteLength(rules) + ":" + rules))`. Byte counts are UTF-8 byte lengths, including non-ASCII text. The same framing is used by the backend.

## Read projections and events

`GetMarket`, `GetPosition` and `QuoteHistory` return detached native copies. `MarketJSON(id)`, `MarketsJSON()`, `PositionJSON(id, owner)` and `PositionsJSON(owner)` return explicit JSON with escaping for quotes, backslashes and control characters; the app reads `MarketsJSON()` and `PositionsJSON(owner)` with one `vm/qeval` query each. Market JSON adds `quoteVersion`, `createdAt`, `volumeUgnot` (sum of purchase costs, excluding funding), `trades`, `holders` (distinct buyers) and `history`. `Render` (in `render.gno`) draws the realm's gnoweb page: the market list at the root and one page per market at `:<id>` with the prices, the status, the rules, the source binding, the record and the last ten quotes, linking to the app for trading. Question and rules text is escaped so it stays literal Markdown. Gno 1.5.0 has no `encoding/json` standard package, so the projections require no external JSON package.

Every state change emits an event through `chain.Emit`: `MarketCreated`, `QuoteUpdated`, `Funded`, `Bought` (market, buyer, outcome, microShares, costUgnot, pricePpm), `Finalized`, `Claimed`, `AdministratorProposed`, `AdministratorAccepted`. The app's trade history reads `Bought` events from the tx-indexer; balances and positions always come from the realm itself.

Financial integers (`escrowUgnot`, `yesMicroShares`, `noMicroShares`, `spentUgnot`, `paidUgnot`) are **decimal strings** in JSON. Read them as `BigInt` or equivalent exact integers; do not convert to JavaScript `Number` for accounting. `yesPricePpm` is a bounded numeric value. Time fields are Unix seconds. Native functions retain `int64` values.

## Local verification

Verified on Windows x64 with the local CLI built from `github.com/gnolang/gno/gnovm/cmd/gno@v1.5.0` using Go 1.26.9. The CLI build reports `develop`; the installed source module is pinned to `v1.5.0`. Run from this directory so the CLI can find `gnomod.toml`. These are the commands used in this workspace:

```powershell
$workspace = (Resolve-Path '../../..').Path
$gnoTool = Join-Path $workspace 'work/gno-bin/gno.exe'
$gnoSource = Join-Path $workspace 'work/go-mod/github.com/gnolang/gno@v1.5.0'
$contractLogs = Join-Path $workspace 'work'

& $gnoTool fmt -w -imports=false . 2>&1 |
    Tee-Object -FilePath (Join-Path $contractLogs 'contract-fmt.log')
& $gnoTool test -root-dir $gnoSource -v . 2>&1 |
    Tee-Object -FilePath (Join-Path $contractLogs 'contract-tests.log')
& $gnoTool lint -root-dir $gnoSource -v . 2>&1 |
    Tee-Object -FilePath (Join-Path $contractLogs 'contract-lint.log')
```

On 2026-10-11 (Codex, Windows) the earlier version passed 18/18 groups. On 2026-10-11 (Claude, Linux, gno v1.5.0 CLI built with Go 1.26.9) the version of that day passed `gno fmt`, 22/22 test groups (`ok . 1.73s`) and `gno lint` with exit code 0. The equivalent Linux commands:

```sh
export GNOROOT=$(go env GOMODCACHE)/github.com/gnolang/gno@v1.5.0
gno fmt -w -imports=false . && gno test -root-dir $GNOROOT -v . && gno lint -root-dir $GNOROOT .
gno test ./home   # the home realm, resolved through gnowork.toml
```

On 2026-10-14 the markets realm passed **27/27 groups** (23, then the four threat and property groups of `threat_test.gno`) (the new `Render` pages and escaping) and the home realm 2/2. Both were deployed to a fresh local gnoland v1.5.0 node at their real paths, the four markets seeded and funded, one purchase and one requote made, and every page screenshotted through a local gnoweb v1.5.0 at 1440 and 390 in dark and light (`.qa/gnoweb/`).

`markets_test.gno` establishes a test deployer, issues coins through the controlled test banker and simulates crossing callers and block times. It covers proportional Yes/No payouts, fractional rounding, one-time claims, administrator/oracle authorization, immutable binding, one-time and early finality, integer overflow, UTF-8 source hashing, JSON escaping and exact large integer strings, payment envelopes, intermediate-call refusal and market-specific funding.

`markets_test.gno` also covers the two-step administrator handover, versioned requotes (authorization, stale version, invalid and unchanged quotes, history, trading-closed refusal), volume, trade and distinct-holder counters, and the collection projections and `Render`.

`payments_test.gno` adds nine direct boundary scenarios: changed review, inexact amount, buying/funding after the deadline, uncredited envelope, borrowing another market's collateral, buying/funding after early finalization, and a purchase reviewed before a requote. It calls `Buy(cur, ...)` and `Fund(cur, ...)` within the same realm using the runner's live captured context, as supported by Gno. This preserves the origin-call frame count; a `revive` wrapper would add a boundary and test a different refusal. Existing-market fixtures use the runner's captured test EOA. Each refused payment checks the exact error and unchanged market, position and total escrow. Production authorization is unchanged.

On a local gnoland v1.5.0 node the realm was deployed with gnomcp, four Polymarket-bound markets were created and funded, quotes were updated, a purchase at a stale price was refused by the node (simulated call), and the app bought, reconciled and displayed a position through an Adena stand-in that broadcast real transactions (see QA.md). This does not demonstrate Onyx deployment, real Adena signing, an external oracle broadcast or a financial security audit. Before deployment, independently review the economic model, collateral provisioning, trusted oracle operation, failure recovery and handling of void outcomes.

## Realm v2 (`v2/`, live on Onyx since 15 October)

`gno.land/r/nym-sixseven067/markets/v2`, specified in `docs/LAUNCH-PLAN.md` ("Realm v2") and built on 15 October:

- **Listing.** `CreateMarket(id, question, rules, conditionID, yesTokenID, noTokenID, yesLabel, noLabel, tradingEndsAt, yesPricePpm, noPricePpm, feePpm, oracle, treasury, topic)`. The administrator lists freely; the lister role lists only on the listing terms (`SetListingTerms`: oracle, treasury, fee). The oracle must be an account other than the administrator, quoter and lister. `yesLabel` and `noLabel` are the outcomes' names in token order as Polymarket shows them: "Yes" and "No", or two teams for a match (1–48 bytes, printable, no surrounding spaces or markup characters, not equal). Yes and No in every other call mean the first and second token. `topic` is the 67 topic the market is shown under.
- **Fee.** `Fee(microShares, price, θ)` = ceil(θ × microShares × price × (10⁶ − price) / 10¹⁸) ugnot, exact through `math/bits`; θ is fixed when a market is listed and capped at `MaxFeePpm` (0.07). A buyer sends cost plus fee exactly; `Quote` returns both.
- **Quotes.** `SetQuote(id, yes, no, expectedVersion)`: each side within 0.03–0.97, Yes + No ≥ 1 + the minimum spread. The same prices again renew the quote's time without a new version. `Buy` refuses a quote older than the quote lifetime.
- **Limits and pause.** Per trade, per holder and per market side, plus a realm-wide exposure cap. `Pause` (quoter, guardian, administrator), `Resume` (administrator). Claims are never paused.
- **Resolution.** `ProposeOutcome` (the market's oracle: Yes, No or Void with the full binding and an evidence hash) stops trading; the guardian can `CancelProposal` for 24 hours; then anyone can `Finalize`. `VoidAbandoned` voids a market still unsettled 60 days after trading ends.
- **Money out.** `Claim` pays winners, or on Void refunds cost and fee, and deletes the position. `WithdrawSurplus` (anyone) sends what a final market no longer owes to the treasury fixed at listing.
- **Roles.** Administrator, quoter and guardian, each handed over in two steps; quoter and guardian can be revoked at once. Listing, settings, roles, resuming and resolution refuse session keys; quoting, pausing, buying and claiming accept them.

```sh
(cd contracts && gno test ./v2)   # 31 groups
REALM=gno.land/r/nym-sixseven067/markets/v5 bash ops/v2-local-check.sh   # 20 checks on a local node
```

Deploying v2 takes about 72 million gas and about 72.7 KB of storage (7.27 GNOT storage fee at the local price, gas fee 0.1 GNOT at the default price); gnomcp's default 10 million gas fails with a misleading "unauthorized", so deploy with gnokey and `-gas-wanted 100000000`.
