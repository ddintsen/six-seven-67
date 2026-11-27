# Direction V6: glass blocks at night in a voxel forest

October 11–12, owner directions: replace the palette because it read as Claude (tomato on cream), build the logo from cubes and make it part of the brand, invent a non-typical style (dark theme, glass cubes), make a full site. After a first draft with a giant glass 67 in the hero: "the crane was better, 67 is everywhere", "maybe a forest background like Gno.land, think, study references", "rework everything for us, just catch the general style". V6 supersedes V5 where they differ.

## Idea

A market is a balance in a clearing at night. Shares are glass cubes; each side's cubes glow with its price, and that light colours the woods around them. Transparency is the point of the product (every rule is in a public realm), so glass is the material, not an effect.

Recognisable from one screenshot: the dark voxel forest with a lit balance, the two glass colours, the cube mark with the 7 one block lower.

## Palette (tokens in `src/styles.css`)

| Role | Token | Value | Why |
| --- | --- | --- | --- |
| Ground | `--ground` | #0B0E0D | The dark behind a glass-block wall at night; a faint green from float-glass edges |
| Surfaces | `--surface`, `--control`, `--field` | #121715, #1A201E, #1C2321 | Separation by tone only, no outlines |
| Text | `--ink`, `--muted` | #E8EEEB, #9AA6A1 | 16.5:1 and 7.7:1 on the ground |
| Yes, emerald glass | `--yes`, `--yes-fill`, `--yes-bg` | #5DD39E, #1E7B52, #10261C | The 6 of the mark and every Yes surface |
| No, cobalt glass | `--no`, `--no-fill`, `--no-bg` | #8AA9FF, #3156C9, #121C36 | The 7 of the mark and every No surface; never red, No is not an error |
| Primary action and focus | `--flint` | #E8EEEB on #0B0E0D | Clear flint glass: the light itself. No third accent colour, no orange |
| Practice | `--frost` | #CDD6D2 | Frosted glass: the venue you cannot see money through |
| Retained or blocked | `--caution` | #E9C46A on #2A2312 | Sodium light, used only for state |
| Refusal | `--alert` | #F28B95 on #2E1519 | Input errors |

Dark only: glass reads on dark, and a second theme would dilute the one picture the brand is built on. Every text pair measured at least 4.5:1 on the real colours (QA.md).

## Mark

Cubes on a 7×6 grid in oblique view; the 6 in Yes glass, the 7 in No glass, the 7 one block lower (the gesture). Header and footer only; see WORDMARK.md. Signed with a block-pixel ™ beside the 7 (owner request, October 12).

## Hero scene (`src/landing/forestScene.ts`)

- Catches the general style of the Gno.land documentation world (REF-9): high camera, voxel spire pines and round trees, one-voxel terraces with jagged edges, soft shadows. Redrawn for 67: night instead of day, no pond, no lily pads, no mushrooms, our ground colour, and a clearing paved with glass blocks.
- The balance from V5 ("the crane") stands in the clearing. Pans hold up to 16 glass cubes split by the Yes price; the beam tilts toward the dearer side with a slightly under-damped spring (about 0.8 s). Each pile has a glowing core per cube and a point light whose strength follows its side's price, so the dearer side lights more of the forest and of the glass floor beneath it. This is the one orchestrated motion; cubes drop in when the market changes.
- Below 1024 px the scene sits above the copy and gives up height before the action does: `clamp(260px, 100svh − 560px, 520px)` on tablets, `clamp(200px, 100svh − 470px, 400px)` on phones, and the headline rides up into its fading lower edge. The headline, lede and Open markets fit the first screen from 375×667 up; at 820×1180 the live price does too.
- The scene runs edge to edge behind the hero and dissolves into the page at the top and bottom (CSS mask); fog to the ground colour hides the forest's far edge. On wide screens the clearing sits right of centre so the darker woods carry the headline (type on the calm part, never on the object).
- Rendering on demand, paused offscreen and in hidden tabs; pointer parallax of a few degrees on mouse only. Software rasterizers, failed contexts and slow first frames keep `public/forest-night.webp`, a still of the same forest with the balance level and four glowing cubes in each pan (regenerated October 12 after the design review: the empty-pan still lost the idea and its brightest spot was the bare pivot). It is also the placeholder while the 3D chunk loads; the live scene starts from the same four-and-four state and drops in the rest of the price while the beam tilts, so the hand-over reads as one gesture. Reduced motion draws one still frame. The price is always text. A cheap check for a hardware WebGL context (`src/landing/gpu.ts`) runs before any three.js loads: without one, the hero keeps the still without downloading the 3D chunk and the four-calls story starts in its text layout, so the page never shrinks under the reader.

