// The walkthrough's type layer: the film's ground around the window where the
// recorded interface plays, the captions in the left column, the robot's card
// and the end card. Rendered with a transparent window by reel/render.mjs
// (--layer type) and laid over the screen layer by build.sh. Every frame is a
// pure function of t through window.__reel.seek(t).
import './overlay.css';
import { CAPTIONS, DURATION, END, FPS, ROBOT, WINDOW } from './film';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const expoOut = (x: number) => { x = clamp01(x); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); };
const inOut = (x: number) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const cues = [
  ...CAPTIONS.map(c => ({ t: c.from, kind: 'caption' })),
  { t: ROBOT.from, kind: 'robot' }, ...ROBOT.log.map((_, i) => ({ t: ROBOT.lineAt(i), kind: 'line' })),
  { t: END.from, kind: 'end' },
].sort((a, b) => a.t - b.t);

const stage = document.getElementById('stage')!;
const NS = 'http://www.w3.org/2000/svg';
const frame = document.createElementNS(NS, 'svg');
frame.id = 'frame';
frame.setAttribute('viewBox', '0 0 1920 1080');
frame.setAttribute('width', '1920');
frame.setAttribute('height', '1080');
const hole = document.createElementNS(NS, 'path');
hole.setAttribute('fill-rule', 'evenodd');
frame.appendChild(hole);
stage.appendChild(frame);

// The window as a hole in the ground: a rounded rectangle at (x, y, w, h).
function window_(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  const ring = w <= 0 || h <= 0 ? '' : `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  hole.setAttribute('d', `M0 0H1920V1080H0Z${ring}`);
}

const captionEls = CAPTIONS.map(c => {
  const el = document.createElement('div');
  el.className = 'caption';
  el.innerHTML = `<p class="lines display">${c.lines.map(l => `<span class="line"><span class="inner">${esc(l)}</span></span>`).join('')}</p><p class="note">${esc(c.note)}</p>`;
  stage.appendChild(el);
  return { c, el, inners: [...el.querySelectorAll<HTMLElement>('.inner')], note: el.querySelector('.note') as HTMLElement };
});

const robot = document.createElement('div');
robot.id = 'robot'; robot.className = 'card';
robot.innerHTML = `<p class="title display">${ROBOT.title}</p><p class="log">${ROBOT.log.map(([kind, line]) => `<span class="row ${kind}">${esc(line)}</span>`).join('')}</p><p class="note">${esc(ROBOT.note)}</p>`;
stage.appendChild(robot);
const robotTitle = robot.querySelector('.title') as HTMLElement;
const robotRows = [...robot.querySelectorAll<HTMLElement>('.row')];
const robotNote = robot.querySelector('.note') as HTMLElement;

const end = document.createElement('div');
end.id = 'end'; end.className = 'card';
end.innerHTML = `<div class="mark"><img src="/favicon.svg" alt=""><span>TM</span></div><p class="site display">the67.click</p><p class="note">Built on Gno.land, live on the Onyx testnet.<br><span class="quiet">Test GNOT has no value.</span></p>`;
stage.appendChild(end);
const endMark = end.querySelector('.mark') as HTMLElement;
const endSite = end.querySelector('.site') as HTMLElement;
const endNote = end.querySelector('.note') as HTMLElement;
const black = document.createElement('div'); black.id = 'black'; stage.appendChild(black);

function enter(el: HTMLElement, t: number, from: number, rise = 24, out = 1) {
  const k = expoOut((t - from) / 0.8);
  el.style.opacity = String(k * out);
  el.style.transform = `translateY(${(1 - k) * rise}px)`;
}

function seek(t: number) {
  // The window opens from its centre at the start.
  const open = expoOut(t / 0.9);
  const w = WINDOW.width * (0.82 + 0.18 * open), h = WINDOW.height * (0.82 + 0.18 * open);
  window_(WINDOW.x + (WINDOW.width - w) / 2, WINDOW.y + (WINDOW.height - h) / 2, w, h, WINDOW.radius);
  frame.style.opacity = '1';
  stage.style.setProperty('--open', String(open));

  // Captions: lines rise through their masks, the note follows; they leave upwards.
  for (const { c, el, inners, note } of captionEls) {
    const live = t >= c.from - 0.01 && t < c.to + 0.4;
    el.style.display = live ? 'block' : 'none';
    if (!live) continue;
    inners.forEach((inner, i) => {
      const kin = expoOut((t - c.from - i * 0.07) / 0.7);
      const kout = inOut((t - c.to - i * 0.03) / 0.3);
      inner.style.transform = `translateY(${(1 - kin) * 112 - kout * 112}%)`;
    });
    const nin = expoOut((t - c.from - 0.25) / 0.6);
    note.style.opacity = String(nin * (1 - clamp01((t - c.to) / 0.25)));
    note.style.transform = `translateY(${(1 - nin) * 14}px)`;
  }

  // The robot's card wipes in from the left over the window; its run types out line by line.
  const wipe = expoOut((t - ROBOT.from) / 0.6);
  robot.style.display = t >= ROBOT.from ? 'block' : 'none';
  robot.style.clipPath = `inset(0 ${(1 - wipe) * 100}% 0 0)`;
  const leave = 1 - clamp01((t - (END.from - 0.45)) / 0.35);
  enter(robotTitle, t, ROBOT.from + 0.25, 44, leave);
  robotRows.forEach((row, i) => enter(row, t, ROBOT.lineAt(i), 16, leave));
  enter(robotNote, t, ROBOT.lineAt(ROBOT.log.length - 1) + 0.6, 20, leave);

  end.style.display = t >= END.from ? 'block' : 'none';
  enter(endMark, t, END.from + 0.05, 0);
  enter(endSite, t, END.from + 0.3, 48);
  enter(endNote, t, END.from + 0.75, 20);
  black.style.opacity = String(clamp01((t - END.black) / (DURATION - END.black)));
}

declare global { interface Window { __reel: { ready: boolean; fps: number; duration: number; cues: typeof cues; seek: (t: number) => Promise<void> } } }
window.__reel = {
  ready: false, fps: FPS, duration: DURATION, cues,
  seek: async (t: number) => { seek(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); },
};
await document.fonts.ready;
await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
// One display size for every caption: the largest at which the longest line fits the column.
const probe = document.createElement('span');
probe.className = 'display';
probe.style.cssText = 'position:absolute;visibility:hidden;font-size:100px;white-space:nowrap';
stage.appendChild(probe);
let widest = 0;
for (const c of CAPTIONS) for (const line of c.lines) { probe.textContent = line; widest = Math.max(widest, probe.getBoundingClientRect().width); }
probe.remove();
stage.style.setProperty('--caption-size', `${Math.min(104, Math.floor((448 / widest) * 100))}px`);
const params = new URLSearchParams(location.search);
if (params.get('film')) document.documentElement.style.setProperty('--film', `#${params.get('film')}`); // for tuning the ground
seek(Number(params.get('t') || 0));
window.__reel.ready = true;
