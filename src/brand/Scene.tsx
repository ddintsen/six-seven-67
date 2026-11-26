import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DEPTH, GLASS, UNIT } from './BrandMark';

// Story pictures drawn in the language of the mark: the same oblique glass
// blocks, laid out as block art. A scene is a list of parts; each part is a
// small grid of characters, one block per character, so a picture can be
// read (and corrected) in the source like the blocks it draws.

interface Glass { top: string; front: string; inner: string; side: string }

export const TONES: Record<string, Glass> = {
  y: GLASS.yes,
  n: GLASS.no,
  c: GLASS.clear,
  // Frost: the light glass of Practice and of GNOT itself.
  f: { top: '#F4F7F6', front: '#A9B5B0', inner: '#C9D2CE', side: '#76837E' },
  // Ground: slabs and plinths, a step above the page.
  g: { top: '#2E3835', front: '#171D1B', inner: '#1D2422', side: '#101513' },
  // Light: a lit block (the oracle's lantern, a paid coin).
  w: { top: '#FFFFFF', front: '#DCE4E0', inner: '#F4F7F6', side: '#A7B3AE' },
};

export interface Part {
  rows: readonly string[];
  x?: number;
  y?: number;
  scale?: number;
  // Hook for a part's own motion (a ray that travels, coins that drop).
  className?: string;
  // Extra entrance delay for the whole part, in ms.
  delay?: number;
}

export interface SceneData {
  parts: readonly Part[];
}

interface Block { key: string; x: number; y: number; size: number; glass: Glass; row: number; col: number; order: number }

function blocks(part: Part) {
  const size = part.scale ?? 1;
  const out: Block[] = [];
  part.rows.forEach((line, row) => {
    [...line].forEach((char, col) => {
      const glass = TONES[char];
      if (!glass) return;
      out.push({ key: `${row}-${col}`, x: (part.x ?? 0) + col * size, y: (part.y ?? 0) + row * size, size, glass, row, col, order: 0 });
    });
  });
  // Painter's order, as in the mark: lower rows first, then left to right.
  out.sort((a, b) => b.row - a.row || a.col - b.col);
  out.forEach((block, index) => { block.order = index; });
  return out;
}

function faces({ x, y, size, glass }: Block) {
  const gap = 0.8 * size;
  const s = UNIT * size - gap;
  const d = DEPTH * size;
  const px = x * UNIT + gap / 2;
  const py = y * UNIT + gap / 2 + DEPTH;
  return [
    { d: `M${px} ${py}h${s}l${d} ${-d}h${-s}z`, fill: glass.top },
    { d: `M${px + s} ${py}l${d} ${-d}v${s}l${-d} ${d}z`, fill: glass.side },
    { d: `M${px} ${py}h${s}v${s}h${-s}z`, fill: glass.front },
    ...(size >= 0.75 ? [{ d: `M${px + d} ${py}h${s - d}v${s - d}h${d - s}z`, fill: glass.inner }] : []),
  ];
}

// Faces of one kind never overlap within a row, so a row can be drawn as
// sides, then tops, then fronts, then inner fields, one path per colour, and
// still cover exactly as the block-by-block painter's order would.
const FACE_ORDER = [1, 0, 2, 3];
function mergeRow(row: Block[]) {
  const paths = new Map<string, { key: string; d: string; fill: string }>();
  for (const type of FACE_ORDER) {
    for (const block of row) {
      const face = faces(block)[type];
      if (!face) continue;
      const key = `${type}-${face.fill}`;
      const path = paths.get(key);
      if (path) path.d += face.d;
      else paths.set(key, { key, d: face.d, fill: face.fill });
    }
  }
  return [...paths.values()];
}

// Pictures below the fold build themselves once, bottom row first, when they
// scroll in. Anything already on screen, and reduced motion, shows at rest.
// Separately, a picture is "live" while it is on screen: its signal runs one
// pass each time it comes into view, so nothing moves for more than about
// five seconds on its own (WCAG 2.2.2).
function useReveal() {
  const ref = useRef<SVGSVGElement>(null);
  const [state, setState] = useState<'rest' | 'armed' | 'in'>('rest');
  const [live, setLive] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const seen = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting), { rootMargin: '0px 0px -12% 0px' });
    seen.observe(node);
    if (node.getBoundingClientRect().top < window.innerHeight * 0.92) return () => seen.disconnect();
    setState('armed');
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setState('in');
    }, { rootMargin: '0px 0px -12% 0px' });
    observer.observe(node);
    return () => { observer.disconnect(); seen.disconnect(); };
  }, []);
  return [ref, state, live] as const;
}

export function Scene({ scene, className = '' }: { scene: SceneData; className?: string }) {
  const [ref, state, live] = useReveal();
  const parts = scene.parts.map(part => ({ part, list: blocks(part) }));
  // The picture is framed to its blocks, faces included.
  const all = parts.flatMap(item => item.list);
  const left = Math.min(...all.map(b => b.x * UNIT));
  const top = Math.min(...all.map(b => b.y * UNIT + DEPTH - DEPTH * b.size));
  const right = Math.max(...all.map(b => (b.x + b.size) * UNIT + DEPTH * b.size));
  const bottom = Math.max(...all.map(b => (b.y + b.size) * UNIT + DEPTH));
  const width = right - left;
  const height = bottom - top;
  return (
    // Every picture shares one block size (--cube), so blocks match from one
    // picture to the next; narrow screens scale a picture down to fit.
    <svg ref={ref} className={`scene is-${state}${live ? ' is-live' : ''} ${className}`} viewBox={`${left} ${top} ${width} ${height}`} aria-hidden="true" focusable="false"
      style={{ width: `calc(var(--cube) * ${(width / UNIT).toFixed(2)})` }}>
      {parts.map(({ part, list }, index) => {
        const lowest = Math.max(...list.map(block => block.row), 0);
        // A part with its own motion keeps one group per block, so a signal
        // can travel along it; a still part merges each row into a few paths.
        if (part.className) {
          return (
            <g key={index} className={part.className}>
              {list.map(block => (
                <g key={block.key} className="block"
                  style={{ '--d': `${(part.delay ?? 0) + (lowest - block.row) * 45 + block.col * 6}ms`, '--k': block.col + block.row } as CSSProperties}>
                  {faces(block).map((face, faceIndex) => <path key={faceIndex} d={face.d} fill={face.fill} />)}
                </g>
              ))}
            </g>
          );
        }
        const rows = new Map<number, Block[]>();
        for (const block of list) rows.set(block.row, [...(rows.get(block.row) ?? []), block]);
        return (
          <g key={index}>
            {[...rows].map(([row, members]) => (
              <g key={row} className="block" style={{ '--d': `${(part.delay ?? 0) + (lowest - row) * 45}ms` } as CSSProperties}>
                {mergeRow(members).map(path => <path key={path.key} d={path.d} fill={path.fill} />)}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