## The earlier contract and the lead market (November 27, 2026; owner: «мне надо максимально все улучшить до проф победного уровня подробно профессионально как делают топовые команды»)

- The lead on Markets is only ever a market someone can buy now: a v2 market inside its quote lifetime. With none open, the page says "No market is open for trading right now" in the compact page-state type instead of promoting a settled or stale question (the Gnome Tavern review found Bitcoin vs. gold leading with a five-week-old price).
- Once Markets v2 is configured, Markets v1 is the earlier contract: its own section after the current markets, one muted line on why it is read only, rows whose last column says "Read only" in the closed-state type. No buy links on those rows, so no emerald or cobalt where nothing can be bought. A v1 market page shows the closed panel headed "Earlier contract" with one secondary action, "See open markets"; claims stay in Portfolio.
- Nothing new to look at: both reuse existing states (compact page state, closed outcome, closed ticket); no badge, outline or colour was added.
- Home: a match names its teams in the balance caption and the open list instead of Yes and No; with nothing open the caption says so instead of "Reading Onyx testnet".

## How fresh a price is (October 15, 16:06; owner: "чтобы люди не думали что это актуальные но главное не испортить интерфейс")

67's price is a fixed quote that holds until the next one, while Polymarket moves all day; a visitor should not take the quote for a live feed.

