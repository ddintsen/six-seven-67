import type { Part, SceneData } from './Scene';

// Block art for the story pictures. One character is one glass block:
// y Yes glass, n No glass, c clear glass, f frost, g ground slab, w lit block;
// any other character is empty. Rows read top to bottom.

const coin = [
  '..ffff..',
  '.ffffff.',
  'ffffcfff',
  'fffccfff',
  'ffffcfff',
  'ffffcfff',
  '.ffcccf.',
  '..ffff..',
];

// Movement is drawn the same way everywhere: a dotted line of small lit
// blocks that a signal travels along.
const dots = (count: number) => [Array.from({ length: count }, () => 'w').join('.')];

// One Yes share turns into one GNOT.
export const SHARE_PAYS: SceneData = {
  parts: [
    { rows: ['yyy', 'yyy', 'yyy'], x: 0, y: 3, scale: 1.34 },
    { rows: dots(5), x: 5.2, y: 4.8, scale: 0.5, delay: 320, className: 'scene-ray' },
    { rows: coin, x: 10, y: 0.6, delay: 420 },
  ],
};

// A tablet of question, rules and the two outcome tokens, locked.
export const QUESTION_FROZEN: SceneData = {
  parts: [
    { rows: ['gggggggggggggg'], x: 0, y: 13 },
    {
      x: 1, y: 2,
      rows: [
        'cccccccccccc',
        'cffffffffccc',
        'cccccccccccc',
        'cffffffffffc',
        'cfffffffcccc',
        'cffffffffffc',
        'cccccccccccc',
        'cyyyyccnnnnc',
        'cccccccccccc',
        'cfffffffcccc',
        'cccccccccccc',
      ],
    },
    {
      x: 10, y: 6, delay: 700, className: 'scene-drop',
      rows: [
        '.www.',
        'w...w',
        'w...w',
        'fffff',
        'ffgff',
        'ffgff',
        'fffff',
      ],
    },
  ],
};

// One GNOT split into a Yes price and a No price: 42 blocks and 58, with a
// seam between them.
function priceGrid(yes: number, side: 'y' | 'n') {
  const rows: string[] = [];
  for (let row = 0; row < 10; row++) {
    let line = '';
    for (let col = 0; col < 10; col++) {
      const isYes = col * 10 + (9 - row) < yes;
      line += (side === 'y') === isYes ? side : '.';
    }
    rows.push(line);
  }
  return rows;
}
export const PRICE_SPLIT: SceneData = {
  parts: [
    { rows: ['gggggggggggg'], x: 0, y: 11 },
    { rows: priceGrid(42, 'y'), x: 0.6, y: 0.4 },
    { rows: priceGrid(42, 'n'), x: 1.2, y: 0.4, delay: 200 },
  ],
};

// The ticket you review, then sign.
export const REVIEW_TICKET: SceneData = {
  parts: [
    {
      x: 1, y: 0.4,
      rows: [
        'fffffffffff',
        'fcccccccfff',
        'fffffffffff',
        'fcccffffccf',
        'fffffffffff',
        'fccccfffyyf',
        'fffffffffff',
        'fcccffffccf',
        'fffffffffff',
        'fccccffcccf',
        'fffffffffff',
        'f.f.f.f.f.f',
      ],
    },
    {
      x: 9, y: 6, delay: 650, className: 'scene-drop',
      rows: [
        '.ccccc.',
        'ccccccc',
        'ccccccc',
        'ccccccc',
        'ccccccc',
        'ccccccc',
        '.ccccc.',
      ],
    },
    {
      x: 10, y: 7.4, scale: 0.9, delay: 900, className: 'scene-drop',
      rows: [
        '....y',
        '...yy',
        'y.yy.',
        'yyy..',
        '.y...',
      ],
    },
  ],
};

// The vault always holds enough for the larger side.
export const COLLATERAL_VAULT: SceneData = {
  parts: [
    { rows: ['ggggggggggggggggggg'], x: 0, y: 11 },
    { rows: ['yy', 'yy', 'yy', 'yy', 'yy'], x: 0.5, y: 6 },
    { rows: ['nn', 'nn', 'nn'], x: 3.5, y: 8 },
    {
      x: 8, y: 1,
      rows: [
        'c.........c',
        'c.........c',
        'c.........c',
        'cfffffffffc',
        'cfffffffffc',
        'cfffffffffc',
        'cfffffffffc',
        'cfffffffffc',
        'cfffffffffc',
        'ccccccccccc',
      ],
    },
    // The fill line, carried across to the stacks.
    { rows: ['w.w.w.w.w.w.w.w.w.w.w.w.w.w.w.w.w.w.w'], x: 0.2, y: 3.5, scale: 0.42, delay: 700, className: 'scene-line' },
  ],
};

// The pinned oracle signals the result to its market, once.
const ray: Part = {
  x: 5.4, y: 3.4, scale: 0.5, delay: 600, className: 'scene-ray',
  rows: Array.from({ length: 11 }, (_, row) => `${'.'.repeat(Math.round(row * 1.75))}w`),
};
export const ORACLE_RESULT: SceneData = {
  parts: [
    { rows: ['ggggggggggggggggggg'], x: 0, y: 13 },
    { rows: ['.cc.', 'wwww', 'wwww', '.cc.', '.cc.', '.cc.', '.cc.', '.cc.', '.cc.', '.cc.', 'cccc'], x: 1, y: 2 },
    ray,
    { rows: ['cccccc', 'cffffc', 'cfffcc', 'cccccc'], x: 12, y: 9 },
    { rows: ['yy', 'yy'], x: 15, y: 7, delay: 1300, className: 'scene-drop' },
  ],
};

