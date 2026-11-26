# Operating the 67 realm

Every step here writes to a chain. Run it only against a network you are allowed to change, with a key you control. The commands use [gnomcp](../docs/MCP.md) tool names; the equivalent `gnokey maketx` commands are printed by gnomcp after each call.

## Inputs

- `markets.seed.json`: the four markets bound to real Polymarket conditions: ID, topic, exact question, exact rules (Polymarket description), condition ID, ordered Yes/No token IDs, rules hash, closing time (Polymarket end date) and the opening 67 quote in parts per million. The rules hash is `SHA256(len(q) ":" q len(r) ":" r)` over UTF-8 bytes, identical in the realm, the gateway and `server/bindings.json`.
- `../contracts/markets.gno` and `../contracts/gnomod.toml`: the realm (module `gno.land/r/nym-sixseven067/markets`).

## Onyx testnet deployment

1. **Key.** `gno_key_generate {profile: "testnet"}` creates the operator key; `gno_faucet_fund` funds it (50 GNOT per address per day). Back up the key file from gnomcp's keystore (`~/.local/share/gnomcp/agent-keys/testnet/`) somewhere private. It controls the namespace, the administrator role and, below, the oracle.
2. **Namespace.** `gno_call {realm: "gno.land/r/sys/namereg/v0", func: "Register", args: ["nym-sixseven067"]}`. Registration is free on Onyx (checked 14 October 2026: price 0 ugnot, name not taken, format `nym-<5–13 letters><3 digits>`) and gives the key the `gno.land/r/nym-sixseven067/*` namespace.
3. **Deploy.** `gno_addpkg {deploy_path: "gno.land/r/nym-sixseven067/markets", files: [gnomod.toml, markets.gno, render.gno]}` (never the `_test.gno` files). The deployer becomes the administrator. Then the site: `gno_addpkg {deploy_path: "gno.land/r/nym-sixseven067/home", files: [home/gnomod.toml, home/home.gno]}`; it imports the markets realm, so it goes second. `GNOMCP=<path to gnomcp> node ops/deploy-realm.mjs <profile> <path> <dir>` sends exactly these files.
4. **Markets.** For each seed: `CreateMarket(id, question, rules, conditionId, yesTokenId, noTokenId, closesAt, openingYesPricePpm, oracle)`. The oracle is the operator address unless a separate oracle key is set up first; it is fixed per market forever.
5. **Collateral.** `Fund(id)` with `send: "<ugnot>"`. A fixed-quote market can sell at most until `max(yes, no shares) = collateral`; the ticket shows the remaining capacity per outcome. Funding is not withdrawable in this version.
6. **Check.** `gno_eval {path: realm, expr: "MarketsJSON()"}` and `gno_render {realm}`. Then open the app's Testnet venue.

## Updating the site on gno.land

`home` is private: redeploy it with `gno_addpkg` at the same path from the same key and the new version replaces the old one. `markets` is public and can never be replaced; a new version of it goes to a new path (`markets/v2`), and `home` then reads both.

## Running markets

- **Requote.** `SetQuote(id, yesPricePpm, expectedVersion)` publishes a new fixed quote. `expectedVersion` must equal the current `quoteVersion`, so a stale operator view cannot overwrite a newer quote. Buyers who reviewed the old price are refused by the contract.
- **Finalize.** When the source market is closed with exactly one winner, `node server/propose-resolution.mjs <conditionId>` prints the seven `FinalizeByOracle` arguments and an evidence hash. The oracle reviews them and calls `FinalizeByOracle(...)`. A price near 100% is not a result; the tool refuses until Polymarket reports a winner. Finalizing closes trading immediately.
- **Claims** are made by holders from Portfolio. Losing positions need no action.

## Listing more markets (`catalogue/`)

1. `node --experimental-strip-types ops/catalogue/select.ts --pool --count 120 --out ops/catalogue/pool.json` reads Polymarket's busiest events and checks each candidate against the CLOB API (question, rules hash, token order, midpoint) and Polygon (unsettled, through two RPCs). It leaves out short-lived series, war and violence, and anything the realm cannot hold.
2. Choose in `ops/catalogue/picks.json`: a condition-ID prefix or the exact question, the topic, a readable ID, and a closing time before the event where it is known.
   Add `--named` to also take markets whose two outcomes are named (a match: two teams). Only realm v2 can list those; `list.ts` (realm v1) skips them.
3. `select.ts --picks ops/catalogue/picks.json` writes `candidates.json`; `list.ts --profile testnet --oracle <oracle> --reserve 4000000` (add `--dry` first) lists each new one at its current midpoint, funds it, and appends it to `ops/markets.seed.json`, `server/bindings.json` and `src/live/catalog.json`.

## The listing robot (`robot/`)

For realm v2 only: quotes, renewals, pauses, results made final after the window, surplus to the treasury and new matches, run by Vercel Cron six times a day. What it may do, how its key is kept and the steps to switch it on are in [robot/README.md](robot/README.md).

## Handing over the administrator role

`ProposeAdministrator(next)` from the current administrator, then `AcceptAdministrator()` from `next` (for example the owner's Adena account through gnoweb's call form or `gnokey`). New markets then use the new administrator; each existing market keeps the oracle it was created with.

## Local chain for development

```sh
gnoland start --lazy --skip-failing-genesis-txs   # gno v1.5.0, chain ID "dev", RPC 127.0.0.1:26657
```

gnomcp's `local` profile signs with the dev chain's built-in `test1` key. Deploy with `deploy_path: "markets"` (expands to `gno.land/r/<test1>/markets`), seed the same markets, then run the full-stack browser test:

```sh
GNO_LOCAL_RPC=http://127.0.0.1:26657 \
GNO_LOCAL_REALM=gno.land/r/g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5/markets \
GNOMCP=/path/to/gnomcp npx playwright test e2e/local-chain.spec.ts
```

To point the running app at the local chain, set `localStorage['67.chain.override']` on `http://127.0.0.1` to a JSON chain config (see `src/live/config.ts`). The override is ignored on any other origin.