- **One sentence, in the price block's text column**, under the line with the share prices, in the same muted 13 px: "Updated 6 h ago, in line with Polymarket." When Polymarket's midpoint is two points or more away: "Updated 11 h ago. Polymarket is at 71% now." (a match names the side: "Polymarket has Leverkusen at 63% now."). Without a midpoint it says only when the price was set; after a day it gives the date.
- **Where:** the market page and the lead market on the list. Not in the list rows: a time in every row would turn the list into a log.
- **Nothing new on screen besides the words:** no badge, no colour, no icon. The chart already shows the same thing (the green quote against Polymarket's grey line), so the sentence names what the picture shows.
- **Polymarket's midpoint** is read from its public CLOB while the price is on screen, once a minute, and is never used to set a price (`src/live/midpoint.ts`).
- **Not built: a button to ask for a new price.** A button only helps if pressing it changes the price. For v2 the robot refreshes six times a day; v1 can be requoted only by its administrator, so a button there would do nothing. It becomes worth building once the robot also quotes v1.

## Market pictures, charts and named outcomes (October 15; owner: "они используют иконки логотипы картинки для графиков + есть на футбол и тд", "делай уже как финальный готовый продукт")

- **Pictures are content, not decoration.** Each market shows its own picture from Polymarket (the subject: a candidate, a club badge, a league mark), never a generic icon. This is the one place where an image sits beside text, by the owner's request; the standing rule against small decorative icons still holds everywhere else. Sizes: 44 px in rows, 72 px beside the lead question, 64 px beside a market title (40, 48, 48 on phones); radius 10–14 px; no frame, no shadow. The slot keeps its size with a quiet surface tile while loading or when a picture is missing, so question text keeps one left edge. Pictures are `aria-hidden`: the question beside them says what they show.
- **Polymarket's line behind ours.** The chart keeps 67's quote steps in emerald and adds Polymarket's price over the last month as a thin quiet line behind them, with a text legend ("67 quote" in emerald, "Polymarket" in muted ink) and a caption that says the quotes follow it. A market not on 67 draws Polymarket's line as its main line, joined by straight segments because it is sampled, not published.
- **Named outcomes.** A match lists its two teams as the outcomes (realm v2). The emerald and cobalt roles stay with the first and second outcome; only the words change. In the lead the buttons widen to 560 px so names wrap at most once; a row keeps one line, shortening a long name with an ellipsis while its link label keeps the full name; on desktop the buy column widens to 360 px when the list holds team names; below 861 px the buttons move under the question. The ticket's outcome buttons let a name wrap above its price.
- **Read-only page.** "Not on 67 yet" takes the trading panel's place, so the page keeps the market page's shape and the empty right column is gone.

## Status page (October 14; owner: "нам же и интерфейс надо доделать … чтобы парсер все время работал", "а интерфейс наш будет")

- One page, `#/status`, for everyone; the people who hold a role see their actions in place rather than on a separate console.
- Order by urgency: a result to sign is the dominant (a surface card with the question, the result word in its outcome colour, the evidence and one action); then anything that needs attention; then the markets as the portfolio's ledger (our Yes, Polymarket Yes, Polygon); then collateral as one sentence.
- No new components: page head, ledger rows, inline notice, buttons and type roles all come from the exchange pages. Numbers in tabular figures; settled outcomes in their outcome colours; final markets show a dash instead of a price.
- The market page of a final market shows the result word where the price was and replaces the trade form with a short panel (result sentence, "Claim in Portfolio").

## Home below the hero: one screen per idea (October 12, 16:09; owner: "I don't like this scroll and the small text; the idea is good, but either bigger or better animation, and sections a full viewport each, because below it is a pile of content")

- **The four calls are one pinned, full-screen scene** (`Story` in `src/landing/Landing.tsx`). The section is its five pages (title, then one call each) at 90svh plus one screen; the frame stays (`position: sticky`) while the pages scroll under it. The plot fills the right of the frame and bleeds off the right edge; the copy holds columns 1–5.
- **Type at display size.** Each title is two lines broken by meaning ("The question / is fixed."), set in Handjet at one size for every title below the hero, `calc(clamp(36px, 5.9vw − 7px, 77px) × 1.12)` (86 px at 1440, 60 px at 1024), sized so the longest line, "The oracle records" (6.15 em), always fits the five-column copy column. Portrait screens below 1024 use `clamp(40px, 7.4vw + 1rem, 72px) × 1.12` (50 px at 390, 45 px at 320). One sentence under each title at 18–23 px.
- **The swap is the animation.** Lines rise from below through their own masks (1 s expo-out, 80 ms stagger); the leaving page's lines go up and out (520 ms in-out); the sentence fades in after the title. The plot plays each call over the first two thirds of its page and then holds while it is read. Scrolling back plays everything in reverse. Reduced motion swaps the pages without movement and shows each call's finished state.
- **Where you are.** The four function names sit at the foot of the frame as an index (quiet, the current one in ink); each is a button that scrolls to its call. No numbers, no progress bar.
- **The balance rises out of the glass floor.** A clipping plane at the floor cuts whatever is still below it, so nothing hangs under the floating plot before CreateMarket. The plot's box now fills 92% of the stage (was 86%).
- **Without a GPU** the same pinned scene shows each call's block picture in place of the plot. **Phones and portrait tablets**: plot in the top half, text in the bottom half, the same index. **Short landscape screens**: the panel rides higher so the text clears the index.
- **Who does what** is one screen: the title, one paragraph that says what the diagram cannot (the realm holds the collateral and nobody can withdraw it; Polymarket only supplies questions and results, 67 never trades there), and one live line (operator address and last quote, oracle address and how many markets are final), or one plain sentence while the realm is not on Onyx. The definition list of five parties is gone: the diagram already names every party and call. Its track lines now start below the node labels.
- **Markets and the code** are each a full screen with the same display title, the rows and the code at reading size.
- `--quiet` moved from #6F7B76 (4.4:1) to #7A8681 (5.1:1) so the index passes text contrast.

## Living scenes (October 12; owner: "think through animation scenes like the hero, so it feels alive", "a cool landing that explains how it works")

- **Hero ambient life.** The forest lives in passes of five seconds (WCAG 2.2.2): on arrival, when the stage scrolls back into view, while the pointer moves over it and when another market is weighed; the last second slows to a stop. Voxel clouds that only cast shadows drift across the moonlight (two copies one period apart, so the drift never jumps), trees lean in a slow wind (a vertex shader moves each voxel as a whole by height), and the pile cores breathe ±6%. Capped at 30 frames a second, paused offscreen and in hidden tabs, switched off after 90 frames if a device needs more than 24 ms per ambient frame, never with reduced motion.
- **Four calls as a scroll story.** A small floating plot of the same forest plays CreateMarket (the balance rises from the glass floor, the frosted question plaque rises and seals), Buy (sixteen cubes drop, nine Yes and seven No, the beam follows the weight), FinalizeByOracle (a thin beam of light marks the Yes pan, the No cubes go dark and frosted) and Claim (winning cubes leave one by one and the beam swings back). The scene is a pure function of scroll progress, so scrolling back reverses it; the shown value follows the scroll with damping. Desktop: steps on the left, sticky stage on the right. Phone: sticky stage on top, steps underneath. No GPU: the steps return to four text tracks. Reduced motion: the finished state of the step being read.
- **Who does what.** A diagram in the mark's cube language: the realm in the middle, Polymarket, the operator, the oracle and you around it, with pulses of light along each real call or read (midpoint, result, SetQuote every 10 minutes, FinalizeByOracle, Buy and Claim). Beside it each party's job and, once the realm is live, its address and last on-chain action read from the chain (administrator, latest quote time and count, oracle, finalized count). Pulses are CSS only: each flow plays once, in order, every time the diagram comes into view, all done within 4.8 s, and none with reduced motion. Party texts were cut to one line each after the design review.

## Exchange pages: air (October 12; owner: "the whole site must be great", standing rule: lots of air, fewer elements per screen)

Design read: product UI for crypto-curious traders, in the dark glass-block language, leaning toward Rondesignlab's charcoal screens with one large numeral per view. Dials: variance 4, motion 3, density 5 (lowered from the product preset of 7 at the owner's request).

