// Type over the 3D sets. Every block is placed on the left reading axis and
// revealed through a mask, line by line, with the studio curves the site
// uses; seek(t) sets every style from t alone.
import { CLAIM, CODE_HIGHLIGHTS, PRICES, QUESTION, TICKET, UI_MARKETS, UI_TAP } from './timeline';
import type { InsertName } from './timeline';
import frames from './ui/frames.json';
import { SOURCE_EXCERPT } from '../src/site/contractFacts';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0, hi = 1, s = t;
    for (let i = 0; i < 30; i++) { s = (lo + hi) / 2; if (x(s) < t) lo = s; else hi = s; }
    return y(s);
  };
}
export const inOut = bezier(0.76, 0, 0.24, 1);

type Segment = string | [string, string];
interface Block { el: HTMLElement; inners: HTMLElement[]; tin: number; out: number; exit: 'mask' | 'cut'; stagger: number; dur: number }

export function createOverlay(root: HTMLElement) {
  const blocks: Block[] = [];
  function block(className: string, top: number, lines: Segment[][], tin: number, out: number, exit: 'mask' | 'cut' = 'cut', options: { stagger?: number; dur?: number; left?: number } = {}) {
    const el = document.createElement('div');
    el.className = `t ${className}`;
    el.style.top = `${top}px`;
    if (options.left !== undefined) el.style.left = `${options.left}px`;
    const inners: HTMLElement[] = [];
    for (const segments of lines) {
      const line = document.createElement('span');
      line.className = 'line';
      const inner = document.createElement('span');
      inner.className = 'inner';
      for (const segment of segments) {
        if (typeof segment === 'string') inner.append(segment);
        else { const span = document.createElement('span'); span.className = segment[1]; span.textContent = segment[0]; inner.append(span); }
      }
      line.append(inner);
      el.append(line);
      inners.push(inner);
    }
    root.append(el);
    const item: Block = { el, inners, tin, out, exit, stagger: options.stagger ?? 0.08, dur: options.dur ?? 0.95 };
    blocks.push(item);
    return item;
  }

  // Opening: the hero line of the site, one word per beat of the build.
  block('display hero', 262, [[['Six.', 'yes']]], 4, 8);
  block('display hero', 262 + 185, [[['Seven.', 'no']]], 6, 8);
  block('display hero', 262 + 370, [['Take a side.']], 7, 8);

  // The forest.
  block('display statement', 400, [['A prediction exchange'], ['on Gno.land.']], 8.45, 12);

  // The interface: the Testnet list, rebuilt in the site's own row style.
  block('display statement', 196, [['Buy ', ['Yes', 'yes'], ' or ', ['No', 'no'], ' on real questions.']], 12.1, 16);
  const rowsEl = document.createElement('div');
  rowsEl.className = 't rows';
  rowsEl.style.top = '452px';
  const rowInners: HTMLElement[] = [];
  let tapChip: HTMLElement | null = null;
  UI_MARKETS.forEach(([question, yes], index) => {
    const line = document.createElement('span');
    line.className = 'line';
    const row = document.createElement('span');
    row.className = 'inner ui-row';
    const q = document.createElement('span');
    q.className = 'ui-question';
    q.textContent = question;
    const chips = document.createElement('span');
    chips.className = 'ui-chips';
    const chip = (label: string, value: number, side: 'yes' | 'no') => {
      const el = document.createElement('span');
      el.className = `ui-chip ui-${side}`;
      el.innerHTML = `<span>${label}</span><span>${value.toFixed(2)}</span>`;
      chips.append(el);
      return el;
    };
    const yesChip = chip('Yes', yes, 'yes');
    chip('No', 1 - yes, 'no');
    if (index === 0) tapChip = yesChip;
    row.append(q, chips);
    line.append(row);
    rowsEl.append(line);
    rowInners.push(row);
  });
  root.append(rowsEl);
  blocks.push({ el: rowsEl, inners: rowInners, tin: 12.35, out: 16, exit: 'cut', stagger: 0.09, dur: 0.85 });

  // A market and its price.
  const [first, second] = splitQuestion(QUESTION);
  block('question', 128, [[first], [second]], 16.15, 28, 'cut', { stagger: 0.07 });
  const yesRow = block('display price yes', 372, [[['Yes', 'label']]], 16.4, 28);
  const noRow = block('display price no', 372 + 178, [[['No', 'label']]], 16.5, 28);
  const yesDigits = digits(yesRow.inners[0]);
  const noDigits = digits(noRow.inners[0]);
  block('text', 812, [['A Yes share costs 0.42 GNOT'], ['and pays 1 GNOT if it happens.']], 18.5, 21.5, 'mask', { dur: 0.8 });
  block('text', 812, [['The price moves with the odds,'], ['and the balance weighs it.']], 22.15, 28, 'cut', { dur: 0.8 });

  // The four calls.
  const steps: [Segment[][], Segment[][], string][] = [
    [[['The question'], ['is fixed.']], [['Question and rules are frozen'], ['in the realm. Nothing edits them.']], 'CreateMarket'],
    [[['You pay the price'], ['you reviewed.']], [['The realm refuses any other price'], ['and any other amount.']], 'Buy'],
    [[['The oracle records'], ['the result.']], [['Only the oracle pinned to the market,'], ['and only once.']], 'FinalizeByOracle'],
    [[['A winning share'], ['pays 1 GNOT.']], [['Straight from the market’s'], ['own collateral.']], 'Claim'],
  ];
  steps.forEach(([title, text, call], index) => {
    const start = 28 + index * 4;
    const last = index === steps.length - 1;
    const out = last ? 44 : start + 3.55;
    const exit = last ? 'cut' : 'mask';
    block('display step', 300, title, start + 0.12, out, exit);
    block('text', 582, text, start + 0.3, out, exit, { dur: 0.8 });
    block('call', 724, [[call]], start + 0.42, out, exit, { dur: 0.8 });
  });

  // The code.
  block('display statement', 128, [['Read every line.']], 44.12, 48);
  block('text', 300, [['Three checks in Gno run on chain for every trade.']], 44.3, 48, 'cut', { dur: 0.8 });
  const codeEl = document.createElement('div');
  codeEl.className = 't code';
  codeEl.style.top = '418px';
  const rows: HTMLElement[][] = [[]];
  for (const [kind, text] of SOURCE_EXCERPT) {
    const parts = text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) rows.push([]);
      if (!part) return;
      const span = document.createElement('span');
      span.className = `tok-${kind}`;
      span.textContent = part;
      rows[rows.length - 1].push(span);
    });
  }
  const rowEls = rows.filter(row => row.length).map(row => {
    const line = document.createElement('span');
    line.className = 'line';
    const inner = document.createElement('span');
    inner.className = 'inner row';
    inner.append(...row);
    line.append(inner);
    codeEl.append(line);
    return inner;
  });
  root.append(codeEl);
  const codeBlock: Block = { el: codeEl, inners: rowEls, tin: 44.4, out: 48, exit: 'cut', stagger: 0.035, dur: 0.8 };
  blocks.push(codeBlock);
  // The three require() lines, in order.
  const checkRows = rowEls.map((row, index) => (row.textContent?.includes('require(') ? index : -1)).filter(index => index >= 0);

  // Built on Gno.land, then the end.
  block('display statement', 400, [['Being built'], ['on Gno.land.']], 48.35, 51.45, 'mask');
  block('display statement', 400, [['To be'], ['continued.']], 54, 58.4, 'mask');

  // The trademark sign, drawn in pixels like the site's.
  const tm = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tm.setAttribute('class', 'tm');
  tm.setAttribute('viewBox', '0 0 9 5');
  ['###.#...#', '.#..##.##', '.#..#.#.#', '.#..#...#', '.#..#...#'].forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell !== '#') return;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x + 0.09)); rect.setAttribute('y', String(y + 0.09));
    rect.setAttribute('width', '0.82'); rect.setAttribute('height', '0.82'); rect.setAttribute('fill', 'currentColor');
    tm.append(rect);
  }));
  root.append(tm);

  return {
    seek(t: number, anchor: { x: number; y: number; width: number } | null) {
      for (const item of blocks) {
        const end = item.exit === 'mask' ? item.out + 0.42 + item.stagger * item.inners.length : item.out;
        const shown = t >= item.tin && t < end;
        item.el.style.visibility = shown ? 'visible' : 'hidden';
        if (!shown) continue;
        item.inners.forEach((inner, index) => {
          let y = (1 - expoOut(clamp01((t - item.tin - index * item.stagger) / item.dur))) * 112;
          let gone = false;
          if (item.exit === 'mask' && t >= item.out) {
            // Far enough that no descender is left at the mask's edge, then hidden.
            const q = clamp01((t - item.out - index * 0.04) / 0.42);
            y = -140 * inOut(q);
            gone = q >= 1;
          }
          inner.style.transform = `translateY(${y.toFixed(3)}%)`;
          inner.style.visibility = gone ? 'hidden' : '';
        });
      }
      // Prices roll like an odometer when the quote changes.
      // PRICES[1] is the first price shown; later entries are quote changes.
      const price = (side: 'yes' | 'no') => {
        let from = PRICES[1][1];
        let to = from;
        let at = -1;
        for (let k = 2; k < PRICES.length; k++) if (t >= PRICES[k][0]) { from = PRICES[k - 1][1]; to = PRICES[k][1]; at = PRICES[k][0]; }
        const roll = at < 0 ? 1 : expoOut(clamp01((t - at) / 0.7));
        const value = (v: number) => (side === 'yes' ? v : 1 - v);
        return { from: value(from), to: value(to), roll };
      };
      const yes = price('yes');
      const no = price('no');
      setDigits(yesDigits, yes.from, yes.to, yes.roll);
      setDigits(noDigits, no.from, no.to, no.roll);

      // Code: every line readable; the three checks light one after another.
      const lit = CODE_HIGHLIGHTS.filter(at => t >= at).length;
      rowEls.forEach((row, index) => {
        const check = checkRows.indexOf(index);
        const on = check >= 0 && check < lit;
        const since = on ? t - CODE_HIGHLIGHTS[check] : 0;
        const dim = lit > 0 && !on ? 0.42 : 1;
        row.style.opacity = String(on ? 0.6 + 0.4 * clamp01(since / 0.3) : dim);
        row.style.background = on ? `rgba(16, 38, 28, ${(clamp01(since / 0.3)).toFixed(3)})` : 'transparent';
      });

      // The Yes of the first market is chosen on the beat: it takes the
      // light flint of a selected choice, as in the site's ticket.
      if (tapChip) {
        const chosen = clamp01((t - UI_TAP) / 0.18);
        (tapChip as HTMLElement).classList.toggle('is-chosen', t >= UI_TAP);
        (tapChip as HTMLElement).style.transform = t >= UI_TAP && t < UI_TAP + 0.18 ? `scale(${(1 - 0.04 * Math.sin(Math.PI * chosen)).toFixed(4)})` : 'none';
      }

      if (anchor) {
        tm.style.visibility = 'visible';
        tm.style.left = `${anchor.x}px`;
        tm.style.top = `${anchor.y}px`;
        tm.style.width = `${anchor.width}px`;
        const fadeIn = clamp01((t - 7) / 0.5);
        const endFade = t >= 52 ? 1 - clamp01((t - 58.3) / 0.4) : fadeIn;
        tm.style.opacity = String(t >= 52 ? endFade : fadeIn);
      } else tm.style.visibility = 'hidden';
    },
  };
}

