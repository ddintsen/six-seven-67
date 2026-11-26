// The reel: every frame is a pure function of t. reel/render.mjs calls
// window.__reel.seek(t) for each frame and records the page.
import './reel.css';
import { createWorld } from './world';
import type { ForestState, MarkState, PileCube, View } from './world';
import { createInserts, createOverlay, inOut } from './overlay';
import {
  BASE, DURATION, FIRST_FALL, FPS, MARK_CUBES, MARK_FALL, PILE_FALL, PILE_MOVES, PILE_RISE, PRICES, clock, cues, priceAt, sceneAt, storyProgress,
} from './timeline';

// ?scale=0.5 renders the 3D at half size for quick previews; the stage keeps
// its 1920 x 1080 layout.
const SCALE = Number(new URLSearchParams(location.search).get('scale') || 1);
// ?layer=3d records the sets alone, ?layer=type the type alone on a
// transparent page; reel/build.sh composites the two, so type can change
// without redrawing the 3D.
const LAYER = new URLSearchParams(location.search).get('layer') ?? 'both';
if (LAYER === 'type') document.documentElement.classList.add('layer-type');
if (LAYER === '3d') document.documentElement.classList.add('layer-3d');
const W = Math.round(1920 * SCALE);
const H = Math.round(1080 * SCALE);
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const query = new URLSearchParams(location.search);
const world = createWorld(canvas, W, H, { antialias: query.get('aa') !== '0', shadows: query.get('shadows') !== '0' });
const overlay = createOverlay(document.getElementById('overlay') as HTMLElement);
const inserts = createInserts(document.getElementById('overlay') as HTMLElement);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInQuad = (t: number) => t * t;
const easeInCubic = (t: number) => t * t * t;
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
function lerpView(a: View, b: View, t: number): View {
  return {
    yaw: lerp(a.yaw, b.yaw, t), pitch: lerp(a.pitch, b.pitch, t), distance: lerp(a.distance, b.distance, t),
    target: [lerp(a.target[0], b.target[0], t), lerp(a.target[1], b.target[1], t), lerp(a.target[2], b.target[2], t)],
    fov: lerp(a.fov, b.fov, t), shiftX: lerp(a.shiftX, b.shiftX, t), shiftY: lerp(a.shiftY, b.shiftY, t),
  };
}
const span = (t: number, start: number, end: number) => clamp01((t - start) / (end - start));

// ---------------------------------------------------------------- mark
const MARK_VIEWS = {
  open: { yaw: 0.62, pitch: 0.34, distance: 34, target: [0, 2.95, 0], fov: 22, shiftX: 0.215, shiftY: 0.01 } as View,
  close: { yaw: 0.5, pitch: 0.28, distance: 31, target: [0, 2.95, 0], fov: 22, shiftX: 0.215, shiftY: 0.01 } as View,
  endA: { yaw: 0.48, pitch: 0.27, distance: 31, target: [0, 2.95, 0], fov: 22, shiftX: 0.215, shiftY: 0.01 } as View,
  endB: { yaw: 0.36, pitch: 0.32, distance: 33, target: [0, 2.95, 0], fov: 22, shiftX: 0.215, shiftY: 0.01 } as View,
};
function markView(t: number) {
  return t < 52 ? lerpView(MARK_VIEWS.open, MARK_VIEWS.close, inOut(span(t, 0, 8))) : lerpView(MARK_VIEWS.endA, MARK_VIEWS.endB, inOut(span(t, 52, 60)));
}
function markState(t: number): MarkState {
  const ending = t >= 52;
  const cubes = MARK_CUBES.map(cube => {
    let y = 0;
    let scale = 1;
    let glow = 1;
    if (!ending) {
      const fall = cube === MARK_CUBES[0] ? FIRST_FALL : MARK_FALL;
      const fallStart = cube.lands - fall;
      if (t < fallStart) scale = 0;
      else if (t < cube.lands) { y = 7.5 * (1 - easeInQuad((t - fallStart) / fall)); glow = 0.12; }
      else {
        const since = t - cube.lands;
        // A small give on landing, then the core lights.
        y = since < 0.14 ? -0.05 * Math.sin(Math.PI * since / 0.14) : 0;
        glow = 0.12 + 0.88 * expoOut(clamp01(since / 0.55));
      }
    } else if (t >= cube.leaves) {
      const u = clamp01((t - cube.leaves) / 0.62);
      y = 8 * easeInCubic(u);
      glow = 1 - u * 0.7;
      if (u >= 1) scale = 0;
    }
    return { cell: cube.cell, side: cube.side, y, scale, glow };
  });
  const light = (side: 'yes' | 'no') => {
    const own = cubes.filter(cube => cube.side === side);
    return own.reduce((sum, cube) => sum + (cube.scale > 0 ? cube.glow : 0), 0) / own.length;
  };
  return { view: markView(t), cubes, light: [light('yes'), light('no')] };
}

