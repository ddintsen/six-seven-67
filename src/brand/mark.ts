// The 67 mark is drawn on a 7 x 6 block grid, like a glass-block wall held
// in a steel frame. The 6 stands one block higher than the 7: the two hands
// of the six-seven gesture caught mid-weigh. Every brand surface (header,
// favicon, flat hero, the three.js scene) builds from these coordinates.

export type Cell = readonly [col: number, row: number];

// Rows count from the top. The 6 occupies columns 0-2, rows 0-4.
export const SIX: readonly Cell[] = [
  [1, 0], [2, 0],
  [0, 1],
  [0, 2], [1, 2], [2, 2],
  [0, 3], [2, 3],
  [0, 4], [1, 4], [2, 4],
];

// The 7 occupies columns 4-6, one row lower (rows 1-5).
export const SEVEN: readonly Cell[] = [
  [4, 1], [5, 1], [6, 1],
  [6, 2],
  [5, 3],
  [5, 4],
  [5, 5],
];

export const MARK_COLUMNS = 7;
export const MARK_ROWS = 6;
export const SEVEN_DROP = 1;