function splitQuestion(question: string): [string, string] {
  const words = question.split(' ');
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}

// A price as four slots: 0 . d d, each digit a vertical strip of 0-9.
function digits(inner: HTMLElement) {
  const wrap = document.createElement('span');
  wrap.className = 'digits';
  const strips: HTMLElement[] = [];
  ['0', '.', 'd', 'd'].forEach(kind => {
    const slot = document.createElement('span');
    slot.className = 'digit';
    if (kind === 'd') {
      const strip = document.createElement('span');
      strip.className = 'strip';
      for (let n = 0; n <= 9; n++) { const s = document.createElement('span'); s.textContent = String(n); strip.append(s); }
      slot.append(strip);
      strips.push(strip);
    } else slot.textContent = kind;
    wrap.append(slot);
  });
  inner.append(wrap);
  return strips;
}
function setDigits(strips: HTMLElement[], from: number, to: number, roll: number) {
  const a = Math.round(from * 100);
  const b = Math.round(to * 100);
  const posA = [Math.floor(a / 10), a % 10];
  const posB = [Math.floor(b / 10), b % 10];
  strips.forEach((strip, index) => {
    const pos = posA[index] + (posB[index] - posA[index]) * roll;
    strip.style.transform = `translateY(${(-pos * 0.9).toFixed(4)}em)`;
  });
}

