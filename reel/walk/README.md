# Walkthrough film

A 52-second film of how 67 works, for the owner's portfolio. The real interface plays live in a window, with big captions in a column beside it and the showreel's groove underneath. It is 1920 × 1080 at 30 fps, H.264 with AAC.

- `docs/reel/WALKTHROUGH.md` has the script, the shot list and the decisions.
- The finished files go to `previews/reel/`: `67-walkthrough.mp4`, `-poster.png`, `.en.srt` and `.en.vtt`.
- Version 1 (100 s, still screens) is in `_to_delete/walkthrough-v1/`.

The film is three layers, put together by `build.sh`:

1. **Screen** (`out/screen.mp4`, 1272 × 984). The app recorded frame by frame by `record.spec.ts`:
   - The mouse and keyboard are real, so you see real hover states, presses, typing and dialogs.
   - CSS transitions are stepped on the film's clock.
   - The camera is a zoomed clip rendered at its own scale.
   - The pointer is an element in the page's top layer.
2. **Type** (`out/type.mov`, 1920 × 1080 with alpha). `index.html`, `overlay.ts` and `overlay.css` draw the film's ground around a rounded window, the captions, the robot's card and the end card, rendered by `reel/render.mjs --layer type`.
3. **Sound** (`out/score.wav`). `music.py` synthesizes the score from the type layer's cues (`cues.json`: captions, the robot's lines, the end) and the recorder's cues (`record.json`: presses, the keystroke, confirmations, cuts). It reuses the showreel's voices from `reel/music.py`.

| File | What it does |
| --- | --- |
| `film.ts` | The timeline shared by all three: the window, the parts, the captions and their notes, the robot's run, the end |
| `record.spec.ts`, `pw.config.ts` | The screen layer. Live parts read Onyx, Polymarket and gnoweb as they are; the trade, claim and oracle parts run on the e2e stand-in with the real Cowboys vs. Packers market. `WALK_ONLY=live\|trade\|status\|gnoweb` records one part alone for checks |
| `overlay.ts`, `overlay.css`, `index.html` | The type layer; `?t=12` opens it at a moment, `?film=000000` tries another ground |
| `music.py` | The score |
| `captions.ts` | Writes the SRT and VTT from `film.ts` |
| `build.sh` | `record`, `type`, `sound`, `mux`, `poster`, or `all` |

## Build

```sh
npm run dev                         # the app and the type layer at http://127.0.0.1:6767
bash reel/walk/build.sh all         # about 2 min to record, 3 min for the type layer, 1 min for sound and mux
node --experimental-strip-types reel/walk/captions.ts
```

Live parts change with the data: the market list, prices and the number of markets are whatever Onyx and Polymarket hold at recording time. Re-record before each delivery and look at the frames around every cut.

Do not edit files under `reel/` while the type layer renders: the dev server reloads the page and the frames break.

## Changing it

- **Captions:** `CAPTIONS` in `film.ts`. Lines are broken by meaning and no wider than 448 px at the computed size (the longest line sets the size for all of them). Re-render the type layer, then rerun the sound and the captions.
- **Actions and timing:** `record.spec.ts` is written as a timeline. `await f.until(t)` captures frames up to `t`, and the calls after it start at `t`: `moveTo`, `click`, `key`, `camTo`, `scrollTo`. Keep presses on beats (multiples of 0.5 s) and cuts on bars (2 s).
- **Framing:** keep the action inside the window at the chosen zoom. Pages as wide as the window stay at 1.0, and wider boxes use `f.fit(...)`, which aligns them by the left edge.
