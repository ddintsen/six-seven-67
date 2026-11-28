# Verify 67 on Onyx

Use these records to inspect purchase pricing, oracle finality and void handling on the deployed Markets v2 realm. Transactions were collected from 26 to 28 November 2026 from the Onyx indexer, then checked against Onyx RPC and gnoweb. The [status page](https://the67.click/#/status) shows the current state.

## Check it yourself

One read-only command rebuilds a market's record from public endpoints. Run it from the repository root with Node.js 22.22 or newer; it needs no `npm install`:

```sh
node --experimental-strip-types ops/watcher/onyx-evidence.ts market nfl-car-phi-2026-10-18
```

It prints JSON:

- `evidence.result` is `verified` when the hash rebuilt from the market's frozen binding and the payout vector that two Polygon RPCs return equals the hash stored on Onyx.
- `receipts` lists the market's `Bought`, `OutcomeProposed`, `ProposalCancelled`, `Finalized` and `Claimed` events in block order. Each is read from the Onyx node and checked: the hash of its transaction bytes, its height, its success, and the realm and market ID of the event.
- `phase` says what the realm allows next.

Any Markets v2 ID works. `room <id>` reads a [Trade Window](https://github.com/ddintsen/trade-window) room the same way.

## A funded position, end to end

[Panthers vs. Eagles](https://onyx.testnets.gno.land/r/nym-sixseven067/markets/v2:nfl-car-phi-2026-10-18) accepted a purchase of 6.208566 Panthers shares at 0.635 GNOT per share. The `Bought` event records 3.942440 GNOT of cost and 0.057560 GNOT of fees, for 4.000000 test GNOT total.

| Step | Receipt |
| --- | --- |
| Purchase: 6.208566 Panthers shares for 4.000000 test GNOT | [Block 432668](https://rpc.onyx.testnets.gno.land/tx?hash=0xA5F90CB7C145443E6C153913967161EF2043C4482FA0C275BC97CC6E29F4C3DA) |
| Proposal: Panthers (Yes), evidence hash `f587f746…7f1d` | [Block 1442078](https://rpc.onyx.testnets.gno.land/tx?hash=0xFB22504649D26C75A625A518F3E792CCFD50F6FA0249844EC04E5563D304C767) |
| Finalization, after the 24-hour review | [Block 1467383](https://rpc.onyx.testnets.gno.land/tx?hash=0x5D29EB4535C14065BC8AE379023DBC1AADCE97B2AE4B812D2E34ECBA0218C144) |
| Claim: 6.208566 test GNOT to the holder | Waits for the holder's signature |

On 27 November the designated oracle proposed Panthers (Yes). Two Polygon RPCs returned `[1, 0] / 1`, and the command above recomputes the hash recorded on Onyx. The guardian could cancel the proposal until 28 November 2026 at 03:51:17 UTC and did not. The robot sent `Finalize` on its scheduled run at 04:41 UTC; once the review window has passed, any account may.

## Outcome and finality

| Market | Polygon payout numerators / denominator | Oracle proposal | Finalization |
| --- | --- | --- | --- |
| [Sabres vs. Maple Leafs](https://onyx.testnets.gno.land/r/nym-sixseven067/markets/v2:nhl-buf-tor-2026-10-15) | `[1, 0] / 1` (Sabres) | [Block 438180](https://rpc.onyx.testnets.gno.land/tx?hash=0x74E99F0EAC498DCD91734B04DF8919A9D10E4E1460D514FB0CE58C4C0911730E) | [Block 462396](https://rpc.onyx.testnets.gno.land/tx?hash=0xDE34C22E37EA1533C132856B6A26E4EEFB0D44BBC22796F18FD8EB165989291E) |
| [India vs. West Indies](https://onyx.testnets.gno.land/r/nym-sixseven067/markets/v2:crint-ind-wst-2026-10-17) | `[1, 1] / 2` (Void) | [Block 481503](https://rpc.onyx.testnets.gno.land/tx?hash=0xA3AAF8EC4DD4D374B38991CA4A04E171A670BC70F6F3E702492610CDF1FDDEE3) | [Block 508403](https://rpc.onyx.testnets.gno.land/tx?hash=0x000C099CFAB8A2C79E7907C1CB39ACC79EE974873FAE2305825CA2F5BA4A640F) |
| [Panthers vs. Eagles](https://onyx.testnets.gno.land/r/nym-sixseven067/markets/v2:nfl-car-phi-2026-10-18) | `[1, 0] / 1` (Panthers) | [Block 1442078](https://rpc.onyx.testnets.gno.land/tx?hash=0xFB22504649D26C75A625A518F3E792CCFD50F6FA0249844EC04E5563D304C767) | [Block 1467383](https://rpc.onyx.testnets.gno.land/tx?hash=0x5D29EB4535C14065BC8AE379023DBC1AADCE97B2AE4B812D2E34ECBA0218C144) |

Read the condition ID and evidence hash on each market page. For each market, the `OutcomeProposed` and `Finalized` events record the same evidence hash as gnoweb. PublicNode and dRPC independently returned the payouts above from the Polygon Conditional Tokens contract. The [oracle guide](ORACLE.md) explains how to verify a commitment against its canonical evidence record.

## Claims and refunds

Sabres and India show zero trades, so they have nothing to claim. Panthers holds one position: its holder's `Claim` pays 6.208566 test GNOT, and a `Claimed` receipt with a positive `payoutUgnot` completes the record. A funded Void refund is still to be shown.

To reproduce payout and refund behavior with funded positions:

```sh
cd contracts
gno test ./v2
```

The [Markets v2 tests](../contracts/v2/markets_test.gno) cover buying, proposing an outcome, finalizing and claiming. They also assert that a Void refunds the recorded cost and fee. The [collateral property test](../contracts/v2/threat_test.gno) checks every holder's payout across generated market scenarios.

## Recompute the v2 evidence hashes

[Download the three evidence records](ONYX-V2-EVIDENCE.json). Each record contains the Onyx market binding and the payout vector returned by two Polygon RPCs. Run this from the repository root with Node 24:

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {canonicalJson,sha256Hex} from "./src/live/oracle.ts"; for (const {record,evidenceHash} of JSON.parse(readFileSync("docs/ONYX-V2-EVIDENCE.json","utf8"))) { const actual=await sha256Hex(canonicalJson(record)); if(actual!==evidenceHash) throw new Error(record.binding.marketId); console.log(record.binding.marketId,actual); }'
```

Compare the three results with their `Finalized` receipts above. The hash commits to the evidence data. The designated oracle proposes the result, and the guardian has 24 hours to reject it.
