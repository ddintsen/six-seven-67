# Scenario contract

Scenarios 1–12 use browser-local illustrative data. Later scenarios specify controlled Adena providers, public read-only gateway data, unsigned server proposals or the Gno VM. No funds, real signatures or blockchain writes are used for verification.

Additional interface boundaries: at 390×844 the first position's quantity and cost are visible without scrolling; lifecycle control labels stay inside their own 44×44 targets; Markets has no horizontal overflow at 320px with computed text sizes doubled (a synthetic reflow check, not browser zoom). Demo controls → change this market's Simulation result → close → simulate trade: the selected failure state is used without a debit. Another market starts with Confirmed; navigation retains the original market's setting; reset or reload clears it. The setting is never persisted with balances or receipts. All share quotes use decimal demo credits, without a cent symbol, and the primary trade ticket has no transaction-test disclosure.

1. Markets → search/topic → open a question → exact question and its context; back retains search/topic.
2. Market → inspect chart/rules/source → local quote denomination, trading/resolution dates, immutable rules, source and separate settlement state are readable.
3. Disconnected → select outcome/amount → connect demo wallet → selection retained.
4. Connected → review → simulate → pending then confirmed → debit once, create position once, persist after reload.
5. Invalid/insufficient amount, no liquidity or unavailable quote → readable block; no debit.
6. Quote revision after review → invalidate old review and require a new one.
7. Rejected signature / failed transaction → distinct recovery; no confirmed position or debit.
8. Open → closed → proposed → dispute → final → local settlement pending → confirmed → credit winner once; losers zero.
9. Stale/unavailable source, invalid result or identity mismatch → no premature settlement.
10. Confirmed settlement → source outage → settled position and credited proceeds unchanged; second payout blocked.
11. Portfolio → lifecycle groups, distinct cost/valuation/proceeds; empty state links to Markets.
12. 320–1920px, long title, keyboard, 200% text, reduced motion → complete readable question, no overflow or hidden focused controls.

Browser engine/viewports, exact checks and observed gaps are recorded in QA.md after execution.

## Added wallet, oracle and portfolio boundaries

13. Wallet → missing extension → install link, no account invented; Escape returns focus.
14. Wallet → connect or already-connected permission → exact address/network/GNOT → Refresh focused; local disconnect → Connect focused. Declined permission → Retry focused.
15. Successful unused IN_ACTIVE account → zero GNOT supplied by provider, unused-account notice; locked/malformed failure remains an error. Practice credits never change.
16. Pending permission → Cancel focused; close dialog or move focus → late response cannot steal focus. A timeout blocks that provider until reload because Adena has a single request resolver.
17. Portfolio → state filter → aligned cost/valuation/payout → exact market; Activity shows only confirmed practice purchases, excludes examples and recovers from empty state.
18. Gno gateway → public account read → observed chain first, exact integer strings; absent account404, wrong chain/unavailable upstream explicit failure.
19. Operator-bound source → closed record with exactly one boolean winner → unsigned seven-argument proposal with canonical evidence hash; changed binding, prices alone, contradiction or unbound target → reject without signing.
20. Gno realm → funded market → exact Buy payment and isolated collateral → pinned oracle finalization, even before deadline → Buy/Fund blocked atomically → one Claim payout. Claims and payment guard evidence are limited to controlled Gno VM tests; live chain deployment and real wallet signatures require a separately approved target.

## Testnet venue and landing (V5)

21. Testnet → contract not deployed → plain statement and a one-click switch to Practice; no invented markets.
22. Testnet → markets from the realm → topics from the bound catalog, prices, volume; filters and links work as in Practice.
23. Adena disconnected → ticket asks to connect; Adena on another network → "Switch to Onyx testnet" before any review.
24. Review → exact shares, ugnot cost, payout and contract path → confirm in Adena → confirmed only when the contract shows the position → portfolio row, open cost and market volume update.
25. Rejection, realm refusal (collateral, price, closed) or a quote change after review → no position; the review must be redone; focus returns to the ticket.
26. Broadcast that never lands → "Result not confirmed yet" after 45 s → "Check again" confirms from contract state if it landed later.
27. Finalized market → winning position shows Claim → confirmed when the contract marks it claimed → notice with the amount; losing positions show "No payout".
28. Phone → fixed Buy Yes / Buy No bar selects the outcome, focuses the amount and hides before it can cover the ticket or footer.
29. Landing → the balance in the night forest shows the live Yes price as text, as tilt, as pile sizes and as light; switching markets updates all of them; no WebGL or software rendering → a still of the same forest with the balance at rest and the same text; reduced motion → one still frame.

Scenarios 21–29 run against a controlled RPC, indexer and Adena stand-in (`e2e/testnet.spec.ts`); scenario 24 also runs against a real local gnoland node (`e2e/local-chain.spec.ts`).

## Site (V6)

