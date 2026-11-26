# Product interface contract

## 1. Task contract

The user compares binary questions, reviews a Yes/No purchase and checks held positions and credited payouts. The working objects are the question catalogue, a question's price history and purchase ticket, and a position ledger. Interface data is browser-local demonstration data; native Adena account/network reads and the gateway are separate surfaces. Demo credits are not GNOT.

Context: question identity and applied query/topic are in the route; deadlines use UTC; prices use demo credits per share; histories contain ordered individual samples without calendar timestamps or aggregation. Quote versions are captured at review. The gateway and unsigned oracle proposal retain their network, exact source binding and observation time.

| Entry | Action | Observable result |
| --- | --- | --- |
| Markets | Filter/search, open a question or its No price | Applied scope is retained on return; the intended question and outcome open. |
| Question | Enter an amount, connect demo wallet, review and confirm | Review identifies outcome, amount, price, shares and risk; one confirmed simulation debits once. |
| Question | Select Recent / All | Caption names the applied observation window; accessible values contain exactly the shown samples. |
| Portfolio | Filter lifecycle or open Activity | Positions and confirmed purchases remain distinct; unavailable values and uncredited payouts are explicit. |
| Final simulated outcome | Settle, then reload | Eligible proceeds are credited once and are already included in cash. |
| Adena panel | Connect, retry, cancel or disconnect | Account/network state is explicit; a stale response cannot restore a disconnected account. No signing is implied. |

Failure boundaries include changed/unavailable quotes, rejected or failed simulations, storage conflict/quota/unavailable storage, unused accounts, wrong network, late provider responses and timeouts. These are tested at their own layers, not treated as proof of live trading.

## 2. Reference selection

Anchor: the owner's Polymarket reference, inspected at 1440 and 390 px (REF-3 in REFERENCES.md). It matches binary-question comparison and trade-ticket density. Kalshi's official portfolio documentation (REF-8) supplies the distinction between cash, cost, quoted value and payout; rendered Kalshi/account-specific portfolio screens were unavailable.

The product-interface-design 1.3.0 query routed to `ron-empower-pfm-mobile`. Its complete brief and layout claims were read. It is a published trial of savings and financial goals, explicitly excludes dense ledger comparison, and shows no trade form or verified runtime. It is therefore not the anchor. Its `bucket-grid` observation is not imported. No external palette, wordmark, imagery, figures or token system is copied.

## 3. Source-to-decision map

| Decision | Evidence and basis |
| --- | --- |
| Keep question, outcome and price close | `REF-3#question-outcome-proximity` (observed in the opened public page; proposed for 67). |
| Use aligned financial rows rather than oversized question sections | `REF-3#compact-comparison` (observed); the ledger adaptation is proposed and independently checked in 67. |
| Separate cash, costs, indicative value and credited proceeds | `REF-8#portfolio-accounting` (observed publisher documentation); local accounting behavior is independently tested. |
| Keep practice currency separate from native balance | `67#currency-boundary` (proposed requirement, implemented in source and tested with controlled provider data). |
| Retain the 67 wordmark, Instrument Sans and restrained warm palette | `67#owner-identity` (owner direction, proposed receiving-product design). |
| Hide the chart data table visually while retaining semantic cells | `R6#accessible-values` (proposed requirement, real-route regression test; no claim that a reference implements it). |

These claim names identify the local observations recorded here; they are not claims recovered from the studio corpus. Reference screenshots describe composition, not accessibility, banking behavior or exact CSS tokens.

## 4. Zones and axes

Persistent navigation identifies Markets, Portfolio, native wallet and practice cash. The catalogue gives the leading question one wider comparison surface, followed by compact questions. A question keeps identity, UTC deadlines, chart/window, ticket, lifecycle and resolution rules in reading order; the desktop ticket occupies the narrower action pane. Portfolio uses a flat summary, view/lifecycle controls and the ledger or Activity. Occasional simulation configuration belongs in Demo controls, outside the ticket.

Chart x-axis means ordered observations, not elapsed time. Its y-axis shows Yes price as a percentage of the one-credit winning payout; the caption/table supply credits per share. A single sample is a point, not a fabricated path. No provided history yields History unavailable.

## 5. Type, colour and geometry roles

