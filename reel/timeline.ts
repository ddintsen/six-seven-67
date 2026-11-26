// The reel's clock. 120 beats a minute: a beat is half a second, a bar two
// seconds, a sixteenth 0.125 s. Picture and music both read their times from
// here, so every cube lands on the note that plays it.
import { SEVEN, SIX } from '../src/brand/mark';
import type { Cell } from '../src/brand/mark';

export const FPS = 30;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const SIXTEENTH = BEAT / 4;
export const DURATION = 68;

// Version 2 adds two interface shots, two bars each, into the first cut.
// Every time below this block is on the first cut's 60-second clock; clock()
// turns film time into that clock (or into an insert and its own time), and
// film() turns a first-cut time into film time. So the 3D rendered for the
// first cut is reused as it was, and the score follows film time.
export type InsertName = 'ticket' | 'claim';
export const INSERTS: { name: InsertName; at: number; length: number }[] = [
  // After the market list: the ticket, the review, the confirmation.
  { name: 'ticket', at: 16, length: 4 },
  // After the four calls: the position on the portfolio, claimed.
  { name: 'claim', at: 44, length: 4 },
];
export type Clock = { t: number; insert: null; local: 0 } | { t: number; insert: InsertName; local: number };
export function clock(T: number): Clock {
  let offset = 0;
  for (const insert of INSERTS) {
    const start = insert.at + offset;
    if (T < start) break;
    if (T < start + insert.length) return { t: insert.at, insert: insert.name, local: T - start };
    offset += insert.length;
  }
  return { t: T - offset, insert: null, local: 0 };
}
export function film(t: number): number {
  let T = t;
  for (const insert of INSERTS) if (t >= insert.at) T += insert.length;
  return T;
}
export function insertStart(name: InsertName): number {
  let offset = 0;
  for (const insert of INSERTS) {
    if (insert.name === name) return insert.at + offset;
    offset += insert.length;
  }
  throw new Error(name);
}
// What happens inside each insert, in its own seconds (bars start at 0 and 2).
export const TICKET = { review: 1.5, reviewPress: 1.25, confirmed: 2.75, confirmPress: 2.5 };
export const CLAIM = { press: 1.5, claimed: 1.75 };

export type SceneName = 'mark' | 'forest' | 'ui' | 'price' | 'calls' | 'code' | 'gno' | 'end';
export const SCENES: [SceneName, number, number][] = [
  ['mark', 0, 8],
  ['forest', 8, 12],
  ['ui', 12, 16],
  ['price', 16, 28],
  ['calls', 28, 44],
  ['code', 44, 48],
  ['gno', 48, 52],
  ['end', 52, 60],
];
export function sceneAt(t: number): { name: SceneName; start: number; end: number } {
  for (const [name, start, end] of SCENES) if (t < end) return { name, start, end };
  const [name, start, end] = SCENES[SCENES.length - 1];
  return { name, start, end };
}

// The mark builds like a wall, bottom row first; the 6 in Yes glass, then
// the 7 in No glass. The first cube lands alone, then the rest of the 6 on
// sixteenths, the word "Six." on the downbeat, the 7, then "Seven.".
const bottomUp = (cells: readonly Cell[]) => [...cells].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
export interface MarkCube { cell: Cell; side: 'yes' | 'no'; lands: number; leaves: number }
export const MARK_CUBES: MarkCube[] = [
  ...bottomUp(SIX).map((cell, k) => ({ cell, side: 'yes' as const, lands: k === 0 ? 1 : 2.5 + (k - 1) * SIXTEENTH, leaves: 0 })),
  ...bottomUp(SEVEN).map((cell, k) => ({ cell, side: 'no' as const, lands: 4.5 + k * SIXTEENTH, leaves: 0 })),
];
// In the last scene the cubes leave again, top first, one per sixteenth.
[...MARK_CUBES].reverse().forEach((cube, k) => { cube.leaves = 56 + k * SIXTEENTH; });
export const MARK_FALL = 0.42;
// The first cube falls for a whole second, so the film opens on movement.
export const FIRST_FALL = 1;

// The interface: the four bound markets at their opening quotes, as the
// Testnet venue lists them. The Yes of the first is chosen on the beat.
export const UI_MARKETS: [string, number][] = [
  ['Will Bitcoin outperform Gold in 2026?', 0.42],
  ['SpaceX Starship fully reusable before 2027?', 0.34],
  ['Will Apple release a new product line before 2027?', 0.79],
  ['Another Fed rate hike in 2026?', 0.75],
];
export const UI_TAP = 14;