- **One head row.** Title and venue line on the left, the page's own tools (venue switch, search) on the right of the same row; below 1024 px they stack. The separate venue bar above the title is gone, and the Practice tag no longer repeats what the selected switch already says.
- **No dead controls.** Search and topics appear only when the venue has questions to narrow.
- **Empty and waiting states as one scene.** A block picture of the situation, one heading in the display face, one line, at most one action: the contract not on Onyx yet (the balance built, pans empty, two cubes waiting above), no markets, no matching questions and question not found (a tablet with a question mark), positions behind Adena (a glass box with a lock and your two colours), your first position (your colours on a plinth, a dotted signal to an empty place). Loading and read errors stay plain text, so nothing flashes or pretends.
- **One leading figure in Portfolio.** The balance you can spend is set like the price numerals (Handjet, 64 px, 52 px on phones); the other figures read as its context.
- **The first position stays on the first phone screen** (390×844, a V5 requirement): Portfolio's venue switch rides beside the title, and the wallet notice keeps one row with a short Connect label (its accessible name stays "Connect demo wallet").

## Finishing pass (October 12; owner: "bring it to ideal")

- **Labels only when they say something.** A market's lifecycle shows beside its topic only when it is not plain trading (Awaiting outcome, Settlement pending, No won); open markets carry their topic alone.
- **Ticket head on one line.** "Take a position" with the venue to its right (the Practice tag or the network name), the venue's terms on the next line.
- **Portfolio totals only with positions.** Until there is a position, the summary shows the balance alone; the position totals and the value note appear with the first position. Notes that repeated their label were cut (the balance note now reads "Ready to spend").
- **A real not-found page.** Unknown addresses say "Page not found" and lead home; unknown markets keep "Question not found". Titles follow.
- **Share card and touch icon.** `public/og.png` (1200×630: the mark with ™, "Six. Seven. Take a side." in Handjet, the lit balance in the night forest on the right) with Open Graph and Twitter tags; `public/apple-touch-icon.png` (the mark on the ground tile). `og:image` is absolute to the production URL, so it must change with the domain.

