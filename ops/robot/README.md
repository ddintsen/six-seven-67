# The listing robot (realm v2, v1's prices, and results)

Keeps 67 in step with Polymarket without anyone at the keyboard. One run reads realm v2, Polymarket and Polygon, then sends the few transactions that are due:

1. **Roles.** Accepts the quoter and lister roles when the administrator offers them to its address.
2. **Results.** Sends `Finalize` for every proposal whose 24-hour dispute window has passed (anyone may), and `Pause` for an open market whose result is final on Polygon or whose Polymarket price left the 0.03–0.97 band. The decisions come from `src/live/oracle.ts`, the same logic as the status page and the watcher.
3. **Prices.** `SetQuote` for every market that drifted a cent or more from Polymarket's midpoint (largest drift first, both sides inside the band, Yes + No at least 1 plus the minimum spread), and the same prices again for any quote older than six hours: with runs four hours apart (the Hobby plan fires within the hour), no quote gets older than about eleven hours, well inside the realm's lifetime of 24.
4. **Surplus.** `WithdrawSurplus` for final markets that hold more than they owe, at most six per run; the realm sends it to the market's treasury. Until 27 November 2026 this never ran: `Surplus()` returns two int64 values and was read with a parser for strings, whose refusal was swallowed.
5. **Realm v1's prices** (from 15 October, owner: "да, передай роботу роль администратора v1"). v1 has one role, its administrator. When the operator proposes the robot (`ProposeAdministrator`), the robot accepts on its next run (`AcceptAdministrator`) and from then on sends v1's `SetQuote(id, price, version)` for every open market that drifted a point or more from Polymarket's midpoint (rounded to a tenth of a cent), and the brake quote (0.999999 or 0.000001) on a market whose result is final on Polygon, as the status page would. It never lists on v1. The trade-off the owner accepted: v1's administrator can also list markets with any oracle, so a stolen robot key could list a rigged v1 market until the role is handed back; testnet only.
6. **Results, from Polymarket's own resolution** (from 15 October, owner: "давай подписывать будет по результату оракула мы все повторяем за ними"). A second key, the robot-oracle (`ROBOT_ORACLE_MNEMONIC`, address in v2's listing terms as the oracle), sends `ProposeOutcome` for every v2 market listed with it as the oracle once Polymarket's resolution is recorded on Polygon and agreed by two RPCs (and Polymarket's API does not disagree): the same evidence the status page prepares (`src/live/oracle.ts`). The result is final after the 24-hour window, when the robot sends `Finalize`, unless the guardian cancels it. The robot keeps the robot-oracle's gas topped up (3 GNOT when it falls below 1). Markets listed before the switch keep the oracle they were listed with (the owner's account) and wait for it; the robot only pauses them when the result is in. The quoting key cannot be the oracle: the realm refuses an oracle that is the administrator, quoter or lister.
7. **Listing.** At most six v2 markets trade at once, two new ones per run. Candidates are Polymarket's busiest events plus the events that end around the listing window, filtered by the rules in `src/live/listing.ts` (topics, no war or violence, no side markets of a game, one market per event, price between 0.06 and 0.94, order book live, rules within the realm's limits, unsettled on Polygon through two RPCs). By default it lists **matches only**: markets with a fixed start time, closing ten minutes before kick-off, with the teams as named outcomes. Other markets stay hand-picked (`ops/catalogue`), because their event can happen before Polymarket's end date. **Window** (Gnome Tavern judging, 18–21 December 2026): matches whose trading ends from 21 December 00:00 UTC to 23 December 00:00 UTC are listed as soon as Polymarket has them, the most traded first, up to four, each with an 8 GNOT reserve so several buyers can take a position. **Before the window**, one near-term match that trades at least two days is kept open with a 3 GNOT reserve, so v2 always has a live market. After the window it lists nothing until a new one is set (`ROBOT_WINDOW_FROM`, `ROBOT_WINDOW_TO`).

What it cannot do, by role: propose or change a result (the oracle does that in Adena), resume a paused market, change settings, limits or listing terms, list on other terms than the administrator fixed (oracle, treasury, fee), or move money anywhere except into a market it lists or from a final market to its treasury. The worst a stolen robot key can do is list markets on those terms with its own GNOT and move quotes until the administrator revokes it (`RevokeRole("quoter")`, `RevokeRole("lister")`, or `Pause("")` for everything).