// ---------------------------------------------------------------- inserts
// The two interface shots of version 2: the real screens, captured at 2x and
// 3x from the app through MockChain (reel/ui.spec.ts), on the right; one line
// of type on the left axis. A screen arrives through a mask that opens
// upwards while the picture settles; a press lights the pressed control for a
// moment; the next state cuts in on the beat.
type FrameName = keyof typeof frames;
interface Screen { el: HTMLElement; img: HTMLElement; press: HTMLElement | null; name: FrameName }

export function createInserts(root: HTMLElement) {
  const scenes: Record<InsertName, HTMLElement> = { ticket: document.createElement('div'), claim: document.createElement('div') };
  const images: HTMLImageElement[] = [];
  for (const scene of Object.values(scenes)) { scene.className = 'insert'; root.append(scene); }

  function screen(parent: HTMLElement, name: FrameName, scale: number, x: number, y: number, radius: number): Screen {
    const frame = frames[name] as { width: number; height: number; press?: { x: number; y: number; width: number; height: number } };
    const el = document.createElement('div');
    el.className = 'ui-screen';
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${frame.width * scale}px`, height: `${frame.height * scale}px`, borderRadius: `${radius * scale}px` });
    const img = document.createElement('img');
    // Decoded on the frame it first shows, never a frame later.
    img.decoding = 'sync';
    img.src = new URL(`./ui/${name}.png`, import.meta.url).href;
    img.alt = '';
    images.push(img);
    el.append(img);
    let press: HTMLElement | null = null;
    if (frame.press) {
      press = document.createElement('div');
      press.className = 'ui-press';
      Object.assign(press.style, { left: `${frame.press.x * scale}px`, top: `${frame.press.y * scale}px`, width: `${frame.press.width * scale}px`, height: `${frame.press.height * scale}px`, borderRadius: `${12 * scale}px` });
      el.append(press);
    }
    parent.append(el);
    return { el, img, press, name };
  }
  function caption(parent: HTMLElement, top: number, lines: string[]) {
    const el = document.createElement('div');
    el.className = 'ui-caption display step';
    el.style.top = `${top}px`;
    const inners = lines.map(text => {
      const line = document.createElement('span');
      line.className = 'line';
      const inner = document.createElement('span');
      inner.className = 'inner';
      inner.textContent = text;
      line.append(inner);
      el.append(line);
      return inner;
    });
    parent.append(el);
    return inners;
  }

  // The ticket: the screens sit on one centre, right of the type.
  const centre = 1920 - 128 - 370;
  const ticketCaption = caption(scenes.ticket, 412, ['Review the price.', 'Sign in Adena.']);
  const ticket = screen(scenes.ticket, 'ticket', 1.32, centre - (368 * 1.32) / 2, (1080 - 662 * 1.32) / 2, 16);
  const review = screen(scenes.ticket, 'review', 1.32, centre - (560 * 1.32) / 2, (1080 - 574 * 1.32) / 2, 16);
  const confirmed = screen(scenes.ticket, 'confirmed', 1.32, centre - (560 * 1.32) / 2, (1080 - 605 * 1.32) / 2, 16);

  // The claim: the position card at phone width, then the same card settled
  // with the status line under it.
  const cardScale = 1.9;
  const cardLeft = 1920 - 128 - 430 * cardScale;
  const claimCaption = caption(scenes.claim, 412, ['Claim from', 'your portfolio.']);
  const position = screen(scenes.claim, 'position', cardScale, cardLeft, 300, 0);
  const claimed = screen(scenes.claim, 'claimed', cardScale, cardLeft, 300, 16);
  const status = screen(scenes.claim, 'claimed-status', cardScale, cardLeft + 16 * cardScale, 300 + 184 * cardScale + 28, 12);

  const reveal = (s: Screen, since: number, dur = 0.9) => {
    const u = expoOut(clamp01(since / dur));
    s.el.style.visibility = since >= 0 ? 'visible' : 'hidden';
    s.el.style.clipPath = `inset(${((1 - u) * 100).toFixed(3)}% 0 0 0)`;
    s.img.style.transform = `translateY(${((1 - u) * 7).toFixed(3)}%)`;
  };
  // A new state of the same screen cuts in whole on the beat and settles.
  const cutIn = (s: Screen, since: number) => {
    s.el.style.visibility = since >= 0 ? 'visible' : 'hidden';
    s.el.style.clipPath = 'none';
    s.img.style.transform = `translateY(${((1 - expoOut(clamp01(since / 0.35))) * 1.5).toFixed(3)}%)`;
  };
  const hide = (s: Screen) => { s.el.style.visibility = 'hidden'; };
  const flash = (s: Screen, since: number) => {
    if (!s.press) return;
    // Up in 60 ms, gone by 320 ms.
    const level = since < 0 ? 0 : since < 0.06 ? since / 0.06 : Math.max(0, 1 - (since - 0.06) / 0.26);
    s.press.style.opacity = (0.22 * level).toFixed(3);
    s.el.style.transform = since >= 0 && since < 0.2 ? `scale(${(1 - 0.006 * Math.sin(Math.PI * since / 0.2)).toFixed(5)})` : 'none';
  };
  const lines = (inners: HTMLElement[], since: number) => inners.forEach((inner, index) => {
    const y = (1 - expoOut(clamp01((since - index * 0.08) / 0.95))) * 112;
    inner.style.transform = `translateY(${y.toFixed(3)}%)`;
  });

  return {
    ready: () => Promise.all(images.map(img => img.decode())),
    seek(name: InsertName | null, local: number) {
      // display, not visibility: a shown child would show through a hidden parent.
      for (const [key, scene] of Object.entries(scenes)) scene.style.display = key === name ? 'block' : 'none';
      if (name === 'ticket') {
        lines(ticketCaption, local - 0.12);
        if (local < TICKET.review) { reveal(ticket, local); flash(ticket, local - TICKET.reviewPress); hide(review); hide(confirmed); }
        else if (local < TICKET.confirmed) { hide(ticket); cutIn(review, local - TICKET.review); flash(review, local - TICKET.confirmPress); hide(confirmed); }
        else { hide(ticket); hide(review); cutIn(confirmed, local - TICKET.confirmed); }
      } else if (name === 'claim') {
        lines(claimCaption, local - 0.12);
        if (local < CLAIM.claimed) { reveal(position, local); flash(position, local - CLAIM.press); hide(claimed); hide(status); }
        else { hide(position); cutIn(claimed, local - CLAIM.claimed); reveal(status, local - CLAIM.claimed - 0.15, 0.8); }
      }
    },
  };
}
