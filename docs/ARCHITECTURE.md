# Architecture and assumptions

## Scope

67 has two venues behind one interface. **Testnet** reads markets, positions and quote history from the 67 realm through public Gno RPC and sends purchases and claims through Adena. **Practice** is the browser-local exchange with illustrative questions and demo credits. The realm has been deployed and exercised on a local gnoland node; Onyx deployment is prepared in `ops/` and awaits approval.

The contract defines independent collateral, fixed-price binary positions, pinned oracle finalization and single-use claims. Registered binding fixes the exact Polymarket condition, rules digest and outcome/token mapping. Unsigned proposals commit API reports for oracle review; they do not prove Polygon state or broadcast. A67 position does not create a Polymarket position.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/data.ts` | Immutable binary-market fixtures, exact bound questions and concept rule versions. |
| `src/domain.ts` | Typed markets, positions, trade inputs and separate lifecycle axes. |
| `src/engine.ts` | Pure trade, quote, scenario, settlement and persistence-validation logic. |
| `src/store.ts` | React external store, localStorage persistence and cross-tab updates. |
| `src/App.tsx` | Hash routes (home, how it works, contract, markets, market, portfolio), discovery filters, venue bar, wallet dialog and question transitions. |
| `src/TradePanel.tsx` | Captured-quote practice trade flow. |
| `src/Portfolio.tsx`, `src/DemoLab.tsx` | Position lifecycle groups and explicit simulation controls. |
| `src/brand/` | The cube mark: grid coordinates (`mark.ts`) and the oblique glass drawing plus favicon markup (`Mark.tsx`). |
| `src/styles.css` | The V6 dark visual system: tokens, app surfaces, site pages, responsive rules. |
| `src/site/` | How it works (with the purchase calculator using the realm's arithmetic), Contract (function reference generated from `contractFacts.ts`, deployment status from the chain). |
| `src/adena.ts`, `src/WalletPanel.tsx` | Validated provider protocol, serialized requests, exact GNOT formatting, contract calls (`DoContract`) with committed/broadcast/rejected/failed/unknown results, network switching. |
| `src/live/` | Chain configuration, `vm/qeval` reads with Go-string decoding and validation, exact BigInt quote arithmetic identical to the realm, polling store with request identity, tx-indexer trade history, realm refusal messages, presentation catalog for the bound markets. |
| `src/view.ts` | One `MarketView` model for both venues; a value a venue cannot provide is null, never invented. |
| `src/ui/` | Header (split around the mark, menu sheet below 1024 px, venue switch), Markets, MarketPage, TestnetTicket, TestnetPortfolio, chart, wallet dialog and footer. |
| `src/landing/` | Home page; shared voxel builders and the sway shader (`voxels.ts`); the lazily loaded hero forest (`forestScene.ts`, with the ambient loop) and the four-calls scroll story (`storyScene.ts`); the who-does-what diagram (`Parties.tsx`); `public/forest-night.webp` is its still placeholder and no-GPU fallback, regenerated from the scene's loopback-only poster mode. |
| `server/` | Fixed-upstream reads, immutable binding and unsigned resolution proposals. |
| `contracts/` | Gno collateral, positions, oracle finalization and claims. |

Vite builds a client-only React application; the 3D scene is a separate lazy chunk loaded only on the home page, and `STANDALONE=1` inlines it for `67.html`. Hash navigation supports a static preview and direct `file:` delivery. The packager embeds the production assets and the complete OFL texts of Handjet, IBM Plex Sans and IBM Plex Mono in one HTML file; source delivery retains the original license. It rejects external linked resources, CSS imports and module-dependent JavaScript bundles. Practice trading has no runtime data-service dependency; the gateway must be running for API reads.

The standalone file embeds its font directly in CSS and omits the redundant font preload from the web build. Chrome's file-origin preload produced an unused-resource warning; the CSS font loads successfully without it. The served build retains its normal font preload.

## Prototype economics

The prototype assumes binary shares denominated in nonredeemable demo credits. One winning share pays **1 credit** after confirmed local settlement; a losing share pays **0**. A displayed Yes quote of `p` gives a No quote of `1 − p`; shares equal spend divided by the selected quote. A percentage is the price divided by the assumed one-credit payout, not an objective forecast. Fees are zero in this model and maximum loss is the full spend.

This is a deterministic fixture quote model with a spend/liquidity cap. It does not select or implement a production AMM or order book, slippage curve, mint/redeem system, collateral token, fee policy or solvency guarantee. Portfolio indicative value is shares times the current local quote; it is distinct from spend, available cash and credited settlement proceeds. The practice engine has no sell/redeem action; deployed claims are not connected to the UI.

## Safety boundaries

Trading availability (`open`, `closed`, `paused`), source outcome (`awaiting`, `proposed`, `disputed`, `final`, `stale`, `unavailable`, `mismatch`, `invalid`) and local settlement (`not_ready`, `pending`, `confirmed`) remain separate fields.

Review captures the outcome, amount, unit price and quote version. Quote revisions require another review. The engine checks wallet simulation state, amount, balance, liquidity, trading/source availability and quote identity before a debit; repeated confirmation IDs cannot debit twice. Pending, rejected and failed simulation states do not create confirmed positions.

Settlement requires closed trading, a finalized source outcome and pending local settlement. It credits winning positions once and records zero proceeds for losers. Unfinalized proposals, disputes, stale/unavailable evidence and identity mismatches cannot confirm settlement. Later source observations cannot rewrite a confirmed local result or credit it again. Invalid/paused markets do not promise refunds. These are demo invariants, not audited contract guarantees.

Data persists under localStorage key `67.demo.v1`. Restore validates the envelope, known market identities, amounts, trade/position correspondence and settlement consistency; invalid records reset with a visible notice. Immutable fixture questions/rules cannot be replaced through persisted overrides. Storage-disabled browsers retain in-memory session state. This is editable local demo data, not authentication, secure storage or durable financial accounting; browser tabs are not a transactional ledger.

A failed write retains the latest in-memory state and shows a persistence notice. A later successful mutation can save that state if the stored record still matches the last known record. If another tab saved a different record during the failure, recovery does not overwrite it: the current tab keeps its unsaved state and explains that reloading loads the saved record and discards its unsaved changes. There is no automatic financial-state merge. Cross-tab synchronization and stale-state checks reduce ordinary conflicts; they do not provide atomic simultaneous writes.

## Gno.land and external services

Gno MCP0.12.0 was built from pinned source and registered in Codex. Stdio initialize, tools/list (25 tools) and read-only status succeeded. Default target is Onyx `onyx-1`; mainnet is read-only. See [installation evidence](MCP.md). New native tools may require a new chat.

The gateway reads live Onyx RPC and Polymarket CLOB. RPC chain verification precedes account reads; identity, exact integer strings and base64 are validated. An unfunded address returns explicit ACCOUNT_NOT_FOUND404. Fictional practice markets are absent from server/bindings.json and cannot become real conditions through similar wording.

Adena uses the injected provider directly. User permission stays with the extension, as do keys. Provider requests are serialized; timeouts block that provider until reload. BigInt preserves GNOT precision. Local disconnect cancels application callbacks rather than revoking extension permission.

The financial path uses a pinned trusted oracle address. An unsigned proposal requires a registered exact Yes/No source binding and explicit closed-market winner. Its evidence hash commits a report, not a Polygon proof. The oracle must approve and submit to a deployed matching realm. Contract guards enforce caller, binding, collateral, one-time finalization and single-use claims. Finalizing an early source result atomically stops purchases; the planned trading deadline does not veto an already finalized source result.

No public deployment, signature, live trade or winning payout was performed. Polygon proof bridge, oracle quorum, AMM/order book, liquidity withdrawal and void/refund economics remain outside this version. See [backend](BACKEND.md), [oracle policy](ORACLE.md) and [contract](../contracts/README.md).

## Verification boundary

The [scenario contract](SCENARIOS.md) defines observable flows. Node tests prove engine behavior; typechecking/build prove compilation; browser checks prove only the routes, scenarios, viewports and engine actually exercised. See the final [QA record](../QA.md) for evidence and limitations. Standalone `file:` loading requires its own browser smoke and network inspection after packaging.

## Testnet data flow

Reads: `MarketsJSON()` and `PositionsJSON(address)` through `abci_query vm/qeval` on the public RPC (CORS open), plus `status` for the chain ID and block time; every 20 seconds while a testnet view is visible. Responses are validated field by field; financial integers stay BigInt. A failed read keeps the last good data with its observation time. Trade history comes from `Bought` events in the tx-indexer and is labelled as such; it never feeds balances.

Writes: review captures market, outcome, exact price in ppm, quote version, micro-shares and exact cost. Before Adena opens, the app re-reads the market and the position; a changed quote ends in "Review required again" without a wallet prompt. `DoContract` sends one `/vm.m_call` with the exact `send`. The purchase is confirmed only when `PositionsJSON` shows the reviewed shares and cost on top of the pre-trade baseline; a broadcast or silence that never lands becomes an unknown result with a "Check again" reconcile, never an automatic retry. Claims follow the same pattern with `claimed: true` as the receipt.

Chain configuration is fixed at build time (`VITE_GNO_*`); a runtime override for local-chain tests is honoured only on a loopback http origin.
