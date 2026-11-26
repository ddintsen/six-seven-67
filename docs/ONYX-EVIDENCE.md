# Verify 67 on Onyx

Use these records to inspect purchase pricing, oracle finality and void handling on the deployed Markets v2 realm. Recorded on 26 November 2026 from the Onyx indexer, then checked against Onyx RPC and gnoweb.

## Purchase

[Panthers vs. Eagles](https://onyx.testnets.gno.land/r/nym-sixseven067/markets/v2:nfl-car-phi-2026-10-18) accepted a purchase of 6.208566 Panthers shares at 0.635 GNOT per share. The `Bought` event records 3.942440 GNOT of cost and 0.057560 GNOT of fees, for 4.000000 test GNOT total.

[Buy receipt, block 432668](https://rpc.onyx.testnets.gno.land/tx?hash=0xA5F90CB7C145443E6C153913967161EF2043C4482FA0C275BC97CC6E29F4C3DA)

## Outcome and finality

| Market | Polygon payout numerators / denominator | Oracle proposal | Finalization |
| --- | --- | --- | --- |
| [Sabres vs. Maple Leafs](https://onyx.testnets.gno.land/r/nym-sixseven067/markets/v2:nhl-buf-tor-2026-10-15) | `[1, 0] / 1` (Sabres) | [Block 438180](https://rpc.onyx.testnets.gno.land/tx?hash=0x74E99F0EAC498DCD91734B04DF8919A9D10E4E1460D514FB0CE58C4C0911730E) | [Block 462396](https://rpc.onyx.testnets.gno.land/tx?hash=0xDE34C22E37EA1533C132856B6A26E4EEFB0D44BBC22796F18FD8EB165989291E) |
| [India vs. West Indies](https://onyx.testnets.gno.land/r/nym-sixseven067/markets/v2:crint-ind-wst-2026-10-17) | `[1, 1] / 2` (Void) | [Block 481503](https://rpc.onyx.testnets.gno.land/tx?hash=0xA3AAF8EC4DD4D374B38991CA4A04E171A670BC70F6F3E702492610CDF1FDDEE3) | [Block 508403](https://rpc.onyx.testnets.gno.land/tx?hash=0x000C099CFAB8A2C79E7907C1CB39ACC79EE974873FAE2305825CA2F5BA4A640F) |

Read the condition ID and evidence hash on each market page. For each market, the `OutcomeProposed` and `Finalized` events record the same evidence hash as gnoweb. PublicNode and dRPC independently returned the payouts above from the Polygon Conditional Tokens contract. The [oracle guide](ORACLE.md) explains how to verify a commitment against its canonical evidence record.

## Claims and refunds

The two finalized markets above show zero trades. The recorded purchase belongs to a separate market that was awaiting an outcome when checked.

To reproduce payout and refund behavior with funded positions:

```sh
cd contracts
gno test ./v2
```

The [Markets v2 tests](../contracts/v2/markets_test.gno) cover buying, proposing an outcome, finalizing and claiming. They also assert that a Void refunds the recorded cost and fee. The [collateral property test](../contracts/v2/threat_test.gno) checks every holder's payout across generated market scenarios.
