# 67 (Six Seven)

A prediction exchange on Gno.land. Pick a question, buy Yes or No with test GNOT, and claim a payout on Onyx once the market resolves.

[Open markets](https://the67.click/#/markets) · [Watch the 52-second walkthrough](https://dintsen.agency/assets/videos/six-seven-67/walkthrough.mp4) · [Explore on Gno.land](https://onyx.testnets.gno.land/r/nym-sixseven067/home)

[![67 walkthrough showing a live Onyx market, Yes and No prices, and a comparison chart](docs/media/67-walkthrough.png)](https://dintsen.agency/assets/videos/six-seven-67/walkthrough.mp4)

## How it works

A market fixes its question, rules, and outcome binding in Gno. The app shows 67's own quotes alongside Polymarket reference prices. Adena signs the testnet purchase, and the Gno realm verifies the reviewed quote, exact payment, and available collateral. After the designated oracle resolves the market, a winning share pays one test GNOT.

The markets are independent positions on Gno.land. Polymarket supplies reference prices and market metadata. Resolution relies on a designated oracle and an evidence commitment, as described in the [contract documentation](contracts/README.md).

## Onyx deployment

| Realm | Source | Deployment |
| --- | --- | --- |
| Markets v1 | [contracts](contracts) | [Markets on Onyx](https://onyx.testnets.gno.land/r/nym-sixseven067/markets) |
| Markets v2 | [contracts/v2](contracts/v2) | [Markets v2 on Onyx](https://onyx.testnets.gno.land/r/nym-sixseven067/markets/v2) |
| Gnoweb home | [contracts/home](contracts/home) | [67 on Onyx](https://onyx.testnets.gno.land/r/nym-sixseven067/home) |

[Verify Onyx receipts](docs/ONYX-EVIDENCE.md) for an executed purchase, oracle finality, and a voided market.

The frontend reads both market realms. V2 adds expiring two-sided quotes, per-market limits, a resolution dispute window, and refunds for void markets.

## Run

Node.js 22 or 24 and npm:

```sh
npm ci
npm run dev        # http://127.0.0.1:6767
```

Routes: `#/` (home), `#/how` (how it works, with a purchase calculator), `#/contract` (every realm function and its refusals), `#/markets`, `#/market/<id>`, `#/polymarket/<condition ID>` (a Polymarket market not on 67, read-only), `#/portfolio`, `#/status` (the operator's page). Search and topic filters live in the Markets hash query.

The home page shows a balance in a night voxel forest (three.js, loaded lazily after first paint). Its glass cubes split by the live Yes price, the beam tilts toward the dearer side and each pile's glow follows its price. Devices without a GPU or WebGL keep a still of the same forest (`public/forest-night.webp`); reduced motion draws one still frame; the price is always text. Design direction: [docs/design/DIRECTION.md](docs/design/DIRECTION.md) (V6: dark glass, cube mark).

Production build and preview:

```sh
npm run build
npm run preview -- --strictPort
```

Testnet trading needs the page on an `http(s)` origin with the Adena extension. `67.html` (see Packaging) opens directly from disk for review and reads the public Onyx RPC, indexer and Polymarket, but browser extensions usually do not inject into `file:` pages.

## Testnet trading

1. Connect Adena. If Adena is on another network, the ticket offers **Switch to Onyx testnet** (Adena may ask to add it first).
2. Get test GNOT from the [faucet](https://faucet.gno.land) if needed.
3. Choose an outcome (Yes or No, or a team in a match market), enter an amount in GNOT and review. The review shows exact shares, the exact ugnot you pay, the payout if you win and the contract path.
4. Confirm in Adena. The trade counts as confirmed only when the contract shows the new position; an answer that never lands becomes **Result not confirmed yet** with **Check again**, never a silent retry.
5. When the oracle finalizes a market, winning positions show **Claim** in Portfolio.

The contract refuses a purchase whose price differs from the review, whose payment is not exact, or that the market's collateral cannot cover. The interface explains each refusal and asks for a new review.

## Backend and contracts

- [Gno realm](contracts/README.md): collateral, fixed versioned quotes, positions, oracle finalization, claims, events and JSON projections.
- [Operations](ops/README.md): namespace registration, deployment, market seeding, funding, administrator handover and oracle finalization.
- [Gateway](docs/BACKEND.md): optional local read-only service for Onyx accounts and Polymarket source inspection. The browser app reads the chain directly and does not need it.
- [Oracle proposals](docs/ORACLE.md): unsigned resolution proposals for the four bound markets in `server/bindings.json`.
- [Gno MCP](docs/MCP.md): pinned gnomcp 0.12.0 used for deployment and chain checks.

## Checks

```sh
npm run typecheck
npm test                      # Adena, chain layer, Polymarket readers, oracle, gateway, proposals
npm run build
npm run qa:e2e                # browser suites on a controlled testnet (mock Onyx, Adena, Polymarket, Polygon)
(cd contracts && gno test . && gno test ./v2 && gno test ./home)  # see contracts/README.md
```

`e2e/local-chain.spec.ts` runs the real purchase path against a local gnoland node when `GNO_LOCAL_RPC`, `GNO_LOCAL_REALM` and `GNOMCP` are set; it is skipped otherwise. Evidence and remaining gaps are in [QA.md](QA.md).

## Packaging

```sh
STANDALONE=1 npx vite build              # one bundle, the 3D scene inlined
node scripts/package-standalone.mjs      # writes ../67.html and ../67-source.zip
node scripts/verify-standalone.mjs       # opens ../67.html: live markets, the mirror, a market page
```

## Stack

React 19.3, TypeScript 7.0, Vite 8.3, plain CSS, npm. Playwright 1.64 and axe-core for browser checks; Node's test runner for unit tests. No wallet SDK, UI kit or animation runtime: Adena is used through its injected provider and the chain through public JSON-RPC. Handjet, IBM Plex Sans and IBM Plex Mono are self-hosted under SIL OFL 1.1 ([Handjet](public/fonts/Handjet-OFL.txt), [IBM Plex Sans](public/fonts/IBMPlexSans-OFL.txt), [IBM Plex Mono](public/fonts/IBMPlexMono-OFL.txt)).

See [architecture](docs/ARCHITECTURE.md), [scenarios](docs/SCENARIOS.md), [direction](docs/design/DIRECTION.md) and [references](docs/design/REFERENCES.md).