// ---------------------------------------------------------------- forest
// The beam follows the price with the site's under-damped spring.
function tiltAt(t: number) {
  const MAX_TILT = 0.38;
  const w = 7.5, zeta = 0.62, dt = 1 / 240;
  let x = 0, v = 0;
  for (let s = 8; s < t; s += dt) {
    const target = (2 * priceAt(s) - 1) * MAX_TILT;
    const a = -2 * zeta * w * v - w * w * (x - target);
    v += a * dt;
    x += v * dt;
  }
  return x;
}
function pilesAt(t: number): [PileCube[], PileCube[]] {
  return (['yes', 'no'] as const).map(side => {
    const cubes: (PileCube | null)[] = [];
    for (let i = 0; i < BASE; i++) cubes[i] = { offset: 0, scale: 1 };
    for (const move of PILE_MOVES) {
      if (move.side !== side) continue;
      if (move.kind === 'in') {
        const start = move.at - PILE_FALL;
        if (t < start) continue;
        const u = clamp01((t - start) / PILE_FALL);
        cubes[move.index] = { offset: 0.62 * (1 - easeInQuad(u)), scale: 1 };
      } else if (t >= move.at) {
        const u = clamp01((t - move.at) / PILE_RISE);
        cubes[move.index] = u >= 1 ? null : { offset: 0.7 * easeInCubic(u), scale: 1 - 0.7 * u };
      }
    }
    let count = cubes.length;
    while (count > 0 && !cubes[count - 1]) count--;
    return Array.from({ length: count }, (_, i) => cubes[i] ?? { offset: 0, scale: 0 });
  }) as [PileCube[], PileCube[]];
}
const FOREST_VIEWS = {
  high: { yaw: 0.55, pitch: 0.95, distance: 11.2, target: [0, 0.9, 0], fov: 26, shiftX: 0.24, shiftY: 0 } as View,
  near: { yaw: 0.38, pitch: 0.76, distance: 10.4, target: [0, 0.85, 0], fov: 26, shiftX: 0.3, shiftY: 0 } as View,
  priceA: { yaw: 0.27, pitch: 0.5, distance: 7.9, target: [0, 1.12, 0], fov: 26, shiftX: 0.19, shiftY: 0.02 } as View,
  priceB: { yaw: 0.1, pitch: 0.45, distance: 7.2, target: [0, 1.12, 0], fov: 26, shiftX: 0.19, shiftY: 0.02 } as View,
  rise: { yaw: 0.2, pitch: 0.62, distance: 10, target: [0, 0.6, 0], fov: 26, shiftX: 0.2, shiftY: 0 } as View,
  land: { yaw: 0.72, pitch: 0.8, distance: 22, target: [0, -0.2, 0], fov: 26, shiftX: 0.18, shiftY: -0.02 } as View,
};
function forestView(t: number): View {
  if (t < 16) return lerpView(FOREST_VIEWS.high, FOREST_VIEWS.near, inOut(span(t, 8, 12)));
  if (t < 28) return lerpView(FOREST_VIEWS.priceA, FOREST_VIEWS.priceB, span(t, 16, 28));
  return lerpView(FOREST_VIEWS.rise, FOREST_VIEWS.land, inOut(span(t, 48, 52)));
}
function forestState(t: number): ForestState {
  const view = forestView(t);
  const tilt = tiltAt(t);
  return {
    view, time: t, tilt, glowYes: clamp01(0.5 + tilt / (2 * 0.38)), piles: pilesAt(t),
    // Close shots fade the far woods into the night; the last shot pulls back
    // until the whole land floats clear of the fog.
    fog: t >= 48 ? [lerp(view.distance - 1.2, view.distance + 6, span(t, 48, 51)), lerp(view.distance + 6, view.distance + 40, span(t, 48, 51))] : [view.distance - 1.2, view.distance + 6.5],
  };
}

// ---------------------------------------------------------------- story
function storyState(t: number) {
  const u = span(t, 28, 44);
  const fitted = world.fitStory(lerp(0.62, 0.26, u), lerp(0.64, 0.52, u), 0.8, 28);
  return { view: { ...fitted, shiftX: 0.2, shiftY: 0.015 }, time: t, p: storyProgress(t) };
}

// ---------------------------------------------------------------- frame
// T is film time. The sets and the type of the first cut run on its own clock
// (see clock() in timeline.ts); an interface shot clears the sets.
function seek(T: number) {
  const at = clock(T);
  const draw = LAYER !== 'type';
  if (at.insert) {
    if (draw) world.clear();
    if (LAYER !== '3d') { overlay.seek(-1, null); inserts.seek(at.insert, at.local); }
    return;
  }
  if (LAYER !== '3d') inserts.seek(null, 0);
  const t = at.t;
  const scene = sceneAt(t);
  let anchor: { x: number; y: number; width: number } | null = null;
  if (scene.name === 'mark' || scene.name === 'end') {
    const state = markState(t);
    if (draw) world.renderMark(state);
    if (t >= 6.9) {
      const [x, y, width] = world.markAnchor(state.view);
      anchor = { x: x * 1920, y: y * 1080, width: width * 1920 };
    }
  } else if (!draw) {
    // The type layer needs no 3D.
  } else if (scene.name === 'forest' || scene.name === 'price' || scene.name === 'gno') {
    world.renderForest(forestState(t));
  } else if (scene.name === 'calls') {
    world.renderStory(storyState(t));
  } else {
    world.clear();
  }
  if (LAYER !== '3d') overlay.seek(t, anchor);
}

declare global { interface Window { __reel: { ready: boolean; fps: number; duration: number; cues: ReturnType<typeof cues>; prices: typeof PRICES; seek(t: number): Promise<void> } } }
window.__reel = {
  ready: false, fps: FPS, duration: DURATION, cues: cues(), prices: PRICES,
  async seek(t: number) {
    seek(t);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  },
};

async function boot() {
  await Promise.all([
    document.fonts.load("640 100px 'Handjet'"),
    document.fonts.load("420 40px 'IBM Plex Sans'"),
    document.fonts.load("620 40px 'IBM Plex Sans'"),
    document.fonts.load("400 30px 'IBM Plex Mono'"),
    document.fonts.load("600 30px 'IBM Plex Mono'"),
  ]);
  await document.fonts.ready;
  await inserts.ready();
  // Compile every set once before the first recorded frame.
  for (const t of [1, 10, 34, 53]) seek(t);
  const start = new URLSearchParams(location.search).get('t');
  seek(start ? Number(start) : 0);
  window.__reel.ready = true;
}
void boot();