## Owner fixes after the live review (October 12, afternoon)

- **Actions are coloured.** Primary actions use the mark's emerald glass (`--action` #1E7B52, hover #1F8556, white text 5.2:1 and 4.6:1); the action that buys follows the chosen side, so Review trade, Simulate trade and Confirm in Adena turn cobalt (#3156C9) when No is selected. Selection states (venue switch, chart interval, filters, the hero's market chips) stay light: they mark a choice, not an action. Dialog primary buttons no longer turn grey on hover.
- **No labels above headings.** The topic and state lines above market questions (lead, rows, market page) are gone: the topics filter already carries the topic, and a closed market says so where the price would be. The realm call names in "Four calls" moved under each step as a quiet reference; the hero's "Practice question, weighed by the balance" moved under the prices.
- **Four calls story fits any stage.** The camera now frames the plot from its projected bounds (86% of the narrower side), so it is never cut at tablet or phone sizes. Stacked (below 1024 px): the stage holds the top of the screen, each step fills the space below it with its text centred, and text leaving upward dissolves under a 40 px fade instead of being cut. Step text no longer dims and brightens with scroll.

## Site map and navigation

`#/` home, `#/how` how it works, `#/contract` contract, then the exchange: `#/markets`, `#/market/:id`, `#/portfolio`.

The header is a balance: the mark in the centre as the fulcrum, the site (How it works, Contract) on one side, the exchange (Markets, Portfolio, wallet) on the other. Below 1024 px both sides fold into a full-screen menu sheet set in the condensed display type, with the venue switch. The venue switch and search live with the exchange (above Markets and Portfolio), not in the brand header.

Home sequence, alternating dense and calm: hero (object and brand line) → four calls that settle a market (four text tracks under one heading, no cards) → open markets (rows) → one dark code block with the purchase guard → footer.

How it works: one display sentence ("A share pays 1 GNOT if it’s right."), then a working calculator that uses the realm's own rounding, then seven chapters on a hanging axis (title left, text on the reading axis, formulas in place).

Contract: dense function reference against a short practical column (who can call, signature, exact refusal messages; read functions, events, what the realm cannot do), with deployment status read from the chain.

## Composition rules used (swiss-editorial exemplars)

- E05 hanging secondary axis (Chipsa, Control): chapter titles and function names hang from the left axis, text from one reading axis.
- E06 dense versus short group (Neutra VDL): the contract's dense reference against a short practical column.
- E03 headline spans tracks (Pentagram, Sight and Sound): "Four calls settle a market" spans four text tracks.
- E17 fixed-stage motion (DIA, Klim): a readable static state always exists (the still), motion only changes the scene's data.
- E21 contrast before accent: tone and material carry contrast; colour is reserved for Yes, No and state.

## Type (October 12, owner chose variant D from the typeface switcher)

- **Display and prices: Handjet** (OFL), axes `'ELSH' 2, 'ELGR' 1`, weight 640, tracking 0, scale 1.12. Its element grid echoes the block mark. Hero 68–156 px, page titles 56–128 px, section heads 32–56 px, prices 92 px (72 px on phones). The hero line never wraps inside "Take a side." (`white-space: nowrap`, checked at 1024–1920).
- **Text and data: IBM Plex Sans** variable (wdth 85–100). Market questions use wdth 85, weight 620; body 16–17 px, lede 18–21 px, data in tabular figures.
- **Code: IBM Plex Mono** 400/600.
- Sentence case everywhere. The other faces from the switcher (Instrument Sans, Archivo, Hubot Sans, Mona Sans) and the switcher itself are in `_to_delete/`.

