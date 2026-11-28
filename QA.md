# Verification record

Date: 2026-10-12, newest sections 2026-11-27 (Claude sessions). The commands table directly below is the 12 October baseline; each dated section after it records its own round. Scope: V6 (dark glass palette, cube mark, split header and menu sheet, night forest hero, How it works and Contract pages) on top of the V5 exchange, realm and chain layer. Earlier records (Codex, 2026-10-10/11) are in the previous source archive (`_to_delete/previews-v4/67-source.zip`).

Environment: Linux x64 cloud workspace; Node 22.22; npm 10.9; Playwright 1.64 with Chromium 1194 (SwiftShader software GL); gno, gnoland and gnokey v1.5.0; gnomcp 0.12.0.

## Commands and results

| Check | Observed result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test` | 64 tests passed: engine, Adena provider and call results, chain layer (Go-string decoding, market validation, qeval errors, quote arithmetic, capacity, GNOT parsing, indexer events, refusal mapping), gateway, resolution proposals. |
| `npm run build` | Passed. Main bundle 378 KB (111 KB gzip), CSS 45 KB (9.5 KB gzip); forest scene chunk 546 KB (137 KB gzip), loaded only on the home page; still picture `forest-night.webp` 54 KB. |
| `npm run qa:e2e` | 56 passed, 1 skipped (the local-chain spec without its environment). Practice suite, controlled-testnet suite (undeployed contract, markets from the realm, purchase confirmed from contract state, wrong network and switch, rejection, collateral refusal, quote change after review, broadcast that never lands with reconcile, claim, phone trade bar, home price and switching, home without WebGL on a phone) and the new site suite (calculator arithmetic, contract page deployed and undeployed, phone menu sheet, split desktop header). |
| `e2e/local-chain.spec.ts` against a local gnoland node | Passed: Adena stand-in broadcasting real transactions through gnomcp (test1 key), purchase of 2 No shares for 0.42 GNOT, confirmation from `PositionsJSON`, portfolio row. |
| `gno test` in `contracts/` | 22/22 test groups passed; `gno fmt` and `gno lint` clean. |
| Local chain, gnomcp | Realm deployed; four Polymarket-bound markets created and funded with 8 GNOT each; `SetQuote` twice; purchases on both sides; a purchase at a stale price refused in simulation with `price does not match review`. |
| Standalone | `STANDALONE=1` build, `scripts/package-standalone.mjs` produced `67.html` (1.17 MB, 3D and still picture inlined) and `67-source.zip` (100 files, archive folders excluded); `scripts/verify-standalone.mjs` passed at 1440 and 390: default Testnet venue reads only the Onyx RPC and indexer, practice purchase and reload persistence, no local file requests, no horizontal overflow. |
| axe-core (WCAG 2.0/2.1/2.2 A and AA tags) | No violations on home, markets, market, portfolio, how it works and contract, both venues, at 390 and 1440 (the scrollable code excerpt was made keyboard-focusable after the first run flagged it). |
| Contrast on the real colours | Every text pair at least 4.5:1: ink on ground 16.5, muted on ground 7.7 and on hover 5.8, Yes on its tint 8.6, No on its tint 7.4, white on selected Yes 5.2 and No 6.4, ground on flint 16.5, caution 9.3, alert 7.2, code comments 4.6. Menu notes were moved from the quiet tone (4.4) to muted. |

## A reviewed proposal: Rays vs. Guardians (November 28, 2026, 01:10 UTC, Windows device)

| Check | Observed result |
| --- | --- |
| The frozen rules of `mlb-tb-cle-2026-10-16` | "If the game is postponed, this market will remain open until the game has been completed": the game Polymarket moved to 17 October is covered. Polygon (two RPCs) says Rays (Yes) |
| `npm run typecheck`, `npm test` | Passed; 88 tests, two new: a reviewed market proposes the frozen binding only when Polygon agrees, and `ROBOT_ORACLE_REVIEWED` parses strictly |
| CI on `dfb7603` (main) | Gno realms and web app passed |
| Deployment 16 | `dpl_E9ShnMkKohoQEUqwiUw9wYCfqzqU`, aliased to https://the67.click, with `ROBOT_ORACLE_REVIEWED=mlb-tb-cle-2026-10-16:Yes` (Production) |
| Robot run (`vercel crons run "/api/robot?slot=4"`, 01:09:16 UTC) | The robot oracle sent `ProposeOutcome(mlb-tb-cle-2026-10-16, Yes)`, block 1,463,757, tx `0x2FAE9B15139383DEBEF2E777E494104F52EF7FE5871A50AEDCCEF32166C84A6E`, evidence `94d5cf0e971359c3c2e4dec485da071c0170fd1637136b5d79877e4855aea674`, final from 2026-11-29 01:09:17 UTC; Gnoweb shows "Proposed result" |

## The simulation fix and the first funded run (November 27, 2026, 20:30 UTC, Windows device)

Environment: Windows 11; Node 24.18; Vercel CLI 54.18.1; live Onyx (`onyx-1`) at height about 1,459,000.

| Check | Observed result |
| --- | --- |
| Why deployment 14 sent nothing | tm2-js-client 3.3.0's `estimateGas` base64-encodes the transaction twice, so Onyx answers `unknown field number 8 for Tx` (TxDecodeError) to every simulation, and the robot took that for a refusal |
| `simulateGas` against Onyx (a `WithdrawSurplus` probe signed by the public gnodev `test1` key; simulation only) | `estimateGas`: `unknown field number 8 for Tx`. `simulateGas`: 5,766,192 gas |
| `npm run typecheck`, `npm test` | Passed; 86 tests, two of them new for the simulation |
| Robot dry runs as the robot with 31,300 ugnot, `--now` 28 November 00:17 and 04:17 UTC | 00:17: nothing sent (below the floor). 04:17: one step, `Finalize` on `nfl-car-phi-2026-10-18` |
| Deployment 15 | `dpl_H3UX7pPE5nstCav2663k91cqXD7M`, production, aliased to https://the67.click and www; serves `index-Dl_KT3Gi.js` (the app is unchanged); `/api/robot` answers 401 without the secret |
| Robot run triggered on production (`vercel crons run "/api/robot?slot=4"`, 20:29:56 UTC) | The robot held 299.72 test GNOT, topped up before the run. 14 transactions in blocks 1,458,988–1,459,001, all successful: 8 v1 `SetQuote` (two brakes on settled markets; Bitcoin vs. gold from 0.41 to 0.125) and 6 v2 `WithdrawSurplus`. Gas used 5.8–9.0M against 7.4–11.3M wanted. No listing: no match fits the window or the near-term slot yet |

Not verified yet: a purchase on a fresh v2 market, the window's listings (Polymarket lists the 20–21 December games around 8–15 December), Panthers `Finalize` (due from 28 November 03:51:17 UTC); Safari, Firefox, real phones, a screen reader.

## The robot back, v1 read only, a live lead (November 27, 2026, Windows device)

Environment: Windows 11; Node 24.18; Playwright 1.64 with local Chrome; Vercel CLI 54.18.1; live Onyx (`onyx-1`) at height about 1,449,000.

| Check | Observed result |
| --- | --- |
| Why the robot stopped (on chain) | The robot `g13wgy…xuna` held 31,300 ugnot. One quote as it was sent cost 37,500 (25M gas wanted at 0.001 ugnot × 1.5), so every call failed at check_tx. Robot-oracle: 2,815,600 ugnot. Operator: 121,947,488 ugnot |
| Why the money went (indexer) | 789 robot transactions: 458 v1 `SetQuote`, 140 v2 `SetQuote`, 64 `CreateMarket`, 64 `Fund` (3 GNOT each), 60 `Finalize`, no `WithdrawSurplus`. Gas used 4.4–8.9M per call against 20–80M paid for. Realm v2 holds 219 GNOT, mostly withdrawable reserves |
| Vercel | 6 cron jobs and 4 encrypted variables in place; last production deploy 42 days old; no runtime logs kept that far back (Hobby) |
| `mlb-tb-cle-2026-10-16` | Polygon settled (two RPCs agree); Polymarket rescheduled the game to 17 October and rewrote the rules, so the rules hash differs from the realm's binding and the robot-oracle rightly holds it for a person |
| `npm run typecheck`; strict `tsc` of `ops/robot/*` | Passed |
| `npm test` | 84 passed, 10 of them the robot's: gas sizing, window and near-term picks, slots, the window's commitment, v1 order, settings, surplus parsing |
| `npx playwright test` (local Chrome, three workers, local-chain test excluded) | 54 passed in 2.0 min. Two of them are new for v2: the lead is a v2 market with a live quote, v1 sits under "Earlier contract" with "Read only" rows and a v1 page has no trade form or bar (with axe, no violations); with no v2 market open, Markets and Home say so and feature nothing. Three tests were brought up to date: the site test follows the working copy’s new diagram title, and two v2 tests find the only open v2 market in the lead |
| Robot dry run on live Onyx as the robot, with a 100 GNOT balance | Lists Seahawks vs. 49ers (29 November) as the near-term match with 3 GNOT, brakes two settled v1 markets, requotes the six largest v1 drifts (22 more capped), withdraws six surpluses; no errors |
| The bundled function (`api/robot.js`, 1.36 MB) | 401 without the secret, 503 without the key |
| Screenshots of the production build, local | 320, 390, 820 and 1440 px: Markets on live data (nothing open, the earlier contract), a v1 market, Panthers (proposed), Home; on the mock, a fresh v2 match in the lead, its page and Home; reduced motion at 390. No console errors, no horizontal overflow (`.qa/shots-1127/out/`, in the build clone) |
| Deployment 14 | `dpl_HWWR1kVn6wRrZ7hWn7unnGLMVmnt`, aliased to https://the67.click; serves `index-Dl_KT3Gi.js`; `/api/robot` answers 401 without the secret; `www` redirects with 308; 6 cron jobs |
| Robot run triggered on production (`vercel crons run "/api/robot?slot=4"`, 14:40 UTC) | 200 from deployment 14; balance 31,300 ugnot; nothing sent; listing skipped ("a live listing needs 50,500,000"), v1 quotes and surplus skipped below the 8 GNOT floor; no errors |
| Live site at 320, 390, 820 and 1440 px, and reduced motion | No console errors, no horizontal overflow (`.qa/shots-1127/live-site/`) |

Not verified yet: a funded robot run (the simulation path sending real transactions), a purchase on a fresh v2 market, the window's listings (Polymarket lists the 20–21 December games around 8–15 December), Panthers `Finalize` (due from 28 November 03:51:17 UTC); Safari, Firefox, real phones, a screen reader.

## Sign all, and the robot-oracle's first night (October 16, 09:00 Kyiv)

| Check | Observed result |
| --- | --- |
| Robot-oracle, live | Four matches listed with it were proposed by itself at 04:41 UTC (three No, one Yes), each as Polygon settled it; its balance went from 3.00 to 2.77 GNOT |
| Owner-oracle matches | Nine settled on Polygon (read with the project's `readAgreedSettlement`), still waiting for the owner |
| Sign all | `e2e/status.spec.ts` "the oracle signs every settled result with one signature": one button sends both `FinalizeByOracle` calls, both markets final, the section disappears. Screens at 390 and 1440 on the stand-in (`.qa/signall-1016/`), looked at |
| Suites | `npm test` 76 passed; e2e 52 passed, 1 skipped |
| Not deployed | Waits for the owner's "выкладывай" |

## The robot-oracle on Onyx (October 15, 18:55 Kyiv)

| Check | Observed result |
| --- | --- |
| Listing terms | `SetListingTerms` simulated, then sent (height 424090); `RealmJSON` shows the robot-oracle as the listing oracle |
| Deployment 12 | Aliased to the67.click; the app build is unchanged (`index-DYhAZWfR.js`); `/api/robot` answers 401 without the cron secret |
| First run | Triggered by hand: the robot-oracle's balance went from 0 to 3000000ugnot; two new matches were listed with it as the oracle (15 in v2) |
| Not verified yet | A live proposal: the first robot-oracle matches settle after tonight's games; the earlier matches keep the owner's oracle |

## The robot-oracle on a local node (October 15, 18:15 Kyiv)

| Check | Observed result |
| --- | --- |
| Setup | A local gnoland 1.5 node with realm v2; a market bound to a resolved Polymarket market (a tennis set handicap, settled No on Polygon) with exact question, rules and tokens from the CLOB, its oracle a throwaway robot-oracle key |
| Propose | `ops/robot/cli.ts` with the robot-oracle: one step, `ProposeOutcome` No; the realm shows the market proposed with outcome No |
| Other oracle | A second market bound to the same result with another oracle: the robot did not propose, it paused the market |
| Repeat run | The proposed market was not touched again |
| Gas | A robot-oracle with no GNOT: the robot sent it 3 GNOT (bank balance 3000000ugnot) |
| Unit and types | `npm test` 76 passed; the robot's sources typecheck strictly |
| Production | The robot-oracle's key was generated on the owner's computer and piped straight into Vercel (`ROBOT_ORACLE_MNEMONIC`, sensitive); nothing else changed on Onyx or Vercel: setting it in v2's listing terms was stopped by this session's safety check |

## Deployment 11 and the robot on v1 (October 15, 17:45 Kyiv)

| Check | Observed result |
| --- | --- |
| Robot, before | `npm test`: 76 unit tests (2 new for the robot's prices); a dry run with the operator key (then v1's administrator) planned seven v1 requotes and three v2 requotes, no errors |
| Deploy | Deployment 11 built with realm v2 and the robot (`api/robot.js` carries `AcceptAdministrator`), aliased to the67.click |
| Role handover | `ProposeAdministrator(g13wg…xuna)` on v1, simulated then sent (height 422911); after the triggered robot run, v1's `Administrator()` is the robot and `PendingAdministrator()` is empty |
| Robot run | Seven v1 markets requoted within minutes (Apple, Montana 01, Le Pen, Taiwan KMT, Fed upper bound, Oscars, Ballon d'Or), four v2 matches requoted, two matches listed (thirteen in v2); no v1 market five points or more from Polymarket |
| Production | https://the67.click at 320, 390, 820 and 1440: a v1 market, a v2 match, Bitcoin vs. gold and the list show the new line ("Updated 5 min ago, in line with Polymarket."); no horizontal overflow, no console errors. Screenshots in `.qa/live-1015/`, looked at |
| Not verified | The robot's function log (this session's Vercel connector has no access to the team; the run is checked on chain) |

## v1 prices and the portfolio after a last claim (October 15, 17:30 Kyiv)

| Check | Observed result |
| --- | --- |
| v1 requotes | Eight `SetQuote` calls from the operator key through gnomcp (owner: "да все сделай"), each simulated first, all included in blocks; a fresh drift read afterwards: no v1 market two points or more from Polymarket; four within 1.5 to 2 points |
| `npm run typecheck`, `npm test` | Passed; 74 unit tests |
| e2e (`pw.container.config.ts`) | 51 passed, 1 skipped (local chain), no failures; `v2.spec.ts` now checks the lasting claim notice and "Nothing open right now" after the last v2 claim |
| Screens | The returning portfolio state on the stand-in at 390 and 1440 (`.qa/freshness-1015/portfolio-*.png`): the claim notice, Positions 0, "Nothing open right now" with one action. Looked at |
| Not done | The production deploy and handing v1's administrator role to the robot: this session's safety check stopped both and asked for the owner's explicit words |

## How fresh a price is (October 15, 16:30 Kyiv)

| Check | Observed result |
| --- | --- |
| `npm run typecheck`, `npm test` | Passed; 74 unit tests (3 new: the sentence and the midpoint parser) |
| e2e (`pw.container.config.ts`) | 50 passed, 1 skipped (local chain), 1 failed once: `v2.spec.ts` "paused, expired, proposed and void markets…" did not see "Claimed." in time under parallel workers and passed on rerun with the whole v2 file (4/4); the claim does not render the new line. `e2e/freshness.spec.ts`: 4 passed, axe without violations on the market page |
| Live data | A build with realm v2 against Onyx and Polymarket, at 320, 390, 820 and 1440: Taiwan KMT "Updated 11 h ago. Polymarket is at 71% now."; Bitcoin vs. gold and the list's lead "Updated 15 h ago, in line with Polymarket."; Leverkusen (v2, requoted by the robot minutes before) "Updated 4 min ago, in line with Polymarket." No horizontal overflow, no console errors. Screenshots in `.qa/freshness-1015/`, looked at: the sentence sits in the price block's text column without moving the chart, the ticket or the list |
| Robot | Its 12:17 UTC run came at about 12:55 UTC (Hobby crons run within the hour): four v2 requotes and two new matches listed (Utah vs. Edmonton, Brewers vs. Dodgers); 11 v2 markets |
| Not verified | Safari, Firefox and real phones |

## Live audit before inviting people (October 15, 15:00 Kyiv)

The owner asked for a check that everything works before people arrive ("проверь все ли у нас нормально работает ссделайй аудит а то перееживай сейчас люди пойдут а у нас ошибки"). Everything below ran against production (https://the67.click, deployment 10) and Onyx; nothing was deployed or signed. Evidence and scripts: `.qa/audit-1015/`.

| Check | Observed result |
| --- | --- |
| Every route on the67.click | 97 page loads (70 at 1440, 27 at 390): home, markets and every topic, all 52 market pages (43 v1, 9 v2), three Polymarket mirror pages, how it works, contract, status, portfolio, an unknown route. No console errors, no failed API requests, no horizontal overflow, one h1 each. Six loads timed out on navigation in this workspace's proxy and loaded normally on retry; median load about 7 s here |
| Screens | Contact sheets at 1440 and 390 looked at: home, markets, a v2 match (AC Milan), status (its "Needs attention" list shows the drifted v1 quotes below), portfolio without a wallet, Sports, the not-found page. All render with live prices, pictures and charts |
| Purchases, simulated | gnomcp `gno_call` with `simulate: true` (no transaction): the app's exact `Buy` calls succeed on v2 (Yes and No, fee included in the send) and v1; a `Buy` at a stale reviewed price is refused by the contract |
| Robot | `ops/robot/operator.ts --dry`: it reads both realms, would list the new matches (Leverkusen, Ajax) and renew the v2 quotes that age past 14 hours (24-hour lifetime); the v2 quotes were 3.8 to 7.2 hours old. Next run 12:17 UTC |
| Market times | No market is past its close without a result. Closing within 48 hours: three UEL/Eredivisie matches (about 4.5 hours), Sabres vs. Maple Leafs (about 11 hours), Seahawks vs. Broncos (about 12 hours) |
| v1 prices against Polymarket | Drifted, because only the operator key requotes v1 (the robot cannot): four markets by 5 to 7 points (Trump cabinet unchanged 0.492 vs. 0.44, Taiwan local KMT 0.755 vs. 0.69, Ethereum dips to 2,250 0.65 vs. 0.72, Hyperliquid 100 0.475 vs. 0.425) and two by 2 to 3 points (Supreme Court on event contracts, two Fed hikes). Six `SetQuote` calls passed in simulation; sending them was refused by this session's safety check, so they wait for the owner's yes |
| gnoweb | `onyx.testnets.gno.land/r/nym-sixseven067/home` and the markets realm's pages render with live data |
| Not verified | A real purchase with Adena (the owner's first test), the Sav registrant e-mail verification for the67.click, the watcher on GitHub (repository not reachable from this session), Safari, Firefox and real phones |

## The walkthrough, version 2 (October 15, 12:10)

| Check | Observed result |
| --- | --- |
| File | `previews/reel/67-walkthrough.mp4`: 52.0 s, 1560 frames, H.264 1920 × 1080 at 30 fps, AAC 48 kHz stereo; about 11 MB |
| Sound | −14.2 LUFS integrated after AAC (ffmpeg ebur128). After the owner's note on the beeps (12:50): the 6–16 kHz band is 4.5 dB lower in the groove (−10.5 dB against the mids, from −6.0), and the energy above 1.5 kHz in the 120 ms after a press is now 1 to 10 dB below the music around it (it was 1 to 4 dB above) |
| Recording | `record.spec.ts` passed six times in a row (about 2.2 minutes each), with live Onyx, Polymarket and gnoweb pages. Every wait for the network or the stand-in happens between frames |
| Frames | Contact sheets at about 30 moments, looked at after each recording, and consecutive frames around the cuts at 9.5, 14.0 (live to stand-in, the same ticket), 26.0, 30.0, 36.0 and 42.0. Fixed along the way: a status-page lookup that hung, the portfolio cropped at its edges (now 1.0), the claim's empty first-visit state (an earlier position keeps the list), the status card cut on the left (`fit`), a white frame under the robot's wipe (the last frame is held), gno.land's footer and logo (kept below the frame) |
| Presses | Each press lands on its control in the frame: Sports, the Cowboys vs. Packers row, Connect Adena (ticket and wallet), Close wallet, Packers (the buy button turns cobalt), Cowboys, the amount, Review trade, Confirm in Adena, View portfolio, Claim 4.12 GNOT, Propose Cowboys (Yes) |
| Captions | 13 captions and the robot's card, with no two on screen at once (each leaves 0.35 s before the next); SRT and VTT generated from `film.ts` |
| Not verified | Listening on speakers or headphones; the film on a phone screen; a live trade on Onyx (the trade is recorded on the stand-in) |

## The walkthrough film (October 15, 09:30)

| Check | Observed result |
| --- | --- |
| File | `previews/reel/67-walkthrough.mp4`: 100.0 s, 3000 frames, H.264 High yuv420p 1920 × 1080 at 30 fps (about 2.2 Mb/s), AAC 48 kHz stereo 192 kb/s; 29.5 MB |
| Sound | −14.0 LUFS integrated after AAC (ffmpeg ebur128), loudness range 3.2 LU; true peak −2.3 dBTP in the score before encoding |
| Composition | Stills at every scene (half size) looked at three times while framing: header either fully in or fully out, nothing cut at the caption band's edge, no caption over the interface; three fixes followed (caption band instead of a plate, the opening without a caption, the claim cut in on the balance and status line) |
| Cuts | Frames before, during and after each of the 19 dissolves in the final render: no flashes, no empty frames, the robot card's type leaves before the end card arrives |
| Presses | The frame at each of the 10 presses: the pointer is on Sports, Cowboys vs. Packers, Connect Adena, Cowboys, the amount, Review trade, Confirm in Adena, View portfolio, Claim 4.12 GNOT and Propose |
| Captions | 16 captions, burned in and as `67-walkthrough.en.srt` / `.vtt` generated from the same list |
| Chart fix (`src/ui/Chart.tsx`) | Typecheck passed; 71 unit tests; e2e 47 passed, 1 skipped; a live market page at 320, 390, 820 and 1440: no path past the chart's edge, no horizontal overflow, no console errors (`.qa/walk-1015/`) |
| Not verified | Listening on speakers or headphones (the score was checked by its spectrum and levels only); the film on a phone screen; the chart fix on the live site (not deployed) |

## Realm v2 and the robot live (October 15, 07:49–08:15)

| Check | Observed result |
| --- | --- |
| v2 on Onyx | `AddPackage` at height 413408 (69.7 million gas); `RealmJSON` shows the settings, listing terms and, after the robot's first run, the robot as quoter and lister with nothing pending |
| Six matches from the operator key | `ops/robot/operator.ts --list 6`: twelve calls (list and fund), all succeeded |
| the67.click (deployments 9 and 10) | 49 markets, then 50; the Sports topic, a match page and the status page at 1440 and 390 without console errors or overflow (`.qa/live-1015-v2/`) |
| The robot on Vercel | `/api/robot` returns 401 without the secret; `vercel crons list` shows six jobs; a run triggered by hand returned 200 and logged: both roles accepted, one match listed and funded, no errors. The only warning is Node's `url.parse()` deprecation from a dependency |
| Not verified yet | A scheduled (not hand-triggered) run; a requote, pause or finalize on Onyx by the robot (none was due) |

## The listing robot (October 15, morning)

| Check | Observed result |
| --- | --- |
| `npm test` | 71 (4 new: closing times, outcome names, topics and IDs, the robot's two-sided quotes) |
| e2e | `v2.spec.ts` and `catalogue.spec.ts` pass after the ticket change (8) |
| Robot on a local node | Realm v2 deployed at its production path; settings, listing terms and both roles offered to a throwaway key. Five runs with live Gamma, CLOB and Polygon reads (`.qa/robot-1015/robot-run*.json`): the first failed both role acceptances on gas (3 million too low; every call now gets 20–80 million at 0.001 ugnot per unit), the second accepted both roles and listed three markets, the third (matches only) listed Seahawks vs. Broncos, Bears vs. Falcons and PSG to win on 20 October, the fourth renewed six quotes and listed a second market from the PSG event, which led to the one-market-per-event rule, the fifth listed Sabres vs. Maple Leafs and Panthers vs. Eagles and nothing from covered events |
| The app on those markets | Sports list, Seahawks vs. Broncos and Sabres vs. Maple Leafs at 320, 390, 820 and 1440 against the local node (`.qa/robot-1015/`): league pictures, team names on the ticket, Polymarket's line; no overflow, no console errors |
| Vercel bundle | `api/robot.js` 1.3 MB; refuses without `CRON_SECRET` (401) and without configuration (503) |
| Onyx v1 requotes | The keyless watcher found seven markets a cent or more behind Polymarket; seven `SetQuote` calls succeeded (heights 413287–413293) |
| Not verified | The robot on Vercel and on Onyx (waits for v2), Vercel Cron timing, a full run against 30 open markets within the time limit |

## One venue, market pictures and charts, named outcomes (October 15, day)

| Check | Observed result |
| --- | --- |
| `npm run typecheck`, `npm test` | Pass; 67 unit tests (the practice engine's tests left with Practice; new: v2 outcome names parsed and refused, a match market's binding and proposal in the oracle) |
| e2e (`pw.container.config.ts`) | 47 passed, 1 skipped (local-chain). New: pictures on a mirrored row and on the lead (loaded, from the Gamma lookup by condition ID), Polymarket's chart on a read-only page, a v2 match market end to end (team names on the list and ticket, review says "Lakers", the purchase sends `Yes`, the status page proposes "Lakers (Yes)", the market page says "The oracle proposed Lakers"). Picture host and price history are mocked; axe clean on the markets page, the Polymarket page and the review dialog |
| Realm v2 | `gno test ./v2`: 31 groups pass (new: match markets name their outcomes, with six refused name pairs and the pages after a proposal and a result); `gno fmt` and `gno lint` clean. v1 27 groups, home 2 |
| Realm v2 on a real node | Deployed to a local gnoland node at `markets/v5` (about 72.7 KB, storage fee 7.27 GNOT at the local price); `ops/v2-local-check.sh` passes all 20 checks, including a match market listed with "Los Angeles Dodgers" and "Milwaukee Brewers", the same name twice refused, and the names in `MarketJSON`. The app's own reader (`fetchMarkets`) reads the node's markets with their names |
| Pictures, live | All 43 listed markets have a picture from Gamma (36 their own, 7 the event's); after scrolling the markets page at 1440, 76 of 76 picture slots had a loaded picture. The originals weigh 5.1 MB for the 43 (8 above 150 KB), which is why the deploy config adds Vercel's resizing |
| Screenshots, live data | Markets, a market page and a read-only Polymarket page at 320, 390, 820 and 1440 (`.qa/pictures-1015/`): no horizontal overflow, no console errors or warnings. Looked at: pictures align the questions in rows; the lead's picture sits beside the question; the grey Polymarket line reads behind the short green 67 line; the read-only match page draws Polymarket's month with its jump at the end |
| Screenshots, v2 match on the mock | List, lead and market page at 320, 390, 820 and 1440 (`.qa/pictures-1015/mock/`): long team names wrap in the lead and in the ticket, a row keeps one line (wider buy column on desktop, buttons on their own line below 861 px); no overflow |
| Standalone | `STANDALONE=1` build; `67.html` 1.27 MB and `67-source.zip` (215 files); `verify-standalone.mjs` passed at 1440 and 390 against live Onyx and Polymarket |
| Not verified | Vercel's image resizing (it runs only on the deployed site); a v2 match market on Onyx (v2 is not deployed); pictures on real phones and slow networks |

## Full market, Polymarket mirror and realm v2 (October 15, morning)

| Check | Observed result |
| --- | --- |
| Listing on Onyx | 39 markets created and funded (create gas 6.2–10.4 million each, about 0.58 GNOT per listing besides the reserve); the watcher reads 43 open markets, every quote within 1 cent of Polymarket's midpoint, Polygon unsettled, 0 alerts |
| Polygon for negRisk markets | Two resolved negRisk markets read `[1, 0]` and `[0, 1]` from the same Conditional Tokens contract through two RPCs, so the oracle path covers them |
| Realm v2 | `gno test ./v2`: 29 groups pass (fee table and rounding, cost plus fee, winners and surplus, void refunds, guardian cancel, abandonment, quote band, sum and expiry, limits and exposure, pause, roles, listing checks, JSON and pages, 13 payment refusals, threats R1 and R2, property test over 12 random markets); `gno fmt` and `gno lint` clean. Not deployed |
| `npm run typecheck`, `npm test` | Pass; 78 unit tests (4 new for the Gamma reader) |
| e2e | 73 passed (4 new in `e2e/catalogue.spec.ts` with a mocked Gamma API, axe clean on the markets page and the Polymarket page) |
| Mirror on live data (local dev server) | Markets, Sports, Crypto, a search and a Polymarket page at 1440 and 390: no console errors, no horizontal overflow (`.qa/mirror/`) |
| Not checked | The mirror on the live site (not deployed), a real Adena purchase |

## Live on Onyx and the67.click (October 15)

| Check | Observed result |
| --- | --- |
| Onyx after listing | The watcher reads 4 open markets, prices equal to Polymarket's midpoints, Polygon unsettled, 0 alerts; the realm's bank holds 60 GNOT against 60 GNOT of escrow |
| Domain | `https://the67.click` answers 200 with a valid certificate; `www.the67.click` and `six-seven-67-phi.vercel.app` answer 308 to it, keeping the path |
| Live site on the67.click | Home (weighed by the live Onyx price), markets, a market page, status and contract at 1440 and 390: real data, no console errors |
| Wallet path | Adena's built-in networks include `onyx-1` (Adena's `chains.json`); the Onyx faucet at faucet.gno.land asks for an address, 100 GNOT and a captcha |
| Not checked | A real purchase signed in Adena on Onyx (needs the owner's wallet) |

## Full check, oracle cycle and the status page (October 14, night)

| Check | Observed result |
| --- | --- |
| Realms | `gno fmt -diff` and `gno lint` exit 0 for both; markets 27/27 groups (with `threat_test.gno`), home 2/2 |
| `npm run typecheck`, `npm test`, `npm run build` | Pass; 74 unit tests (10 in `src/live/oracle.test.ts`) |
| e2e | 69 passed, the local-chain test skipped in the suite and run separately against a local node: passed (a real Adena-style purchase confirmed from contract state) |
| Oracle cycle on a local node (`ops/watcher/lifecycle.local.ts`) | Two markets bound to Polymarket conditions already settled on Polygon (one Yes, one No): the watcher read Polygon, prepared `FinalizeByOracle`, the realm accepted it, claims paid exactly 3 and 1 GNOT, the evidence hash on chain equals the watcher's, the bank equals escrow |
| Watcher against Onyx | Realm deployed with 0 markets: 0 alerts |
| Live site with the deployed empty realm | Markets: "No markets yet"; Contract: "Deployed, 0 markets"; Portfolio asks to connect; no console errors at 1440 and 390 |
| Status page | Local chain with 7 markets (4 open, 2 final, 1 settled on Polygon but not signed): screenshots at 320, 390, 820, 1024, 1440 and 1920, public and as the oracle and administrator, reduced motion, no horizontal overflow, no console errors, axe clean (`.qa/status/`) |
| Market page | A final market shows the result and the short panel; a market settled on Polygon says the oracle still has to record it (390 and 1440) |
| Not checked | The status page on the live site (not deployed); real Adena signing of several messages in one transaction (mocked; Adena's `DoContract` takes a message array) |

## Gno pages on gno.land (October 14)

| Check | Observed result |
| --- | --- |
| `gno test .` in `contracts/` | 23/23 groups pass, including the new list and market pages, the unknown-market page, Markdown escaping and price text. |
| `gno test ./home` | 2/2 groups pass: the home, how and contract pages, the not-found page, formatting. |
| Local node | Fresh gnoland v1.5.0 (same `v1.0.0-rc.0` ABCI as Onyx); both realms deployed at their real paths through gnomcp; four markets seeded and funded with 5 GNOT; one purchase (2 Yes shares at 0.42) and one requote (0.44) shown on the pages. |
| gnoweb v1.5.0 | Every page at 1440 and 390, dark and light (`.qa/gnoweb/`). Columns render with `<gno-columns-sep>` (the bare `|||` of gno.land's docs page is not supported by this gnoweb or by Onyx's `r/docs/markdown`). |
| Console and overflow | The only console errors are gnoweb's own inline-style CSP refusals. The horizontal overflow at 1440 and on a market page at 390 comes from gnoweb's header and breadcrumb, not from the realm's content. |
| Not checked | The pages on Onyx's gnoweb itself (they appear only after deployment). |

## Responsive and visual review

Fresh screenshots of all six routes at 320, 390, 820 and 1440 px in Practice, plus home, markets and contract in Testnet, inspected after the V6 changes: no horizontal overflow, no console errors. The phone menu sheet was opened and inspected at 390. Earlier V5 checks (text doubled at 320 px, portfolio fold at 390×844) were not repeated for V6.

Owner feedback applied: palette replaced (no tomato or cream); mark built from cubes; the hero's giant glass 67 replaced by the balance ("the crane was better"); the forest takes only the general Gno.land style; no outlines and no outer shadows anywhere.

## Hero scene

Rendered with software GL through the loopback-only flag, with reduced motion (one frame) at 1440×900 and 390×844, and inspected: night forest, terraces, glass-block clearing, balance tilted toward No for a 0.42 Yes price, the No pile brighter. Without the flag, software GL is detected and the still picture stays, which is the path the e2e suite exercises; with WebGL disabled the still picture and text prices remain. The still was regenerated from the scene's poster mode (balance at rest, empty pans). GPU rendering, frame timing on phones and battery use were **not** measured here.

## Living scenes (October 12)

Story scene frames rendered with software GL at progress 0.55, 1.45, 1.8, 2.3, 2.75 and 3.5 at 1440×900, and at 1.6 at 390×844, and inspected: balance rising and plaque, cubes falling, oracle beam, frosted No pile, winning cubes leaving. The phone framing was widened after the first render cut the plot. Hero ambient loop rendered without errors; cloud drift and sway were reviewed from the code and single frames only (software GL is too slow for real-time motion review). Who does what renders at 1440 and 390; flow labels are hidden on phones where they would be under 7 px. e2e: 59 passed, 1 skipped (local-chain), including two new parties tests.

## Handjet, spacing pass and story pictures (October 12)

| Check | Observed result |
| --- | --- |
| `npm run typecheck`, `npm test` | Passed; 64 unit tests. |
| `npm run build` | Passed. Main bundle 391 KB (115 KB gzip), CSS 52 KB (11 KB gzip). |
| e2e | 60 passed, 1 skipped (local-chain): the full suite after the spacing fixes, then `site.spec.ts` and `testnet.spec.ts` again after the picture renderer changed, plus a new test (pictures `aria-hidden`, armed below the fold, all built after scrolling, at rest under reduced motion, no overflow at 390). |
| axe-core | 0 violations on all six routes at 390 and 1440 after the pictures landed. |
| Screenshots | All six routes at 320, 390, 820, 1024, 1440 and 1920 (reduced motion for full pages): no horizontal overflow, no console errors. Menu sheet at 320 and 390, wallet, trade review, confirmation and Demo controls at 390 and 1440 inspected. |
| Picture scale audit | Script `audit.mjs` (scratch) measured every picture: block size 13/15/16/20 px by width; Two venues scales to 11.8 px at 320 and 12.7 px at 820 where its column is narrower; title to picture 24 px on phones and tablets, 44 px on desktop; picture to text 28 px on phones; nothing overflows. |
| Reveal | At 1440 with motion: pictures below the fold armed, build when scrolled in, none left hidden after a full scroll, no console errors. |
| DOM weight | How it works 1,837 nodes after merging still rows (5,150 before). |

Bugs fixed in this pass: hero line breaking inside "Take a side." at 1024–1919; forest not bleeding past 1440 (clipped by the 1440 px shell); uneven home market rows; parties list too wide on tablets; question status grid stretched on tablets; portfolio summary wrapping at 320; "How it works" wrapping in the phone menu; Demo controls title shrunk by the footer heading rule.

## Design craft review and fixes (October 12)

The owner's `design-craft-reviewer` skill was run read-only (report: `.qa/review-2026-10-12/review.md`, with evidence: first-impression screenshots at 390/900/1440, `motion-probe` strips and reports, `qa-shoot` sweep with axe, `slop-scan`, a fold measurement on seven viewports, a keyboard pass). Five findings, all fixed on the owner's word:

| Finding | Fix | Re-check |
| --- | --- | --- |
| Open markets and the price below the first screen on phones and tablets | Shorter scene below 1024 px, headline rides into its fading edge | CTA bottom 612/667, 794/844, 889/1000; price visible at 820×1180; new e2e test |
| Hero still lost the idea (empty pans, bright bare pivot) | Still regenerated with four lit cubes per pan, dimmer pivot; live scene starts from that state | Still and a software-GL live frame (42%: Yes 7, No 9) inspected, no console errors |
| Endless decorative loops (WCAG 2.2.2) | One pass per entry into view, ≤ 5 s; hero ambient in 5 s passes | `getAnimations()` empty 6 s after entry, replays on re-entry; new e2e test. The hero's pass timer was checked in code only: software GL trips the slow-device cutoff first |
| Hero question link 23 px tall | 11 px padding with matching negative margin | 45 px tall at 390 and 1440 |
| Three text axes in a row on Contract | Section leads on column 6 on reading pages | Units text and the calls lead start at the same x at 1440 |

Also: Who does what copy cut to one line per party (live address lines kept). The layout shift noted during the re-check (without a GPU the four-calls section first laid out for the 3D story, then shrank up to 17 s later under load) is fixed: `src/landing/gpu.ts` checks for a hardware WebGL context before any three.js loads, the story starts in its text layout on such devices and the hero keeps its still without downloading the 3D chunk. Traced with class-change logs on three parallel pages: no story switch, Who does what goes live once, flows end at 4.8 s.

Trademark sign: block-pixel ™ beside the 67 in the header, menu sheet and footer (13×7 px at the 54 px header mark, 16×9 px in the footer); checked at 390 (DPR 3) and 1440 (DPR 2).

Test runs after these changes: unit 64; e2e 63 tests (62 + local-chain skip), two full runs: one clean, one with `flows.spec.ts` "selection survives connection" failing on a timing race under three parallel workers (it expects the header balance during the simulated pending window; untouched by these changes, also seen once before them); axe 0; all routes at six widths without overflow or console errors.

## Exchange pages with more air (October 12)

Head row merged (title and venue left, tools right), dead controls hidden, five empty states with block pictures, one leading figure in Portfolio. Checked: all routes at 320, 390, 820, 1024, 1440 and 1920 in Practice, Markets and Portfolio in Testnet at 320, 820 and 1920 (no overflow, no console errors); axe 0; the full e2e suite 63 passed, 1 skipped (local-chain), including a new empty-state test; the 390×844 portfolio fold test caught the taller head and summary first and passes after the switch moved beside the title and the notice became one row.

## Finishing pass (October 12)

Fresh look at every page at 1440, 900 and 390, Practice and a deployed-testnet stand-in (MockChain, connected Adena, a finalized market, quote history). Changed: default lifecycle labels hidden, ticket head on one line, portfolio totals only with positions, real not-found page, share card and touch icon. Checked: unit 64; e2e 64 passed, 1 skipped (local-chain), with a new not-found and share-card test; axe 0; all routes at 320, 390, 820, 1024, 1440 and 1920 in Practice and four routes in Testnet at 320 and 1440 without overflow or console errors. How the card renders in Telegram, Slack or X was not checked (needs the deployed URL).

## Live review fixes (October 12, afternoon)

The owner reported the four-calls plot cut off and its text animating oddly on the live site, white buttons everywhere, and meaningless labels above headings. Reproduced the story at 825×1000 with software GL (plot cut at the stage bottom, text sliding under the opaque sticky stage, steps dimming), fixed, and re-rendered at 825×1000, 1440×900 and 390×844. Checked after all three fixes: unit 64; e2e 64 passed, 1 skipped (the catalogue focus test caught a restored question 0.2% outside the viewport once the label above it went; questions now keep a 96 px scroll margin); axe 0; all routes at six widths without overflow or console errors.

## Landing as full-screen scenes (October 12, evening)

| Check | Observed result |
| --- | --- |
| `npm run typecheck`, `npm test` | Passed; 64 unit tests. |
| `npx playwright test -c pw.container.config.ts` | 64 passed, 1 skipped (local chain). The story test now reads the index of the four calls; the parties tests read the new live line and the not-deployed sentence. |
| axe-core, six routes, both venues, 390 and 1440 | No violations after `--quiet` moved to #7A8681; the first run flagged the index at 4.4:1. |
| Screenshots with software 3D (loopback flag) | Home sections at 320×568, 390×844, 820×1180, 1024×768, 1440×900 and 1920×1080: title page and each call at its hold point, Who does what, markets, code. No horizontal overflow, no console errors at any width. Every story title line measured on one line at every width (longest 6.15 em). |
| Without 3D, reduced motion, landscape phone | Block pictures in the pinned frame at 1440 and 390; reduced motion at 1440; 844×390 after the short-screen rule (the first shot had the sentence touching the index). |
| Evidence | `docs/finish/before/`, `docs/finish/after/`, side by side in `docs/finish/compare/landing-1440.jpg` and `landing-390.jpg`. |

Not checked in this round: the pinned scroll on real phones (iOS Safari address-bar resizing of `svh`), and the scene's frame rate on a real GPU.

## Not verified

- Deployment and trading on the shared Onyx testnet: waiting for the owner's approval.
- Real Adena signing, Adena's network switch and add-network prompts, and its fee and storage-deposit display (exercised only through a stand-in that follows the documented API).
- Safari, Firefox, physical devices, screen readers, real browser zoom.
- The story pictures' build animation on real phones (checked in headless Chromium only).
- The three.js scenes on GPUs and real phones (frame timing of the ambient loop, the scroll story's smoothness); its look in this record comes from software rendering, and the 120 ms first-frame rule has not been tried on a mid-range phone.
- Oracle operation on a live market (the proposal tool correctly refuses open markets).