// Each winning share pays one GNOT from the market's own vault, straight to
// the holder: four shares, four coins.
export const CLAIM_PAYOUT: SceneData = {
  parts: [
    { rows: ['gggggggggggggggggg'], x: 0, y: 9 },
    { rows: ['yy', 'yy', 'yy', 'yy'], x: 0.5, y: 5 },
    { rows: ['c.....c', 'c.....c', 'cfffffc', 'cfffffc', 'cfffffc', 'cfffffc', 'ccccccc'], x: 3.5, y: 2 },
    { rows: dots(5), x: 11.3, y: 4.4, scale: 0.5, delay: 300, className: 'scene-ray' },
    { rows: ['www'], x: 14.6, y: 8.2, scale: 0.8, delay: 600, className: 'scene-drop' },
    { rows: ['www'], x: 14.3, y: 7.4, scale: 0.8, delay: 740, className: 'scene-drop' },
    { rows: ['www'], x: 14.7, y: 6.6, scale: 0.8, delay: 880, className: 'scene-drop' },
    { rows: ['www'], x: 14.4, y: 5.8, scale: 0.8, delay: 1020, className: 'scene-drop' },
  ],
};

// Two plots: real test transactions in glass, practice in frost.
export const TWO_VENUES: SceneData = {
  parts: [
    { rows: ['.....c.....', '.ccccccccc.', '.c...c...c.', '.c...c...c.', 'yyy..c..nnn', 'ccc..c..ccc', '....ccc....', 'ggggggggggg', 'ggggggggggg'], x: 0, y: 0 },
    { rows: ['.....f.....', '.fffffffff.', '.f...f...f.', '.f...f...f.', 'www..f..www', 'fff..f..fff', '....fff....', 'ggggggggggg', 'ggggggggggg'], x: 13, y: 0, delay: 250 },
  ],
};

// One GNOT is a million ugnot: the same amount, cut fine.
const crumbs = Array.from({ length: 8 }, () => 'ffffffffffff');
export const UNITS_SPLIT: SceneData = {
  parts: [
    { rows: ['f'], x: 0, y: 0.5, scale: 4.5 },
    { rows: ['www', '...', 'www'], x: 6.4, y: 2, scale: 0.5, delay: 250 },
    { rows: crumbs, x: 9, y: 0.6, scale: 0.55, delay: 400 },
  ],
};

// A cube drops into the side you bought.
export const BUY_DROP: SceneData = {
  parts: [
    { rows: ['ggggggggggggg'], x: 0, y: 10 },
    { rows: ['y......', 'yy...n.', 'yyy.nn.', 'yyyynnn', 'yyyynnn'], x: 3, y: 5 },
    { rows: ['y'], x: 4.4, y: 1.2, scale: 1.2, delay: 500, className: 'scene-fall' },
  ],
};

// Empty and waiting states.

// The balance is built, its pans are empty, and two cubes wait above them:
// the contract is not on the network yet.
export const PLOT_WAITING: SceneData = {
  parts: [
    {
      x: 0, y: 3,
      rows: [
        '......c......',
        '.ccccccccccc.',
        '.c....c....c.',
        '.c....c....c.',
        '.c....c....c.',
        'ccc...c...ccc',
        '.....ccc.....',
        'ggggggggggggg',
        'ggggggggggggg',
      ],
    },
    { rows: ['y'], x: 1, y: 0.4, delay: 500, className: 'scene-fall' },
    { rows: ['n'], x: 11, y: 0.9, delay: 650, className: 'scene-fall' },
  ],
};

// Your positions behind a lock: a closed glass box, the lock in frost, and
// your two colours beside it.
export const POSITIONS_LOCKED: SceneData = {
  parts: [
    { rows: ['ggggggggggggggg'], x: 0, y: 9 },
    { rows: ['yy', 'nn'], x: 0.6, y: 7 },
    { rows: ['cccccccc', 'cffffffc', 'cfffffcc', 'cffffffc', 'cfffcccc', 'cccccccc'], x: 4, y: 3 },
    { rows: ['.www.', 'w...w', 'w...w', 'fffff', 'ffgff', 'fffff'], x: 9.4, y: 3.6, delay: 600, className: 'scene-drop' },
  ],
};

// A plinth with your two colours and an empty place beside them, reached by
// a dotted signal: your first position goes here.
export const FIRST_POSITION: SceneData = {
  parts: [
    { rows: ['ggggggggggggggggg'], x: 0, y: 7 },
    { rows: ['cccc'], x: 0.5, y: 6 },
    { rows: ['yn', 'yn'], x: 1.5, y: 4 },
    { rows: [Array.from({ length: 6 }, () => 'w').join('.')], x: 5.4, y: 4.6, scale: 0.5, delay: 300, className: 'scene-ray' },
    { rows: ['ccc', 'c.c', 'ccc'], x: 12, y: 3 },
    { rows: ['cccc'], x: 11.5, y: 6 },
  ],
};

// A tablet with a question mark where the text should be.
export const NOT_FOUND: SceneData = {
  parts: [
    { rows: ['gggggggggggggg'], x: 0, y: 13 },
    {
      x: 2, y: 2,
      rows: [
        'cccccccccc',
        'cccffffccc',
        'ccffccffcc',
        'cccccc ffc'.replace(' ', 'c'),
        'cccccffccc',
        'ccccffcccc',
        'ccccffcccc',
        'cccccccccc',
        'ccccffcccc',
        'ccccffcccc',
        'cccccccccc',
      ],
    },
  ],
};