// The market in the forest: Bitcoin against gold, priced 0.42 for Yes, then
// the quote moves three times. One cube per sixteenth of a GNOT price.
export const QUESTION = 'Will Bitcoin outperform Gold in 2026?';
export const PRICES: [number, number][] = [[0, 0.5], [16.5, 0.42], [22, 0.47], [24, 0.56], [26, 0.61]];
export function priceAt(t: number) {
  let price = PRICES[0][1];
  for (const [at, value] of PRICES) if (t >= at) price = value;
  return price;
}
export const PILE_MAX = 16;
export const BASE = 4;
// Every cube that enters or leaves a pan, in time order. Indices count up in
// the pan's pile order (see src/landing/voxels.ts PILE).
export interface PileMove { at: number; side: 'yes' | 'no'; index: number; kind: 'in' | 'out' }
export const PILE_MOVES: PileMove[] = [
  { at: 17.0, side: 'no', index: 4, kind: 'in' },
  { at: 17.125, side: 'yes', index: 4, kind: 'in' },
  { at: 17.25, side: 'no', index: 5, kind: 'in' },
  { at: 17.375, side: 'no', index: 6, kind: 'in' },
  { at: 17.5, side: 'yes', index: 5, kind: 'in' },
  { at: 17.625, side: 'no', index: 7, kind: 'in' },
  { at: 17.75, side: 'yes', index: 6, kind: 'in' },
  { at: 17.875, side: 'no', index: 8, kind: 'in' },
  // 0.47: a No cube rises, a Yes cube falls; the beam levels.
  { at: 22.0, side: 'no', index: 8, kind: 'out' },
  { at: 22.25, side: 'yes', index: 7, kind: 'in' },
  // 0.56: past the middle, the balance turns to Yes.
  { at: 24.0, side: 'no', index: 7, kind: 'out' },
  { at: 24.25, side: 'yes', index: 8, kind: 'in' },
  // 0.61.
  { at: 26.0, side: 'no', index: 6, kind: 'out' },
  { at: 26.25, side: 'yes', index: 9, kind: 'in' },
];
export const PILE_FALL = 0.32;
export const PILE_RISE = 0.36;

// The four calls on the floating plot. Progress p runs 0–4 (see
// src/landing/storyScene.ts); each call's window is placed so the story's own
// easing lands the cubes and the departures on the beat grid.
export const CALL_WINDOWS: [number, number][] = [
  [28.15, 31.15],
  [32.11, 32.11 + (SIXTEENTH * 16) / 0.82],
  [35.85, 38.85],
  [40.0, 43.0],
];
export function storyProgress(t: number) {
  let p = 0;
  CALL_WINDOWS.forEach(([start, end], index) => {
    if (t >= end) p = index + 1;
    else if (t > start) p = index + (t - start) / (end - start);
  });
  return p;
}
// When each of the sixteen cubes lands in the Buy step: 32.5 s, then one per
// sixteenth, in the story's arrival order.
export const STORY_ARRIVALS: ('yes' | 'no')[] = ['yes', 'no', 'yes', 'no', 'yes', 'yes', 'no', 'yes', 'no', 'yes', 'no', 'yes', 'no', 'yes', 'no', 'yes'];
export const STORY_LANDINGS = STORY_ARRIVALS.map((side, k) => ({ at: 32.5 + k * SIXTEENTH, side }));
// Claim: the nine winning cubes leave one per eighth from 40 s.
export const STORY_CLAIMS = Array.from({ length: 9 }, (_, k) => 40 + k * BEAT / 2);

export const CODE_HIGHLIGHTS = [44.5, 45.5, 46.5];

// Every sound the score must hit, for reel/music.py, in film time.
export interface Cue { at: number; kind: string; side?: 'yes' | 'no'; index?: number }
export function cues(): Cue[] {
  const out: Cue[] = [];
  const add = (t: number, kind: string, extra: Partial<Cue> = {}) => out.push({ at: film(t), kind, ...extra });
  MARK_CUBES.forEach((cube, index) => add(cube.lands, 'mark-land', { side: cube.side, index }));
  MARK_CUBES.forEach((cube, index) => add(cube.leaves, 'mark-leave', { side: cube.side, index }));
  add(UI_TAP, 'tap', { side: 'yes' });
  add(4, 'word', { side: 'yes' });
  add(6, 'word', { side: 'no' });
  add(7, 'word');
  for (const [name, start] of SCENES) add(start, `scene-${name}`);
  PILE_MOVES.forEach((move, index) => add(move.at, move.kind === 'in' ? 'pile-land' : 'pile-rise', { side: move.side, index }));
  PRICES.slice(2).forEach(([at]) => add(at, 'quote'));
  add(30.75, 'seal');
  STORY_LANDINGS.forEach((landing, index) => add(landing.at, 'story-land', { side: landing.side, index }));
  add(36, 'oracle');
  STORY_CLAIMS.forEach((at, index) => add(at, 'claim', { index }));
  CODE_HIGHLIGHTS.forEach((at, index) => add(at, 'check', { index }));
  add(54, 'continued');
  // The interface shots.
  const ticket = insertStart('ticket');
  out.push({ at: ticket, kind: 'scene-ticket' }, { at: ticket, kind: 'ui-in' });
  out.push({ at: ticket + TICKET.reviewPress, kind: 'press' }, { at: ticket + TICKET.review, kind: 'ui-cut' });
  out.push({ at: ticket + TICKET.confirmPress, kind: 'press' }, { at: ticket + TICKET.confirmed, kind: 'confirmed' });
  const claim = insertStart('claim');
  out.push({ at: claim, kind: 'scene-claim' }, { at: claim, kind: 'ui-in' });
  out.push({ at: claim + CLAIM.press, kind: 'press' }, { at: claim + CLAIM.claimed, kind: 'claimed' });
  return out.sort((a, b) => a.at - b.at);
}
