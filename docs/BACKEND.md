# Read-only network gateway and resolution boundary

## Run

Requires the existing Node 24 runtime. No additional dependency, secret or private key is used.

```sh
node server/index.mjs
node --test server/gateway.test.mjs
```

The gateway binds **127.0.0.1:6757**. The frontend's same-origin `/api` proxy owns browser access; the gateway does not offer permissive CORS. It does not authenticate a user, sign, broadcast, trade, redeem or deploy. Adena owns account permission and wallet signatures; this service only reads public chain data.

## HTTP contract

| GET endpoint | Observable result |
| --- | --- |
| `/api/v1/network` | Observed Onyx status: expected/observed chain ID, height as a string, synchronization flag, observation time. Wrong chain or unavailable upstream fails explicitly. |
| `/api/v1/accounts/:address` | Checksummed `g1` address; validated BaseAccount with `coins`, `accountNumber` and `sequence` kept as strings. |
| `/api/v1/polymarket/markets/:conditionId` | Live binary CLOB source inspection: exact identity, question/rules digest, ordered token IDs/outcomes, explicit winner flags and advisory state. |
| `/api/v1/resolutions/:conditionId` | Same source observation checked against a registered immutable binding. Unbound source: HTTP409 `UNBOUND_MARKET`. |

Successful reads include `status: "available"` for Gno, or `state` for Polymarket. Failures use `{ "status": "unavailable", "error": { "code": "...", "message": "..." } }`; they never substitute demo balances or outcomes. Unknown paths are404; mutations405; invalid input400; upstream/schema errors502; timeout504. Client-selected upstream URLs, query parameters and redirects are rejected. Fixed production endpoints are Onyx RPC and Polymarket CLOB. A programmatically selected, fixed mainnet RPC is also supported for read-only use; CLI defaults to Onyx.

`server/bindings.json` is intentionally empty: existing fictional demo markets have **no real Polymarket condition binding**. Do not associate similarly worded markets automatically. The deployed Gno market must commit its condition ID, exact outcome/token order, question and rules before accepting any collateral. An operator-reviewed binding has this shape:

```json
{
  "conditionId": "0x<64 lowercase hex digits>",
  "outcomes": ["Yes", "No"],
  "tokenIds": ["<decimal Yes token ID>", "<decimal No token ID>"],
  "rulesHash": "<sha256 of UTF-8 byte-length-framed question and description>"
}
```

The digest uses the same frame as the Gno realm: `${UTF8ByteLength(question)}:${question}${UTF8ByteLength(description)}:${description}`, encoded as UTF-8, SHA256 lowercase hex. Lengths count UTF-8 bytes, not JavaScript UTF-16 characters. The sample describes a schema, not a configured market. Startup validates and copies every binding into frozen server-owned records. Altering outcome order, token identity, question/rules text or condition identity fails closed. A client cannot override those records through the API.

## Resolution policy

“Polymarket win means our win” applies to an **identical bound condition and outcome**, after a verified resolution. Polymarket's price and 100% display are not finality; `closed` alone is not a result. The parser requires an explicit binary token pair and exactly one boolean `winner` on a closed market before reporting `api-reported-outcome`. No winner is `awaiting-outcome`; open+winner or two winners is contradictory and rejected. Price is deliberately ignored.

Even an explicit CLOB winner remains **advisory**: every response has `trust: "polymarket-api-advisory"`, `settlementAllowed: false`; a bound response also has `finality: "not-proven"`. The gateway does not claim that an HTTPS response is a verified on-chain final result. It cannot authorize a Gno payment.

Gno realms execute deterministically and do not fetch Polymarket. The separate [unsigned proposal builder](ORACLE.md) implements the explicit `trusted-polymarket-api` policy: require an operator-owned exact condition/rules/token binding and Gno target, observe one boolean winner on a closed source, commit the entire observation, and prepare the seven `FinalizeByOracle` business arguments. Its evidence hash is a commitment, not a Polygon proof. No signer, broadcast, deployed authority or payout is verified. A configured oracle must sign the finalization, which the realm accepts once and immediately stops further trading, including an early source win. Collateral, positions and claims stay in the realm; the parser cannot credit them. This gateway has no signing key or transaction endpoint.

The current Polymarket Data API documents both `v1_ctf` and `polymarket-v2`, with `structural_condition_id`. A hard-coded legacy CTF call would not cover every current module. Even an `eth_call` to `payoutDenominator`/`payoutNumerators` is an RPC observation, not a proof a Gno realm verifies. No Polygon proof reader, light client, live signed relay or scheduled oracle worker is implemented here. Stronger cross-chain verification would require a separately specified finality and proof/attestation policy. The current proposal builder uses declared trust in Polymarket API and a pinned Gno oracle; it is not an independently verified bridge. Until the actual deployment and signer boundaries are configured and tested, API-reported results cannot settle live positions. Split/invalid payout vectors require explicit contract economics; they must not be silently treated as Yes or No.

## Network handling and security

Gno account requests use POST JSON-RPC `abci_query` with `auth/accounts/<checksummed-address>`. The account lives inside base64 `result.response.ResponseBase.Data`, not the top-level RPC result. Both top-level `error` and `ResponseBase.Error` are checked before decoding. Every account read verifies the observed RPC chain before querying account data. A decoded null account returns `ACCOUNT_NOT_FOUND` (HTTP404), with no fabricated zero account. Response identity, integer strings and bounded coin strings are validated; no Number conversion loses precision. RPC account observations have no independently verified state proof.

Upstreams have a5-second complete-response deadline,512KiB streaming cap and redirects disabled. The local service caps concurrent reads at8 and rejects foreign Host/Origin, mutation verbs and arbitrary query parameters. These are development boundaries, not a public production deployment with durable rate limits, authentication or audited financial infrastructure.

## Evidence

Scenario contract: public address → read → exact public chain strings; invalid address/chain/query → explicit failure without substitute data. Bound condition → source read → exact mapping plus advisory result; changed rules/order/identity or conflicting winner → reject; closed+100% without explicit winner → awaiting, settlement blocked. Tests cover these boundaries with controlled local HTTP upstreams, not live account mutations.

Live read-only probes on2026-10-10 around19:30UTC returned HTTP200: Onyx `onyx-1`, height309079, `catching_up:false`; mainnet `gnoland-1`, height709881, `catching_up:false`; CLOB sampling market returned an open explicit token pair. Heights are observations at that time, not current guarantees. No signed transaction, deployed contract or payout was verified by these probes.

## Official sources checked

- [Gno JSON-RPC endpoints](https://docs.gno.land/resources/rpc-endpoints/) — RPC/ABCI error nesting and base64 account data.
- [gnokey account queries](https://docs.gno.land/users/interact-with-gnokey/) — BaseAccount string fields and account query path.
- [Polymarket API documentation](https://docs.polymarket.com/llms-full.txt) — CLOB condition endpoint and token records.
- [Polymarket Data API migration](https://docs.polymarket.com/migrate/data-api-v1-to-v2) — module identity and structural condition mapping.
- [Node24 HTTP API](https://nodejs.org/docs/latest-v24.x/api/http.html) — local server timeouts and request handling.

Final live read-only smoke on2026-10-10T20:04:22Z (`npm run backend:smoke`) passed: Onyx onyx-1 height309641, matching documented address returned explicit404 ACCOUNT_NOT_FOUND, and live CLOB condition returned an open binary market with settlement blocked. These are dated observations, not present guarantees.
