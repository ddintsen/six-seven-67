# The listing robot (realm v2, v1's prices, and results)

Keeps 67 in step with Polymarket without anyone at the keyboard. One run reads realm v2, Polymarket and Polygon, then sends the few transactions that are due:

1. **Roles.** Accepts the quoter and lister roles when the administrator offers them to its address.
2. **Results.** Sends `Finalize` for every proposal whose 24-hour dispute window has passed (anyone may), and `Pause` for an open market whose result is final on Polygon or whose Polymarket price left the 0.03–0.97 band. The decisions come from `src/live/oracle.ts`, the same logic as the status page and the watcher.
3. **Prices.** `SetQuote` for every market that drifted a cent or more from Polymarket's midpoint (largest drift first, both sides inside the band, Yes + No at least 1 plus the minimum spread), and the same prices again for any quote older than 14 hours, so quotes never reach the realm's lifetime (set to 24 hours).
4. **Surplus.** `WithdrawSurplus` for final markets that hold more than they owe; the realm sends it to the market's treasury.
5. **Realm v1's prices** (from 15 October, owner: "да, передай роботу роль администратора v1"). v1 has one role, its administrator. When the operator proposes the robot (`ProposeAdministrator`), the robot accepts on its next run (`AcceptAdministrator`) and from then on sends v1's `SetQuote(id, price, version)` for every open market that drifted a point or more from Polymarket's midpoint (rounded to a tenth of a cent), and the brake quote (0.999999 or 0.000001) on a market whose result is final on Polygon, as the status page would. It never lists on v1. The trade-off the owner accepted: v1's administrator can also list markets with any oracle, so a stolen robot key could list a rigged v1 market until the role is handed back; testnet only.
6. **Results, from Polymarket's own resolution** (from 15 October, owner: "давай подписывать будет по результату оракула мы все повторяем за ними"). A second key, the robot-oracle (`ROBOT_ORACLE_MNEMONIC`, address in v2's listing terms as the oracle), sends `ProposeOutcome` for every v2 market listed with it as the oracle once Polymarket's resolution is recorded on Polygon and agreed by two RPCs (and Polymarket's API does not disagree): the same evidence the status page prepares (`src/live/oracle.ts`). The result is final after the 24-hour window, when the robot sends `Finalize`, unless the guardian cancels it. The robot keeps the robot-oracle's gas topped up (3 GNOT when it falls below 1). Markets listed before the switch keep the oracle they were listed with (the owner's account) and wait for it; the robot only pauses them when the result is in. The quoting key cannot be the oracle: the realm refuses an oracle that is the administrator, quoter or lister.
7. **Listing.** Up to two new markets per run, while fewer than 30 v2 markets are open and its balance covers the reserve: Polymarket's busiest events, filtered by the rules in `src/live/listing.ts` (topics, no war or violence, no side markets of a game, one market per event, price between 0.06 and 0.94, order book live, rules within the realm's limits, unsettled on Polygon through two RPCs). By default it lists **matches only**: markets with a fixed start time, closing ten minutes before kick-off, with the teams as named outcomes. Other markets stay hand-picked (`ops/catalogue`), because their event can happen before Polymarket's end date. Each new market is funded with 3 GNOT.

What it cannot do, by role: propose or change a result (the oracle does that in Adena), resume a paused market, change settings, limits or listing terms, list on other terms than the administrator fixed (oracle, treasury, fee), or move money anywhere except into a market it lists or from a final market to its treasury. The worst a stolen robot key can do is list markets on those terms with its own GNOT and move quotes until the administrator revokes it (`RevokeRole("quoter")`, `RevokeRole("lister")`, or `Pause("")` for everything).

## Where it runs

A Vercel Function on the site's existing project (Hobby plan, free): `scripts/prepare-deploy.mjs --robot` bundles `ops/robot/api.ts` into `api/robot.js` (about 1.3 MB) and adds six daily Vercel Cron jobs at 00:17, 04:17, 08:17, 12:17, 16:17 and 20:17 UTC (Hobby allows each job once a day, give or take an hour). Vercel sends the project's `CRON_SECRET` with each call; any other caller gets 401. The run report goes to the function log.