30. How it works → pick a side, a Yes price and an amount → shares, exact cost, payout, gain and loss computed with the realm's rounding (shares down, cost up to the next ugnot); an invalid amount is explained and nothing is computed.
31. Contract → deployment status read from the chain (deployed with a market count, not deployed, unreadable, checking) → every write function with who may call it, its signature and its exact refusal messages; read functions, events and what the realm cannot do.
32. Below 1024 px → Menu opens a full-screen sheet with all four destinations and the venue switch → choosing a destination navigates and closes it; Escape closes it; no horizontal scroll.
33. Desktop header → site links on one side of the mark, exchange links and the wallet on the other; the current page is marked; Markets carries the venue switch and the search field.

Scenarios 30–33 run in `e2e/site.spec.ts`.

## Living scenes and parties (V6, October 12)

34. Home → scroll into the four calls → the frame pins full screen: the title page, then one call per page with its title rising through masks while the plot plays the call; the index of the four function names marks the current call and jumps to any call; scrolling back reverses everything; without a GPU each call shows its block picture in the same frame; reduced motion swaps pages without movement and shows each call's finished state.
35. Home with the realm live → Who does what shows one line with the operator address and the last quote time, and the oracle address with how many markets are final; while Onyx is being read it says so; with the realm not deployed it says the operator and the oracle start with the realm on Onyx testnet.
36. Hero → on arrival, on scrolling back into view, while the pointer moves over it and when another market is weighed, cloud shadows drift, trees lean and cores breathe for five seconds, then slow to a stop; offscreen, in a hidden tab, with reduced motion or on a slow device it stays still between data changes.

Scenario 35 runs in `e2e/site.spec.ts`; 34 and 36 were inspected in software-rendered frames (QA.md).

## Story pictures (V6, October 12)

37. How it works, Contract and the home steps without 3D → each chapter shows a block picture of its rule beside shorter text → below the fold a picture builds once when it scrolls in; already on screen or with reduced motion it is shown at rest; pictures are hidden from assistive technology and never cause horizontal scroll.

Scenario 37 runs in `e2e/site.spec.ts`.
38. Home on a phone or tablet (375×667 and up) → the headline, the lede and Open markets are on the first screen with room below; at 820×1180 the live price is too.
39. Any decorative motion (picture signals, Who does what flows, the hovering Buy block) → plays once each time its section comes into view and stops within five seconds; nothing moves with reduced motion.

Scenarios 38–39 run in `e2e/site.spec.ts`.
40. Markets or Portfolio with nothing to show (contract not on Onyx, no markets, no matches, not connected, no positions) or an unknown question → one picture, one heading, one line and at most one action; search and topics only when there are questions to narrow.

Scenario 40 runs in `e2e/site.spec.ts`.
41. An unknown address → "Page not found" with a way home and a matching title; a shared link shows the 67 card (Open Graph image 1200×630).

Scenario 41 runs in `e2e/site.spec.ts`.

## Status page and results (October 14)

| Scenario | Expected behaviour | Covered by |
| --- | --- | --- |
| Anyone opens `#/status` | Per market: our Yes price, Polymarket's midpoint, Polygon's settlement, the realm's state; the realm's balance against its escrow; no actions without a role | `e2e/status.spec.ts` (with axe) |
| A result is settled on Polygon and agrees with Polymarket's API | "Results to sign" shows it with the evidence hash; only the market's oracle gets the button; signing sends `FinalizeByOracle` with the prepared seven arguments; the page confirms from the realm | `e2e/status.spec.ts`, `ops/watcher/lifecycle.local.ts` |
| 50-50, a disagreement or a changed binding | Nothing to sign; listed under "Needs attention" | `src/live/oracle.test.ts` |
| The administrator updates prices | Every drifting price (and the brake on a settled market) goes in one Adena transaction with the versions read; if any version changed meanwhile, nothing is applied and the page says so | `e2e/status.spec.ts` |
| A proposed administrator opens the page | "Accept in Adena" completes the handover | `e2e/status.spec.ts` |
| A market is settled on Polygon but not yet in the realm | The market page's question status says so and that the oracle still has to record it | `e2e/status.spec.ts` |
| A market is final | The market page shows the result instead of a price, and a short panel with "Claim in Portfolio" instead of the trade form | `e2e/status.spec.ts` |

## Quote freshness and source

| Scenario | Expected behaviour | Covered by |
| --- | --- | --- |
| A trading market displays a reference | Show when 67 set the quote and when Polymarket was checked with separate wording. The reference names the outcome. | `e2e/freshness.spec.ts`, `src/live/freshness.test.ts` |
| Polymarket has no midpoint or cannot be reached | Show when 67 set the quote. | `e2e/freshness.spec.ts` |
| The 67 quote is more than a day old | "67 quote updated on 11 Oct 2026." | `src/live/freshness.test.ts` |
| The market is closed or final | No line | `e2e/freshness.spec.ts` |
| The lead market on the list | The same line under its price | `e2e/freshness.spec.ts` |
| The connected account is the oracle of two or more settled markets | "Sign all N in Adena" signs every result in one transaction | `e2e/status.spec.ts` |
| Someone claims their last v2 position (or has purchases on record and nothing open) | "Nothing open right now", pointing to Activity, instead of the first-visit state | `e2e/v2.spec.ts` |
