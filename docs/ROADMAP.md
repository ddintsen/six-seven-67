# 67 roadmap

Updated 27 November 2026.

67 offers prediction markets with published quotes, collateral checks and verifiable outcome evidence on Gno.land. The next step is a reproducible live Onyx lifecycle, then a pilot for additional resolution sources and community-proposed markets.

## Where it stands

- Markets v2 is live on Onyx at `gno.land/r/nym-sixseven067/markets/v2`, beside the earlier Markets v1 and 67's own pages in Gno.
- Panthers vs. Eagles has a verified purchase (block 432,668) and an oracle proposal (block 1,442,078) whose evidence hash recomputes from Polygon. It can be finalized from 28 November 2026, 03:51:17 UTC; the claim follows.
- Sabres vs. Maple Leafs finalized with a winner and India vs. West Indies as Void. Neither had trades. [Receipts and the verifier command](ONYX-EVIDENCE.md).

## Before the Gnome Tavern deadline (18 December 2026)

| Deliverable | Evidence |
| --- | --- |
| One market from purchase to payout | `Bought`, `OutcomeProposed`, `Finalized` and `Claimed` under the Panthers market ID, with the claimed amount equal to the shares bought |
| Markets open for trading during judging, 18–21 December | A fresh wallet buys at the reviewed price on Markets v2 |
| Automated checks on the submitted revision | Realm and web tests run on every push to the default branch |

## 2027

| Quarter | Deliverable | Evidence |
| --- | --- | --- |
| Q1 | Publish a funded Void refund. Automate evidence collection, duplicate-safe proposal preparation and review-window alerts for Polygon-backed markets. | For Void, link the funded position and the successful refund. Replay the watcher through agreement, disagreement, outages and cancelled proposals. |
| Q2 | Define a source policy and pilot an original market and one esports tournament on Onyx. Assess official tournament result feeds, permitted licensed data providers and other public settlement networks. | Publish frozen rules and reproducible evidence for one test market. Show how the rules handle postponement, forfeits, format changes, replayed matches and missing results. |
| Q3 | Pilot user-submitted market requests. Add review of the question, evidence sources and outcome rules, followed by a community listing vote. Publish oracle and reserve monitoring. Move the guardian to a party independent of the oracle. | A user submits a draft, reviewers publish a decision, eligible accounts vote and a selected draft is listed with frozen terms. Alert logs show when disagreement or stale data blocked an automated proposal. |
| Q4 | Review which sources and fallback rules may be automated, who can dispute an outcome, and whether a broader esports or community forecasts pilot can proceed. Publish a mainnet decision covering collateral, role separation, recovery, data rights and legal clearance. | Release the review against a pinned commit. Record source approval, evidence verification, dispute drills and approval gates before any real-money deployment. |

## Which source decides the outcome

- Polygon is the first supported source of settlement evidence for Polymarket-bound markets. Two independent RPC services read the same Polygon record. They check access and consistency, while the pinned settlement record determines the evidence.
- Every new market should name its authoritative source, the exact event or record ID, the condition for a final result, the observation cutoff and the fallback order before trading opens.
- For esports, prefer an official tournament or league result for the exact match and series format. Consider a licensed provider for independent checks or as a fallback when the published rules explicitly allow it. For other categories, test permitted primary sources such as official release records and independently verifiable settlement records.
- Compare sources for identity, finality, corrections, availability and reuse rights. When evidence conflicts or no listed source is available, keep the outcome pending through the published review period and apply the market's documented Void rule at the cutoff.
- Keep the current v2 oracle and guardian roles for existing markets. New source adapters and any wider dispute role require separately reviewed on-chain rules and test evidence.

## Oracle automation and review

1. Read only the configured sources for the exact market and reject stale or mismatched records. Record source identifiers, observed times and references in a reproducible evidence bundle.
2. Prepare a proposal from that bundle. Keep signing restricted to the configured oracle. Alert the guardian when evidence disagrees or the proposed result enters review.
3. After the 24-hour review window, retry finalization safely, checking that the market is still proposed and its evidence hash still matches. Claiming belongs to the holder.
4. Publish the outcome trail and show what needs manual review on the status page.

## Community market requests

1. Users submit a question, outcome options, close date, authoritative source, fallback and Void rule. The draft shows what happens if the event is cancelled or reported late.
2. Reviewers check clarity, data rights, duplicate questions and whether the result is independently reproducible before opening a listing vote. The review decision and any edits are published.
3. Voter eligibility, quorum and conflict rules are published before voting opens. The pilot uses a wallet vote that does not weight ballots by money committed to a market.
4. The listing vote selects which approved requests become markets. An oracle proposes the event outcome from the frozen source policy, and reviewers evaluate disputes against the published evidence rules.

An early original-market candidate: a test market about a specific change in a named Gno release, with the cutoff, the qualifying release tag and the commit defined in advance.

See [Onyx evidence](ONYX-EVIDENCE.md), [oracle proposals](ORACLE.md) and [launch review](LAUNCH-PLAN.md).

## Mainnet and the Builder Retention Prize

If 67 wins an upfront award, a mainnet deployment follows only after the launch review clears it. The program's checkpoints are counted from the winners announcement:

| Program target | Month 3 | Month 6 |
| --- | --- | --- |
| Unique qualifying addresses | 50 | 100 |
| Transactions calling the project's realms | 500 | 1,500 |
| Monthly active addresses | 20 | 50 |
| Community followers or members | 200 | 500 |

Each checkpoint needs a live mainnet realm, a deployment link, a demo and usage numbers: at least one release or mainnet deployment and two public updates each month, and at least one external integration, beginning with a read-only market or outcome-evidence consumer. Team-funded and newly created wallets do not count. [Official criteria](https://dorahacks.io/hackathon/gnome-tavern/detail#builder-retention-prize).