The existing host system wins. Operational Portfolio headings are 36 px desktop / 27 px narrow, question rows 14–15 px, numeric rows 13–14 px and supporting metadata 11–12 px (implemented CSS, not recovered reference measurements). Compared values use tabular figures. Large condensed question type is confined to question identity. Action, selection and outcome colours retain text equivalents. Borders mark rows, panes or controls; metadata does not acquire decorative badges. Narrow controls have at least 44 px targets in the measured scenarios.

## 6. Components and state matrix

| Component | Relevant states and recovery |
| --- | --- |
| Catalogue | Applied topic/search/sort, no matches with recovery, unavailable quote with no dead entry action. |
| History | All/Recent, exact ordered table values, one sample; zero-history branch is source-covered but has no valid persisted fixture because the state validator requires nonempty history. |
| Ticket/review | Disconnected, invalid amount, insufficient cash/liquidity, unavailable price, captured review, pending, confirmed, rejected, failed, changed quote; Cancel retains the input. |
| Portfolio | Open/awaiting/settlement-pending/settled, examples labelled, no positions versus no filter matches, separate Activity and its empty state. |
| Adena dialog | Missing extension, connecting, active/unused account, wrong network, refresh/error/retry, cancelled/disconnected, timeout requiring reload. |
| Demo controls | Market lifecycle and simulation outcome, explanatory result feedback, reset/recovery; settings never represent blockchain events. |

There is no bulk row selection, unsupported Sell, deposit control, invented cash-out action or Undo for an irreversible chain operation.

## 7. Data and mutation contract

| Requirement | Coverage / boundary |
| --- | --- |
| R1–R4 | Question/query/UTC/unit are visible; histories explicitly lack dates. Quote availability, zero native balance, absent account and unavailable source are distinct. Wallet request identity guards stale results. |
| R5 | No multi-row selection; not applicable. |
| R6 | Semantic values table, applied sample count, unit and raw ordered history. One-point history is not duplicated. |
| R7 | Empty/no-match/recovery and provider error/timeout states are exercised; the current catalogue uses local data, not a remote-loading skeleton. |
| R8 | Amount survives connection, review cancellation and recoverable trade failures. Cross-route/reload persistence of an unconfirmed amount is not implemented; a fresh ticket starts with its default amount. |
| R9–R11 | Demo review captures price/version and checks the latest saved state before a debit. Confirmed demo persistence is not presented as a chain receipt. Contracts check caller, exact binding, collateral and one-time claims. |
| R12–R13 | Timed-out provider operations are not silently repeated; recovery requires reload. No native mutation is wired, so transaction-ID reconciliation and public signing remain future integration work. No fictitious Undo is offered. |
| R14 | Stable question IDs and filtered return route; keyboard return flow tested. |
| R15–R16 | Keyboard/focus/reduced motion, target sizes and responsive recomposition have scoped browser evidence. Actual browser zoom, screen-reader use and full WCAG conformance are not claimed. |
| R17 | Illustrative questions, quotes, examples and local settlements are explicit; potential payout is not profit. Public-source results do not automatically prove an on-chain outcome. |

A1–A8 are not applicable: the product has no AI generation, discussion or shared result workflow. The absence is not an assertion about studio examples.

## 8. Narrow-screen recomposition

Catalogue questions wrap without truncating identity. The detail ticket follows the chart in document order. Portfolio replaces desktop columns with a full question and labelled financial pairs; filters scroll within their own control strip. At 390×844, the first position's Position and Cost values must be visible without scrolling. At 320 px the priority is readable identity and complete labelled values rather than a fabricated above-the-fold guarantee.

## 9. Verification plan

Run the production build and full available Node and Playwright suites; reproduce missing chart-table coverage before its fix; verify All/Recent and the allowed one-sample saved boundary on the real detail route. Independently review the changed source and rendered chart/caption at 320/390/768/1024/1440 with normal/reduced motion. Preserve the independent Portfolio 24-render/three-flow evidence because its source and CSS are unchanged by the chart patch. Recheck standalone trade/persistence/settlement in Chrome and Edge. Record exact results and performance budgets in QA.md rather than promoting this specification to runtime proof.

## 10. Unknowns

Live Adena approval/signing, deployed market authority, public-chain transaction rollback, source-relay broadcast, native purchase/claim UI and economic operation have not been verified. The fixed-price contract is a local foundation, not an AMM or shared Polymarket order book. Mainnet deployment, authenticated reference portfolios, actual browser zoom, physical devices, screen readers, Safari/Firefox and field performance remain outside the exercised environment. Cross-route purchase drafts require a separate persistence contract before native trading is enabled.
