import { MARK_COLUMNS, MARK_ROWS, SEVEN, SIX } from './mark';
import type { Cell } from './mark';

// Flat drawing of the glass blocks in oblique view: a lit top face, a dark
// side face, and a front face whose lighter inner field is the back of the
// cube seen through the glass. The 6 is the Yes glass, the 7 the No glass.
interface Glass { top: string; front: string; inner: string; side: string }
export const GLASS: Record<'yes' | 'no' | 'clear', Glass> = {
  yes: { top: '#8FE6BD', front: '#1D7A52', inner: '#2FA472', side: '#124D34' },
  no: { top: '#B4C8FF', front: '#2C4FC0', inner: '#4A71E6', side: '#1C3485' },
  clear: { top: '#A7B8B1', front: '#29332F', inner: '#38453F', side: '#1A2220' },
};

export const UNIT = 10;
const GAP = 0.8;
export const DEPTH = 3.2;
export const MARK_VIEWBOX = `0 0 ${MARK_COLUMNS * UNIT + DEPTH} ${MARK_ROWS * UNIT + DEPTH}`;

// Painter's order: lower rows first, then left to right, so each cube covers
// the faces of the cubes behind it.
export function order(cells: readonly Cell[]) {
  return [...cells].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

export function cubePaths([col, row]: Cell, glass: Glass, simple = false) {
  const s = UNIT - GAP;
  const x = col * UNIT + GAP / 2;
  const y = row * UNIT + GAP / 2 + DEPTH;
  const d = DEPTH;
  return [
    { d: `M${x} ${y}h${s}l${d} ${-d}h${-s}z`, fill: glass.top },
    { d: `M${x + s} ${y}l${d} ${-d}v${s}l${-d} ${d}z`, fill: glass.side },
    { d: `M${x} ${y}h${s}v${s}h${-s}z`, fill: glass.front },
    ...(simple ? [] : [{ d: `M${x + d} ${y}h${s - d}v${s - d}h${d - s}z`, fill: glass.inner }]),
  ];
}

function cubes(simple: boolean) {
  return [
    ...order(SIX).flatMap(cell => cubePaths(cell, GLASS.yes, simple)),
    ...order(SEVEN).flatMap(cell => cubePaths(cell, GLASS.no, simple)),
  ];
}

export function Mark({ className = 'mark', title = '67', simple = false }: { className?: string; title?: string | null; simple?: boolean }) {
  return (
    <svg className={className} viewBox={MARK_VIEWBOX} role={title ? 'img' : undefined}
      aria-label={title ?? undefined} aria-hidden={title ? undefined : true} focusable="false">
      {cubes(simple).map((path, index) => <path key={index} d={path.d} fill={path.fill} />)}
    </svg>
  );
}

// Static markup for the favicon (simple faces, dark tile).
export function markSvg(background = '#0B0E0D') {
  const pad = 9;
  const w = MARK_COLUMNS * UNIT + DEPTH + pad * 2;
  const h = w;
  const offsetY = (h - (MARK_ROWS * UNIT + DEPTH)) / 2;
  const body = cubes(true).map(path => `<path d="${path.d}" fill="${path.fill}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="14" fill="${background}"/><g transform="translate(${pad} ${offsetY})">${body}</g></svg>`;
}

// The trademark sign drawn in the same block language: T and M on a 3×5 and
// 5×5 pixel grid, each pixel a fifth of a block, so the sign is exactly one
// block tall and hangs beside the 6's top row. Kept outside the mark's box so
// the 67 stays optically centred where it is a fulcrum.
const TM_ROWS = [
  '###.#...#',
  '.#..##.##',
  '.#..#.#.#',
  '.#..#...#',
  '.#..#...#',
];
export function TradeMark() {
  const pixels = TM_ROWS.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '#' ? [[x, y]] : [])));
  return (
    <svg className="tm" viewBox="0 0 9 5" aria-hidden="true" focusable="false">
      {pixels.map(([x, y]) => <rect key={`${x}-${y}`} x={x + 0.09} y={y + 0.09} width={0.82} height={0.82} fill="currentColor" />)}
    </svg>
  );
}

// The mark as the brand signs it: 67 with its trademark sign.
export function BrandMark({ className = 'mark' }: { className?: string }) {
  return <span className="brandmark"><Mark className={className} title={null} /><TradeMark /></span>;
}