## Story pictures (October 12; owner: "lots of text in the logo's style, make large story pictures, mountains of text are dull")

- **Device.** Block art drawn in the mark's own oblique glass (`src/brand/Scene.tsx`, data in `src/brand/scenes.ts`): one character is one block, tones y Yes, n No, c clear, f frost (GNOT, Practice), g ground slab, w lit block. Every picture stands on a ground slab, so pictures read as one family and line up on a horizon in the home steps.
- **Where.** How it works: one picture per chapter (question frozen under a lock, the 1 GNOT split 42/58, the ticket with its check, the vault that covers the larger side, the oracle's signal, shares turning into coins, testnet and practice balances) and the hero (one share pays one coin). Contract: units (one GNOT cut into a million ugnot). Home: the four calls when the 3D story cannot run.
- **Scale.** One block size per width so the grain matches from picture to picture: 20 px from 1024, 16 px tablet, 15 px phone, 13 px at 360 and below; a picture wider than its column scales down. Pictures are framed to their blocks. Measured at 320–1920: 24–44 px from title to picture, 28 px from picture to text on phones, no overflow.
- **Layout.** Desktop: title and picture share the left five columns, text in columns 6–11 (max 36 em). Tablet: title on top, picture and text side by side. Phone: title, picture, text.
- **Motion.** Below the fold a picture builds once, bottom row first (620 ms, ease-out-expo, rows 45 ms apart), locks and coins drop in. Movement inside a picture is always a dotted line of small lit blocks (resting at 60% opacity) that a signal travels along (oracle ray, fill line, payouts): one pass of 2.4 s each time the picture comes into view, so nothing moves for more than five seconds on its own; the bought block in the home Buy step hovers twice and rests. Reduced motion and pictures already on screen show at rest. Pictures are `aria-hidden`; the text carries the meaning.
- **Weight.** Still rows merge into one path per face and colour, so How it works stays near 1,800 DOM nodes.
- Chapter copy was cut by about a third while keeping every rule.

## Refuse list (kept out on purpose)

Glassmorphism panels and backdrop blur, gradient blobs, gradient text, outer shadows, outlines, eyebrows and badges with dots, decorative numbering, small icons next to text (the external-link and back-arrow icons were removed; story pictures are large and carry a chapter's idea, never a label), KPI tiles, a 67 repeated as object or pattern, orange accents.


# Direction V5 (history): one interface, two venues, no frames

October 11, owner directions: continue the product, make it work on Gno with the Gno MCP, work the design through, and "no outlines around plates, buttons and so on". V5 supersedes V4 where they differ; V4 notes below remain the history of the portfolio ledger.

## Landing, October 11 (owner: "a little more Gno.land style, a landing, some three.js")

- **Idea.** 67 is a palms-up weighing gesture, so the landing's object is a balance. Its beam tilt and the two piles of cubes come from one number, the published Yes price of the market on show; the chips under it switch markets and the beam settles to the new weight. The 3D therefore shows live data instead of decorating.
- **Gno.land language.** docs.gno.land opens on a voxel forest with a pond, soft matte light and the core forest green (#226C57, #185C44). The scale stands in a small voxel clearing of that world: grass in the core greens, voxel pines, a slate pond, ochre and white mushrooms. Realm paths appear as gnoweb-style chips (`r / … / markets`), the settle section names the contract's real functions, and "Read every line" shows the purchase guard from the realm source. No Gno.land logo or gnome is used: the repository grants no right to the marks, so the footer carries a plain "Built on Gno.land" text link instead.
- **Composition.** Headline and actions on the left, the object bleeding toward the right on the warm paper ground (Cypher Capital's client site is the composition reference, in matte instead of chrome). The hero title is the brand line, "Six. Seven. Take a side.", in condensed Instrument Sans. Sections alternate dense and calm: function steps, live markets, then one dark code block.
- **Rendering.** three.js r186, one InstancedMesh per voxel group, Khronos Neutral tone mapping so brand colours stay true, RoomEnvironment light, one soft directional shadow. Rendering is on demand; it pauses offscreen and in hidden tabs. A slightly under-damped spring (about 0.8 s) settles the beam; new cubes drop into the pans. Reduced motion snaps to the position and draws one frame. Software rasterizers, failed contexts and slow first frames keep the flat SVG drawing of the same scale, which is also the placeholder while the chunk loads. The canvas is decorative; the market and both prices are text beside it.

## What changed and why

- **Venues.** Testnet reads markets, positions and quote history from the 67 realm; Practice keeps the illustrative questions and demo credits. A two-option switch in the header names the venue, the page head states it in one line, and practice surfaces carry a butter mark. Market links resolve to the venue that owns their ID, so a shared link never opens the wrong ledger.
- **Real source questions.** Testnet questions are four real Polymarket conditions with their exact wording and rules. No invented metrics: volume, trades and holders are the realm's own counters and appear only on Testnet.
- **Semantic colour.** Tomato is brand and the primary action. Green is Yes, blue is No, in every place they appear: entry buttons, selected ticket outcome, positions and trade history. Red is never No. Butter marks Practice. Caution amber marks retained data and blocked states.
- **No outlines.** Controls and panels are separated by fill and tone only: secondary buttons and chips sit on `--control`, the lead market and the ticket are `--panel` surfaces, fields inside a panel use the lighter `--field`. The selected outcome is a solid green or blue fill; selection in switches and filters is an ink fill. Lists are ordered by rhythm and alignment with a hover tint, not hairlines; page sections are separated by space. The only stroke left is the keyboard focus ring (`:focus-visible`), which mouse and touch users never see and keyboard users need.
- **Market page.** Question, facts, Yes price and quote history lead the wide column; the ticket is a sticky panel on the right from 1024px. Below 1024px the ticket follows the chart and a fixed Buy Yes / Buy No bar hands over to it; the bar hides before it could cover the ticket or footer.
- **Chart.** Testnet quotes are published fixed prices, so history is drawn as steps on a time axis from listing to the latest block, with round-percentage gridlines and an accessible table of every published quote. Practice samples stay undated and say so.
- **Ticket.** Outcome, amount with unit, quick amounts, shares, exact cost and payout, one primary action whose label follows the state (Connect Adena, Switch to Onyx testnet, Review trade). Review shows exact ugnot, the contract path and that the contract refuses any other price. Results are confirmed from contract state, never from the wallet response alone.
- **Copy.** House rules: sentence case, no `A · B · C` strings, no decorative numbering or badges. Practice disclaimers appear once per surface instead of on every component.

## Type and geometry

Instrument Sans throughout. Market questions use the condensed width (wdth 75) at 34–58px for the lead and 28–52px on the market page; list questions 18px regular width; data 14–15px with tabular figures. Panels 14–16px radius, controls 8–10px, touch targets at least 44px. Desktop margins 40px, tablet 24px, phone 16px.

## Verification contract

Three routes, both venues, at 320, 390, 768, 1024, 1440 and 1920px; 320px with every computed font size doubled; keyboard focus and reduced motion; wallet missing, connecting, wrong network, connected; trade review, rejection, contract refusal, quote change, unknown result and reconciliation; claim. Results are recorded in QA.md.


# Direction V4 (history): Six Seven, quieter trading

Owner direction: preserve the playful six-seven identity, move closer to a crypto exchange, remove distracting characters and oversized quotes, and remove fixture-provenance jargon from market pages. This amendment supersedes V3 stage composition.

## Concept and references

A compact place to take a side on a precisely worded question. Humor stays in the original67 wordmark and occasional nontransactional copy. Questions, prices, review and settlement stay literal. REFERENCES.md supplies the opened sources: REF-3 trading comprehension, REF-4 outcome/settlement separation, REF-1 alignment and REF-5 Instrument Sans. REF-7 informed the playful identity; its cartoon stage no longer belongs in the trading surface. No external brand tokens or identity are copied.

## System

Preserve Instrument Sans, warm off-white ground, ink, tomato wordmark and restrained butter action accents. The lead uses a neutral #FFFDF7 working surface,10px corner radius and a structural border. Desktop question type36–52px; quote60px, reducing through54/46/42px at narrower layouts. Units sit beside the quote. Character artwork remains in source but is absent from the trading stage. No decorative motion, particles, glass, gradients or badge rows.

## Composition and content

The exact question owns the lead, followed by deadline, bounded chart and Yes/No actions. Keep catalogue rows compact. Native wallet dialog shows address, actual network and exact GNOT balance; practice balance has a separate section. Detail places the ticket after the chart in DOM order, alongside content on desktop and in sequence on mobile. Retain full rules text. Plain source guidance replaces Inspect fixture provenance; a documentation link is not evidence for a real condition.

## PLAN / DELIVERY contract

Hierarchy comes from content, alignment and numeric scale. Remove characters from data, verbose probability labels and developer-only disclosure. Preserve44px touch controls, visible focus, native Escape/focus return and reduced motion. Inspect all three routes at320/390/688/704/1024/1440 and relevant boundaries, including wallet missing/connected/denied/wrong-network/timeout states. Source and rendered anti-AI review must agree.

## Operating mode

Practice trades remain browser-local. Adena connects a real account read-only. The gateway reads public Onyx/Polymarket data. Contract source and unsigned oracle proposals are separate; deployment and real signed trading are not claimed. Never relabel practice credits as GNOT or bind illustrative questions to similarly worded real conditions.

## Portfolio refinement, October 11

Source: owner's annotated Portfolio screenshot and explicit Polymarket/Kalshi references, REF-3 and REF-8 below. Job: compare held outcomes, cost, current quoted value and recorded payouts, then open the market. Dominant device: aligned compact financial columns around exact binary questions. The drawn tomato 67 remains the identity; the working area stays quiet. Retain the existing Instrument Sans and palette, with semantic Yes/No colors.

Choose a compact ledger over the previous essay-like grouped blocks. Desktop: 36px heading, four flat balance measures, Positions/Activity view controls, lifecycle filters, then aligned Market / Position / Cost / Current value / Payout columns. Question titles are15px. Group headings remain small structural labels; remove repeated explanatory paragraphs. Mobile: 27–30px heading, two balance columns, full question with a two-by-two financial grid below; keep every question link and control at least44px. No decorative charts, fabricated returns, asset logos or unsupported Sell/Deposit buttons.

Activity is a separate working view for actual confirmed practice purchases; examples never enter that ledger. Preserve source finality versus credited payout. GNOT does not enter the demo valuation. No new motion layer.

Craft review refinement: compact the disconnected practice notice and repeated summary captions so the first held question, Position and Cost remain visible at 390×844. Keep the filter result count as a screen-reader announcement rather than repeating the same visible count. Ticket, catalogue and captured review use the same decimal demo-credit quote; do not use an undefined cent symbol. Move transaction-test controls into the existing Demo controls dialog. Their per-market setting is tab-local memory, cleared by reset or reload, and never enters financial storage.

PLAN gate: reference lock is REF-3/REF-8 and the owner screenshot. Screenshot identity is the original67 plus the question/outcome ledger; generic statistic tiles, giant display questions, yellow summary panel and repeated prose are removed. Standard financial columns are intentional because comparison is the task. No floating cards, status decoration, invented metadata or ornamental icons.