Environment variables (Production, encrypted):

| Variable | Value |
| --- | --- |
| `ROBOT_MNEMONIC` | The robot's key. Created by `ops/robot/keygen.ts` and piped straight into `vercel env add`; never written to a file or shown |
| `CRON_SECRET` | Random, created the same way |
| `ROBOT_REALM` | `gno.land/r/nym-sixseven067/markets/v2` |
| `ROBOT_RPC`, `ROBOT_V1_REALM`, `ROBOT_LIST_PER_RUN`, `ROBOT_MAX_OPEN`, `ROBOT_RESERVE_UGNOT`, `ROBOT_MIN_BALANCE_UGNOT`, `ROBOT_LIST_KINDS` | Optional; defaults: Onyx RPC, the v1 realm, 2, 30, 3000000, 15000000, `games` |

Cost: gas on Onyx is 0.001 ugnot per unit, so a quote costs about 0.005 GNOT; a listing about 0.2–0.8 GNOT of storage plus the 3 GNOT reserve, which comes back to the treasury after the market is final. The robot pays from its own balance; the owner tops it up with test GNOT.

## State (15 October, 08:15 Kyiv)

Live. Realm v2 on Onyx; the robot `g13wgyakt05a202ekc09vk8mgdg9g4gdp6upxuna` holds the quoter and lister roles and about 299 test GNOT; deployment 10 carries `api/robot.js` and the six cron jobs. Its first run (triggered with `vercel crons run`) accepted both roles and listed AC Milan to win on 15 October. Read its reports with `vercel logs --project six-seven-67 --json` (the run's summary is the function's info line).

## Running it by hand

`node --experimental-strip-types ops/robot/operator.ts [--dry] [--list 6]` runs the same logic with the operator key through gnomcp (the administrator may quote and list), for a batch of listings or while the robot has no GNOT.

## Going live (after "да, деплой" for realm v2)

1. Deploy `contracts/v2` (`gnomod.toml`, `markets.gno`, `json.gno`, `render.gno`) to `gno.land/r/nym-sixseven067/markets/v2` from the operator key with gnomcp's `gno_addpkg` (it sizes gas from a dry run: about 74 million; storage 7.27 GNOT).
2. From the operator key: `SetSettings(86400, 0, 200000000000)` (quotes live 24 hours), `SetListingTerms("g1hsxx0r86afsrwxkf38kqq5zursfrgjmp35fcvy", <treasury>, 40000)` (the owner's oracle, θ = 0.04).
3. On the owner's computer, in the deploy folder: `node keygen.mjs 2> robot-address.txt | vercel env add ROBOT_MNEMONIC production --sensitive` (keygen bundled from `ops/robot/keygen.ts`), the same for `CRON_SECRET` with random bytes, and `ROBOT_REALM`.
4. From the operator key: `ProposeRole("quoter", <robot>)`, `ProposeRole("lister", <robot>)`. The robot accepts on its first run.
5. Test GNOT to the robot's address (Adena or the faucet), 60–100 GNOT.
6. `VITE_GNO_REALM_V2=gno.land/r/nym-sixseven067/markets/v2 npm run build`, `node scripts/prepare-deploy.mjs --robot`, deploy, then trigger one run and read its report.

## Local check

On a local node with v2 deployed and the roles offered to a throwaway key:

```sh
ROBOT_MNEMONIC="<throwaway>" node --experimental-strip-types ops/robot/cli.ts --rpc http://127.0.0.1:26657 \
  --realm gno.land/r/nym-sixseven067/markets/v2 --v1 gno.land/r/nym-sixseven067/markets --list 2
```

`--dry` plans without sending; `--all` lists more than matches; `--renew-after <seconds>` forces renewals.
