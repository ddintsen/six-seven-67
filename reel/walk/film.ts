// The walkthrough film's timeline, shared by the recorder (record.spec.ts),
// the type layer (overlay.ts) and, through cues.json, the score (music.py).
// 120 BPM: a beat is 0.5 s, a bar 2 s. Times are seconds of film time.

export const FPS = 30;
export const FRAME = { width: 1920, height: 1080 };
// The live interface plays in a window on the right; the captions own the column on the left.
export const WINDOW = { x: 600, y: 48, width: 1272, height: 984, radius: 18 };
export const DURATION = 52;

// Where each part of the film starts (the recorder logs the exact cut frames).
export const PARTS = [
  { name: 'markets', from: 0 },
  { name: 'sports', from: 6 },
  { name: 'match', from: 10 },
  { name: 'trade', from: 14 },
  { name: 'claim', from: 26 },
  { name: 'status', from: 30 },
  { name: 'gnoweb', from: 36 },
  { name: 'robot', from: 42 },
  { name: 'end', from: 47 },
] as const;

// One caption at a time in the left column: a display line or two, and a short note under it.
export interface Caption { from: number; to: number; lines: string[]; note: string }
// Each caption leaves (0.35 s) before the next one rises in the same place.
const gap = (list: Caption[]) => list.map((c, i) => (i + 1 < list.length ? { ...c, to: Math.min(c.to, list[i + 1].from - 0.35) } : c));
export const CAPTIONS: Caption[] = gap([
  { from: 0.2, to: 2.9, lines: ['Real', 'questions'], note: 'From Polymarket, word for word: the question and its rules.' },
  { from: 3.0, to: 5.9, lines: ['Every open', 'market, live'], note: 'Polymarket’s other markets, mirrored below ours.' },
  { from: 6.0, to: 9.9, lines: ['Pick', 'a match'], note: 'In a match, the teams are the outcomes.' },
  { from: 10.0, to: 13.9, lines: ['Our price,', 'their line'], note: 'Green is 67’s quote. Grey is Polymarket over the last month.' },
  { from: 14.0, to: 16.4, lines: ['Connect', 'Adena'], note: 'The Gno.land wallet, on the Onyx testnet.' },
  { from: 16.5, to: 18.4, lines: ['Pick a side'], note: 'The buy button takes the side’s colour.' },
  { from: 18.5, to: 20.4, lines: ['See the fee', 'first'], note: 'Shares, fee and payout follow the amount.' },
  { from: 20.5, to: 23.4, lines: ['Sign once'], note: 'One call to the contract, signed in Adena.' },
  { from: 23.5, to: 25.9, lines: ['Confirmed', 'on chain'], note: 'The position is read back from the realm.' },
  { from: 26.0, to: 29.9, lines: ['Winners', 'claim 1 GNOT', 'a share'], note: 'Once the result is final.' },
  { from: 30.0, to: 32.9, lines: ['Results', 'from Polygon'], note: 'The oracle proposes what Polymarket settled on chain.' },
  { from: 33.0, to: 35.9, lines: ['Final after', '24 hours'], note: 'A guardian can cancel in the window. Then anyone makes it final.' },
  { from: 36.0, to: 41.6, lines: ['Public on', 'gno.land'], note: 'Rules, terms and quotes, rendered by the contract itself.' },
]);

// The robot's first live run on Vercel, 15 October 2026, from its function log.
export const ROBOT = {
  from: 42, to: 47,
  title: 'The robot',
  log: [
    ['k', 'robot   g13wgyakt05a202ekc09vk8mgdg9g4gdp6upxuna'],
    ['ok', 'ok      AcceptRole quoter'],
    ['ok', 'ok      AcceptRole lister'],
    ['ok', 'ok      CreateMarket  Will AC Milan win on 2026-10-15?'],
    ['ok', 'ok      Fund  3 GNOT'],
  ] as [string, string][],
  note: 'Six runs a day: it renews prices, pauses finished games, makes results final and lists new matches.',
  lineAt: (i: number) => 42.9 + i * 0.5,
};
export const END = { from: 47, to: DURATION, black: 51.3 };