## Money (from 27 November 2026)

The robot ran dry on 23 October with 0.03 test GNOT: every listing locked a 3 GNOT reserve that goes back to the treasury, not to the robot (64 listings in six days); fixed gas allowances overpaid every call four to five times (a quote paid for 25 million gas and used about 5.5 million, 0.0375 GNOT); and up to 31 v1 quotes per run used up the call budget, so nothing else ran. Now:

- **Gas from a simulation.** Each transaction is simulated first and sent with the gas it used plus a fifth and 0.5 million; a quote costs about 0.011 GNOT. A call the realm would refuse fails in the simulation and is not sent, so it costs nothing (`ops/robot/signer.ts`).
- **Order by obligation.** Results, then v2 quotes and renewals, then funding and listing, then v1 quotes (from two points of drift, at most eight per run, brakes first) and surplus (at most six per run).
- **A floor.** Listing never takes the balance below 8 GNOT, kept for quotes and results; v1 quotes and surplus wait while the balance is under it. A near-term listing also leaves what the window's remaining listings need (8 + 1.5 GNOT each).
- **Budget to 21 December**: four window markets 38 GNOT, near-term matches about 4.5 GNOT each (about six), quotes and v1 about 10 GNOT, floor 8 GNOT: **100 test GNOT** covers it. Reserves come back to the treasury (the operator) once each market is final.
- Making the robot its own treasury (`SetListingTerms` from the administrator) would return each reserve to it and keep it funded; that needs the operator's key.

## Where it runs

A Vercel Function on the site's existing project (Hobby plan, free): `scripts/prepare-deploy.mjs --robot` bundles `ops/robot/api.ts` into `api/robot.js` (about 1.3 MB) and adds six daily Vercel Cron jobs at 00:17, 04:17, 08:17, 12:17, 16:17 and 20:17 UTC (Hobby allows each job once a day, give or take an hour). Vercel sends the project's `CRON_SECRET` with each call; any other caller gets 401. The run report goes to the function log.

Environment variables (Production, encrypted):

| Variable | Value |
| --- | --- |
| `ROBOT_MNEMONIC` | The robot's key. Created by `ops/robot/keygen.ts` and piped straight into `vercel env add`; never written to a file or shown |
| `CRON_SECRET` | Random, created the same way |
| `ROBOT_REALM` | `gno.land/r/nym-sixseven067/markets/v2` |
| `ROBOT_RPC`, `ROBOT_V1_REALM`, `ROBOT_LIST_PER_RUN`, `ROBOT_MAX_OPEN`, `ROBOT_RESERVE_UGNOT`, `ROBOT_MIN_BALANCE_UGNOT`, `ROBOT_LIST_KINDS`, `ROBOT_LIVE_MAX` | Optional; defaults (`ops/robot/settings.ts`): Onyx RPC, the v1 realm, 2, 6, 3000000, 8000000, `games`, 1 |
| `ROBOT_WINDOW_FROM`, `ROBOT_WINDOW_TO`, `ROBOT_WINDOW_MAX`, `ROBOT_WINDOW_RESERVE_UGNOT`, `ROBOT_WINDOW` | Optional; the listing window: 2026-12-21T00:00Z, 2026-12-23T00:00Z, 4, 8000000; `off` disables it |

Cost: gas on Onyx is 0.001 ugnot per unit, so a quote costs about 0.005 GNOT; a listing about 0.2–0.8 GNOT of storage plus the 3 GNOT reserve, which comes back to the treasury after the market is final. The robot pays from its own balance; the owner tops it up with test GNOT.

## State (27 November 2026)

The robot holds 0.0313 test GNOT and sends nothing until the owner tops it up (faucet or Adena, 100 test GNOT to `g13wgyakt05a202ekc09vk8mgdg9g4gdp6upxuna`). The robot-oracle holds 2.82 GNOT. `mlb-tb-cle-2026-10-16` waits for a person: Polymarket moved the game to 17 October and rewrote its rules, so the binding check (rules hash) stops the robot-oracle from proposing. Dry run with a 100 GNOT balance (`cli.ts --dry --as <robot> --balance 100000000`): lists Seahawks vs. 49ers (29 November) as the near-term match, brakes two settled v1 markets, requotes the six largest v1 drifts, withdraws six surpluses.

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
