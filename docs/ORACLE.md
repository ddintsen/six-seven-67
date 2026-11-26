# Unsigned Polymarket → Gno resolution proposal

The bridge prepares an **unsigned advisory proposal** for one explicitly registered Polymarket condition and Onyx target. It is not a signer, broadcaster, payout worker or chain proof verifier. The current registry is empty; fictional browser markets have no automatic connection to Polymarket or a deployed Gno market.

## Scenario contract and trust policy

Operator registry → explicit condition ID → fixed CLOB observation → exact core binding match → closed binary market with one boolean winner → seven business arguments and a reproducible evidence commitment. Any missing binding/target, contradictory result, changed rule or token mapping, malformed contract identifier or awaiting result produces an error. No signature, transaction or credit is created.

Every successful report states `policy: "trusted-polymarket-api"`, `settlementAllowed: false`, `finality: "not-proven"`, `deploymentVerification: "unverified"`, `oracleAuthorityVerification: "unverified"`, `unsigned: true` and `submission: "not-performed"`. The policy names the intended trusted API/oracle model; it does not prove external finality. A price at 100%, a proposed outcome or `closed` without a winner does not qualify.

## Operator-owned registration

`server/bindings.json` is the only CLI registry. A request, slug, displayed question or browser-local market ID cannot select or replace its target. Operators must compare source definition and target contract before registering a record. Registration itself is local configuration, **not evidence that a deployment exists or matches it**.

Each record contains:

| Field | Required invariant |
| --- | --- |
| `conditionId` | `0x` plus exactly 64 lowercase hex digits. |
| `rulesHash` | 64 lowercase hex digits; the existing byte-length-framed question/rules SHA-256. |
| `outcomes` | Two distinct literal labels, `Yes` and `No`, in the original CLOB order. |
| `tokenIds` | Two distinct strings in the exact corresponding outcome order; canonical decimal, at most 78 digits, no leading zero except the string `0`. |
| `gnoChainId` | Explicitly `onyx-1`. Mainnet and other chains are rejected in this scope. |
| `gnoRealm` | A `gno.land/r/` path, at most 256 bytes, valid lowercase Gno name segments; no test overlay, URL, query or traversal. |
| `gnoMarketId` | The exact contract market ID: nonempty valid UTF-8, at most 64 bytes. |
| `oracleAddress` | A valid checksummed 40-character `g1` address. |

The core parser is reused without alteration: `parseBoundResolution(raw, binding)` from `server/polymarket.mjs`. It checks condition, exact question/rules digest and ordered outcome/token mapping. The proposal also checks the contract's 1024-byte question and 20000-byte rules limits. If the CLOB's original pair is No/Yes, that order remains committed; business arguments select the token mapped to literal Yes first, then literal No. Labels are never guessed from a price or numeric index.

The registry copies and freezes all recognized core and target fields. Duplicate condition registrations and incomplete targets fail closed. The file is bounded to 1 MiB; the proposal registry accepts at most 1024 records. This is an operator configuration boundary, not user authentication or a production governance system.

## Run and output

```sh
node server/propose-resolution.mjs --help
node server/propose-resolution.mjs <explicit-0x-condition-id>
node --test server/resolution-proposal.test.mjs
```

The CLI reads the registry relative to its module location, selects the exact binding **before fetching**, and uses only `https://clob.polymarket.com/markets/<conditionId>` through the existing bounded `requestJson`. There is no configurable source URL, redirect following, signer key, wallet call or transaction-submission endpoint. Success prints JSON to stdout. Failure prints an explicit `proposal-not-created` JSON envelope to stderr and exits nonzero. With the empty delivered registry it fails `UNBOUND_MARKET` without an upstream call.

`businessCall` is a description of contract business arguments, **not a Gno wire transaction**. Its `FinalizeByOracle` arguments are seven strings:

```text
[gnoMarketId, conditionId, rulesHash, yesTokenId, noTokenId, winner, evidenceHash]
```

Gno's crossing `cur realm` context is not an eighth business argument. No coins, fees, signatures, account sequence or message serialization are prepared here. The contract independently requires the pinned immediate oracle caller, immutable source match, unfinalized state and collateral coverage. An authorized oracle can finalize an exact bound source winner before the planned trading deadline; finalization then closes trading atomically. The planned `ClosesAt` remains the Buy/Fund deadline, not a proposal veto. This bridge does not inspect a local deadline or call the contract.

## Evidence commitment

The canonical record commits to domain `six-seven.polymarket-resolution-proposal`, version `1`, policy, fixed source URL, full observed question/rules and source identity, ordered boolean token records, every recognized core/target binding field, literal winner and local UTC observation time. The time is a local observation timestamp; an upstream `observedAt` property is ignored. It does not represent a finalized block.

Canonicalization is recursively sorted-key JSON, preserving array order and original Unicode strings without normalization, encoded as UTF-8. The record contains only constructed bounded strings, booleans, arrays, objects and the fixed integer version. Its serialized size is limited to 128 KiB. `evidenceHash` is lowercase `SHA256(canonicalJson)`, without a prefix, and is the last business argument. The JSON report preserves both the canonical string and record so an operator can recompute the commitment. Ordinary registry metadata outside the recognized core/target fields is not committed.

This hash proves only that the report refers to those exact bytes. It is **not a Polygon or Gno chain proof, signed attestation, verified payout vector, finality certificate or authorization to settle**. Before a live finalization, independently verify the chosen chain/deployed realm and its actual market/oracle binding, trading/finalized state, collateral, external outcome/finality policy and signer authority. The bridge does not perform those checks and never changes `settlementAllowed` to true.

## Verification boundary

`node --test server/resolution-proposal.test.mjs` passed 12/12 controlled tests. They cover Yes/No proposals, exact seven arguments, No/Yes source order, unbound/duplicate records, invalid targets and tokens, immutable registry snapshots, misleading prices, awaiting/conflicting/malformed results, changed core identity, UTF-8 byte boundaries, canonical digest commitments and fixed CLI URL selection. They perform no live fetch, blockchain mutation or wallet signature. Production oracle operation, deployment verification, key custody, replay/reconciliation procedures and broadcast remain unimplemented.

Path grammar and limits were inspected in the pinned Gno 1.5.0 source (`gnovm/pkg/gnolang/mempackage.go`, `tm2/pkg/std/memfile.go`); contract argument validators were inspected in `contracts/markets.gno`. The existing [backend boundary](BACKEND.md) and [contract execution contract](../contracts/README.md) remain authoritative for their layers.
