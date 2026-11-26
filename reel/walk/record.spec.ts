// Records the walkthrough's screen layer from the running app, frame by frame.
//   npm run dev; npx playwright test -c reel/walk/pw.config.ts      (WALK_OUT=dir, default reel/walk/out)
//
// The app is used for real: the pointer is the browser's mouse (hover states,
// presses, typing), pages scroll, dialogs open, numbers follow the input. Each
// frame is taken after the film's clock moves 1/30 s: CSS transitions and
// animations are paused and stepped on that clock, so motion is smooth however
// long a capture takes, and the camera is a zoomed clip rendered at its own
// scale (text stays sharp). Waits for the network or the chain stand-in happen
// between frames, so they never show as stalls.
//
// Live: the markets, the Sports topic and the match are Onyx and Polymarket as
// they are now, and the match's page on gno.land is gnoweb on Onyx. The trade,
// the claim and the oracle's proposal run on MockChain (e2e/support), fed with
// the same match: Cowboys vs. Packers, its real question, rules, condition,
// tokens, prices, picture and Polymarket price line. Adena's signature is held
// for a moment, as a person would take to approve it.
import { expect, test } from '@playwright/test';
import type { Browser, CDPSession, Locator, Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ADDRESS, connectAdena, enableV2, IMAGE_ORIGIN, MOCK_NOW, MockChain } from '../../e2e/support/mockChain';
import { MockSources } from '../../e2e/support/mockSources';
import { v2Market } from '../../e2e/support/mockV2';
import { DURATION, FPS, WINDOW } from './film';

const W = WINDOW.width;
const H = WINDOW.height;
const base = process.env.REEL_SITE || 'http://127.0.0.1:6767/';
const OUT = process.env.WALK_OUT || 'reel/walk/out';
const ID = 'nfl-dal-gb-2026-10-19';
const ONYX = { id: 'onyx', chainId: 'onyx-1', chainName: 'Onyx testnet', rpcUrl: 'https://rpc.onyx.testnets.gno.land', indexerUrl: 'https://indexer.onyx.testnets.gno.land/graphql/query',
  realm: 'gno.land/r/nym-sixseven067/markets', realmV2: 'gno.land/r/nym-sixseven067/markets/v2', explorerUrl: 'https://onyx.testnets.gno.land', txExplorerUrl: 'https://gnoscan.io/transactions/details', faucetUrl: 'https://faucet.gno.land' };
const RULES = 'In the upcoming NFL football game between Cowboys and Packers, scheduled for October 18 at 8:20PM ET:\nThis market will resolve to "Cowboys" if Cowboys win the game.\nThis market will resolve to "Packers" if Packers win the game.\nOvertime is included if played.\nIf the game ends in a tie, this market will resolve 50-50.\nIf the game is postponed, this market will remain open until the game has been completed.\nIf the game is canceled entirely, with no make-up game, this market will resolve 50-50.';
const MATCH = {
  yesLabel: 'Cowboys', noLabel: 'Packers', topic: 'Sports', rules: RULES, yesPricePpm: 475_000, noPricePpm: 525_000, escrow: 3_000_000n, reserve: 3_000_000n,
  yesTokenId: '62216093420049586863764473589072732611021099987810862636177687263075853891357', noTokenId: '21229555207265850108920299530398596306658389490025953671520798592653541449729',
  treasury: 'g1z86xzys5xmsj2etpzmg46q5ymj7rmxkt49uw9q', tradingEndsAt: 1_792_368_600, createdAt: MOCK_NOW - 3600, quotedAt: MOCK_NOW - 600,
  history: [{ at: MOCK_NOW - 3600, yesPricePpm: 475_000, noPricePpm: 525_000, version: 1 }],
};
const ONLY = process.env.WALK_ONLY; // live | trade | status | gnoweb: record one part alone, for checks
const part = (name: string) => !ONLY || ONLY === name;
const CONDITION = '0x340c1c3ad87ec9d60450284665ba1a386a213d818a9042fdfcc8e20e0521f624';

// ---- easing
type Ease = (k: number) => number;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const expoOut: Ease = k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
const inOut: Ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const quintInOut: Ease = k => (k < 0.5 ? 16 * k ** 5 : 1 - Math.pow(-2 * k + 2, 5) / 2);
type Pt = { x: number; y: number };

// ---- in-page helper: the pointer (in the top layer, above modal dialogs), the press ring,
// the film's clock for CSS animations, and instant scrolling.
function helper() {
  const w = window as unknown as Record<string, unknown>;
  const seen = new Map<Animation, number>();
  let cursor: HTMLElement | null = null;
  let ring: HTMLElement | null = null;
  let lastDialog: Element | null = null;
  const make = () => {
    if (cursor || !document.body) return;
    const style = 'position:fixed;left:0;top:0;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;inset:auto;';
    ring = document.createElement('div');
    ring.setAttribute('popover', 'manual');
    ring.style.cssText = `${style}width:46px;height:46px;border-radius:50%;background:rgba(232,238,235,.3);opacity:0;`;
    cursor = document.createElement('div');
    cursor.setAttribute('popover', 'manual');
    cursor.style.cssText = `${style}width:24px;height:24px;transform-origin:3px 3px;opacity:0;`;
    cursor.innerHTML = '<svg viewBox="0 0 30 30" width="24" height="24" style="overflow:visible"><path d="M3 3 L3 24 L9 18.5 L13 27 L17 25.2 L13.2 16.8 L21 16.8 Z" fill="#E8EEEB" stroke="#0B0E0D" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    document.body.append(ring, cursor);
    ring.showPopover(); cursor.showPopover();
  };
  w.__film = {
    frame(o: { x: number; y: number; shown: number; ring: number; s: number; dt: number; scroll: number | null }) {
      make();
      // Keep the pointer above a dialog that opened after it.
      const dialog = document.querySelector('dialog[open]');
      if (dialog !== lastDialog && cursor && ring) { lastDialog = dialog; ring.hidePopover(); cursor.hidePopover(); ring.showPopover(); cursor.showPopover(); }
      if (o.scroll !== null) window.scrollTo({ top: o.scroll, behavior: 'instant' });
      if (cursor && ring) {
        const size = 1.15 / Math.sqrt(o.s);
        cursor.style.opacity = String(o.shown);
        cursor.style.transform = `translate(${o.x - 3}px, ${o.y - 3}px) scale(${size * (o.ring > 0 && o.ring < 0.16 ? 0.86 : 1)})`;
        const k = o.ring > 0 && o.ring < 0.45 ? o.ring / 0.45 : 1;
        ring.style.opacity = String(o.shown * (k < 1 ? (1 - k) * 0.9 : 0));
        ring.style.transform = `translate(${o.x - 23}px, ${o.y - 23}px) scale(${(0.35 + (1 - Math.pow(2, -10 * k)) * 0.85) * size})`;
      }
      for (const a of document.getAnimations()) {
        if (!seen.has(a)) { seen.set(a, Number(a.currentTime ?? 0)); a.pause(); }
        const t = seen.get(a)! + o.dt;
        seen.set(a, t);
        const end = a.effect?.getComputedTiming().endTime;
        if (typeof end === 'number' && Number.isFinite(end) && t >= end) { a.finish(); seen.delete(a); } else a.currentTime = t;
      }
      return { sx: scrollX, sy: scrollY };
    },
  };
}

// ---- the film: one clock, tweens, frames into ffmpeg
class Film {
  frame = 0;
  page!: Page;
  private cdp!: CDPSession;
  cam = { s: 1, x: W / 2, y: H / 2 };
  cur = { x: W * 0.74, y: H * 0.9 };
  vis = { shown: 0 };
  scroll = { y: 0 };
  private scrolling = false;
  private ringAt = -10;
  private tweens: { o: Record<string, number>; k: string; a: number; b: number; t0: number; t1: number; ease: Ease }[] = [];
  cues: { t: number; kind: string }[] = [];
  private last: Buffer | null = null;
  private ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-pix_fmt', 'yuv444p', '-r', String(FPS), `${OUT}/screen.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });

  get t() { return this.frame / FPS; }
  async attach(page: Page) {
    this.page = page;
    this.cdp = await page.context().newCDPSession(page);
    this.scroll.y = await page.evaluate(() => scrollY);
  }
  cue(kind: string) { this.cues.push({ t: Math.round(this.t * 1000) / 1000, kind }); }
  cut() { this.tweens = []; this.cue('cut'); }
  private tween(o: Record<string, number>, k: string, b: number, dur: number, ease: Ease) {
    this.tweens = this.tweens.filter(x => !(x.o === o && x.k === k));
    this.tweens.push({ o, k, a: o[k], b, t0: this.t, t1: this.t + Math.max(dur, 1e-6), ease });
  }
  camTo(s: number, p: Pt, dur: number, ease: Ease = expoOut) {
    this.tween(this.cam, 's', s, dur, ease); this.tween(this.cam, 'x', p.x, dur, ease); this.tween(this.cam, 'y', p.y, dur, ease);
  }
  setCam(s: number, p: Pt) { this.cam = { s, x: p.x, y: p.y }; this.tweens = this.tweens.filter(x => x.o !== this.cam); }
  moveTo(p: Pt, dur: number, ease: Ease = quintInOut) { this.tween(this.cur, 'x', p.x, dur, ease); this.tween(this.cur, 'y', p.y, dur, ease); }
  show(on: boolean, dur = 0.25) { this.tween(this.vis, 'shown', on ? 1 : 0, dur, inOut); }
  scrollTo(y: number, dur: number, ease: Ease = quintInOut) { this.scrolling = true; this.tween(this.scroll, 'y', y, dur, ease); }
  async scrollNow(y: number) {
    this.tweens = this.tweens.filter(x => x.o !== this.scroll);
    await this.page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), y);
    this.scroll.y = await this.page.evaluate(() => scrollY);
  }
  async click(kind = 'press') {
    await this.page.mouse.move(this.cur.x, this.cur.y);
    await this.page.mouse.down();
    await this.page.mouse.up();
    this.ringAt = this.t;
    this.cue(kind);
  }
  async key(text: string) { await this.page.keyboard.type(text); this.cue('key'); }
  // The centre of an element in viewport coordinates now, nudged by (dx, dy).
  async at(locator: Locator, dx = 0, dy = 0): Promise<Pt> {
    const b = (await locator.boundingBox())!;
    return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
  }
  async box(locator: Locator) { return (await locator.boundingBox())!; }
  // A camera point for an element at scale s: centred when it fits the view, else its left edge `pad` from the frame's left.
  async fit(locator: Locator, s: number, dy = 0, pad = 32): Promise<Pt> {
    const b = await this.box(locator);
    const cw = W / s;
    return { x: b.width + 2 * pad <= cw ? b.x + b.width / 2 : b.x - pad + cw / 2, y: b.y + b.height / 2 + dy };
  }

  private async step() {
    const t = this.t;
    let scrolled = false;
    for (const x of [...this.tweens]) {
      if (t < x.t0) continue;
      const k = clamp((t - x.t0) / (x.t1 - x.t0), 0, 1);
      x.o[x.k] = x.a + (x.b - x.a) * x.ease(k);
      if (x.o === this.scroll) scrolled = true;
      if (k >= 1) this.tweens.splice(this.tweens.indexOf(x), 1);
    }
    if (!scrolled) this.scrolling = false;
    await this.page.mouse.move(this.cur.x, this.cur.y);
    const s = this.cam.s;
    const view = await this.page.evaluate(o => (window as unknown as { __film: { frame: (o: unknown) => { sx: number; sy: number } } }).__film.frame(o),
      { x: this.cur.x, y: this.cur.y, shown: this.vis.shown, ring: t - this.ringAt, s, dt: 1000 / FPS, scroll: this.scrolling ? Math.round(this.scroll.y) : null });
    const cw = W / s, ch = H / s;
    const x0 = clamp(this.cam.x - cw / 2, 0, W - cw), y0 = clamp(this.cam.y - ch / 2, 0, H - ch);
    const shot = await this.cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: view.sx + x0, y: view.sy + y0, width: cw, height: ch, scale: s }, optimizeForSpeed: true });
    this.last = Buffer.from(shot.data, 'base64');
    await this.write(this.last);
  }
  private async write(png: Buffer) {
    if (!this.ffmpeg.stdin.write(png)) await new Promise(resolve => this.ffmpeg.stdin.once('drain', resolve));
    this.frame++;
    if (this.frame % 60 === 0) console.log(`frame ${this.frame} (${this.t.toFixed(1)} s)`);
  }
  async until(t: number) { while (this.t < t - 1e-6) await this.step(); }
  // The last frame held under the parts drawn by the type layer alone (the robot's card wipes over it).
  async holdUntil(t: number) {
    while (this.t < t - 1e-6) await this.write(this.last!);
  }
  async close() {
    this.ffmpeg.stdin.end();
    await new Promise(resolve => this.ffmpeg.on('close', resolve));
  }
}

async function settle(page: Page, ms = 600) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForFunction(() => [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).every(i => i.complete), undefined, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
async function context(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  await ctx.addInitScript(helper);
  return ctx;
}
// Holds Adena's signature until the film releases it.
async function gateSignatures(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { adena: { DoContract: (r: unknown) => Promise<unknown>; gated?: boolean }; __release?: () => void };
    if (!w.adena || w.adena.gated) return;
    const sign = w.adena.DoContract;
    w.adena.DoContract = async (request: unknown) => { await new Promise<void>(resolve => { w.__release = resolve; }); return sign(request); };
    w.adena.gated = true;
  });
}
const release = (page: Page) => page.waitForFunction(() => typeof (window as unknown as { __release?: () => void }).__release === 'function', undefined, { timeout: 15_000 })
  .then(() => page.evaluate(() => { const w = window as unknown as { __release?: () => void }; const r = w.__release!; w.__release = undefined; r(); }));

test('walkthrough screen layer', async ({ browser }) => {
  test.setTimeout(1_800_000);
  mkdirSync(OUT, { recursive: true });
  const f = new Film();

  // ---- Live: markets, Sports, the match (0–14 s)
  if (part('live')) {
    const ctx = await context(browser);
    await ctx.addInitScript(config => localStorage.setItem('67.chain.override', config), JSON.stringify(ONYX));
    const page = await ctx.newPage();
    await page.goto(`${base}#/markets`);
    await expect(page.locator('.lead')).toBeVisible({ timeout: 60_000 });
    // Load every picture of the list before filming the scroll.
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('img')) img.loading = 'eager';
      for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 150)); }
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await settle(page, 1500);
    await f.attach(page);
    const lead = page.locator('.lead');
    const catalogue = await page.locator('#catalogue-heading').evaluate(el => el.getBoundingClientRect().top + scrollY);

    // Markets: from the lead question out to the list, a look at Yes and No, then down to the mirror.
    const lb = await f.box(lead);
    f.setCam(1.3, { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 });
    f.camTo(1, { x: W / 2, y: H / 2 }, 1.8, expoOut);
    f.show(true, 0.3);
    await f.until(0.3); f.moveTo(await f.at(lead.getByRole('link', { name: /^Yes / }), 6, 4), 0.8);
    await f.until(1.5); f.moveTo(await f.at(lead.getByRole('link', { name: /^No / }), 10, 4), 0.45);
    await f.until(2.3); f.moveTo({ x: W * 0.86, y: H * 0.56 }, 0.45);
    await f.until(2.6); f.scrollTo(catalogue - 96, 3.0, quintInOut);
    await f.until(6.0);

    // Sports: the topic, then down to the matches and into one.
    f.cut();
    await f.scrollNow(0);
    const sports = page.getByRole('navigation', { name: 'Market topics' }).getByRole('button', { name: 'Sports', exact: true });
    f.setCam(1.25, await f.at(sports, 220, 120));
    f.moveTo(await f.at(sports, 4, 4), 0.5);
    await f.until(6.6); await f.click();
    await expect(sports).toHaveAttribute('aria-pressed', 'true');
    const row = page.locator('.market-list .row').filter({ hasText: 'Cowboys vs. Packers' });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => { for (const img of document.querySelectorAll('img')) img.loading = 'eager'; });
    await settle(page, 300);
    f.camTo(1, { x: W / 2, y: H / 2 }, 0.8, expoOut);
    const rowTop = await row.evaluate(el => el.getBoundingClientRect().top + scrollY);
    await f.until(7.0); f.scrollTo(rowTop - H * 0.46, 1.5, quintInOut);
    await f.until(8.5); f.moveTo(await f.at(row.locator('h3'), -40, 2), 0.55);
    await f.until(9.5); await f.click();
    await expect(page.locator('.chart-line-reference')).toBeVisible({ timeout: 30_000 });
    await f.scrollNow(0);
    await settle(page, 800);
    f.cut();

    // The match: the chart, our price over Polymarket's line, then the ticket.
    const chart = page.locator('.detail-chart');
    const ticket = page.getByRole('complementary', { name: 'Take a position', exact: true });
    f.setCam(1, { x: W / 2, y: H / 2 });
    await f.until(10.0); f.camTo(1.4, await f.at(chart), 0.9, expoOut);
    const cb = await f.box(chart);
    await f.until(10.3); f.moveTo({ x: cb.x + cb.width * 0.12, y: cb.y + cb.height * 0.62 }, 0.5);
    await f.until(10.9); f.moveTo({ x: cb.x + cb.width * 0.9, y: cb.y + cb.height * 0.5 }, 1.8, inOut);
    await f.until(12.8); f.camTo(1.3, await f.at(ticket), 0.8, expoOut);
    f.moveTo(await f.at(ticket.getByRole('button', { name: 'Connect Adena', exact: true }), 30, 4), 0.8);
    await f.until(14.0);
    await ctx.close();
  }

  // ---- The trade and the claim on MockChain, the same match (14–30 s)
  if (part('trade')) {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    const chain = new MockChain();
    const v2 = await enableV2(page, chain);
    v2.markets.push(v2Market(ID, 'Cowboys vs. Packers', CONDITION, ADDRESS, MATCH));
    // An earlier position, so the portfolio is a real one: 5 Yes on Bitcoin vs gold at 0.42.
    const btc = chain.markets.find(x => x.id === 'btc-vs-gold-2026')!;
    btc.yes += 5_000_000n; btc.escrow += 2_100_000n; btc.volume += 2_100_000n; btc.trades += 1; btc.holders.add(ADDRESS);
    chain.positions.set(ADDRESS, new Map([['btc-vs-gold-2026', { yes: 5_000_000n, no: 0n, spent: 2_100_000n, claimed: false, paid: 0n }]]));
    await chain.install(page);
    await gateSignatures(page);
    await page.unroute('https://gamma-api.polymarket.com/**');
    await page.unroute(`${IMAGE_ORIGIN}/**`);
    await page.unroute('https://clob.polymarket.com/prices-history**');
    await page.goto(`${base}#/market/${ID}`);
    const ticket = page.getByRole('complementary', { name: 'Take a position', exact: true });
    await expect(page.locator('.chart-line-reference')).toBeVisible({ timeout: 30_000 });
    await settle(page, 1200);
    await f.attach(page);
    f.cut();

    // Connect Adena from the ticket.
    await f.until(14.25); await f.click();
    const wallet = page.getByRole('dialog', { name: 'Wallet', exact: true });
    await expect(wallet).toBeVisible();
    f.camTo(1.25, await f.at(wallet), 0.6, expoOut);
    await f.until(14.5); f.moveTo(await f.at(wallet.getByRole('button', { name: 'Connect Adena', exact: true }), 20, 4), 0.5);
    await f.until(15.1); await f.click();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Open Adena wallet' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400);
    await f.until(15.6); f.moveTo(await f.at(wallet.getByRole('button', { name: 'Close wallet', exact: true })), 0.4);
    await f.until(16.1); await f.click();
    await expect(wallet).toBeHidden();
    f.camTo(1.3, await f.at(ticket), 0.6, expoOut);

    // Pick a side: Packers turns the ticket cobalt, Cowboys back to green.
    const side = (name: string) => ticket.locator('label').filter({ hasText: name }).first();
    await f.until(16.4); f.moveTo(await f.at(side('Packers'), 10, 4), 0.45);
    await f.until(17.0); await f.click();
    await f.until(17.2); f.moveTo(await f.at(side('Cowboys'), 10, 4), 0.4);
    await f.until(17.75); await f.click();

    // The amount: shares, fee and payout follow it.
    const amount = ticket.getByLabel('Amount', { exact: true });
    await f.until(18.0); f.moveTo(await f.at(amount, -60, 4), 0.4);
    await f.until(18.5); await f.click(); await page.keyboard.press('Control+A');
    await f.until(18.8); await f.key('2');
    await page.waitForTimeout(150);
    const summary = ticket.locator('dl').first();
    f.camTo(1.85, await f.at(summary), 0.7, expoOut);
    await f.until(19.2); f.moveTo(await f.at(summary, 120, 10), 0.6);

    // Review, sign, confirmed.
    const reviewButton = ticket.getByRole('button', { name: 'Review trade', exact: true });
    await f.until(20.0); f.camTo(1.3, await f.at(ticket), 0.5, expoOut); f.moveTo(await f.at(reviewButton, 30, 4), 0.5);
    await f.until(20.6); await f.click();
    const review = page.getByRole('dialog', { name: 'Review your position', exact: true });
    const confirm = review.getByRole('button', { name: 'Confirm in Adena', exact: true });
    await expect(confirm).toBeVisible();
    f.camTo(1.2, await f.at(review), 0.6, expoOut);
    await f.until(21.2); f.moveTo(await f.at(confirm, 10, 4), 0.6);
    await f.until(22.0); await f.click();
    await f.until(23.0);
    await release(page);
    const confirmed = page.getByRole('dialog', { name: 'Position confirmed', exact: true });
    await expect(confirmed.getByRole('status')).toHaveText('The contract shows your new position.', { timeout: 20_000 });
    f.cue('confirmed');
    f.camTo(1.2, await f.at(confirmed), 0.4, expoOut);
    const view = confirmed.getByRole('link', { name: 'View portfolio', exact: true });
    await f.until(24.6); f.moveTo(await f.at(view, 10, 4), 0.5);
    await f.until(25.4); await f.click();
    const position = page.getByRole('article', { name: 'Cowboys vs. Packers', exact: true });
    await expect(position).toBeVisible({ timeout: 20_000 });
    await settle(page, 500);
    f.setCam(1, { x: W / 2, y: H / 2 });
    await f.until(26.0);

    // The game is played, the oracle's result is final: claim.
    const m = v2.market(ID);
    m.state = 'final'; m.outcome = 'Yes'; m.finalizedAt = MOCK_NOW - 60;
    await page.reload();
    await connectAdena(page);
    const claim = page.getByRole('button', { name: /^Claim / });
    await expect(claim).toBeVisible({ timeout: 20_000 });
    await settle(page, 600);
    await f.attach(page);
    f.cut();
    const article = page.getByRole('article', { name: 'Cowboys vs. Packers', exact: true });
    f.setCam(1, { x: W / 2, y: H / 2 });
    f.cur = await f.at(article, -200, 60);
    await f.until(26.3); f.moveTo(await f.at(claim, 10, 4), 0.55);
    await f.until(27.0); await f.click();
    await f.until(27.4);
    await release(page);
    const claimed = page.getByRole('status').filter({ hasText: /^Claimed / });
    await expect(claimed).toBeVisible({ timeout: 20_000 });
    f.cue('confirmed');
    // The balance, the claim's line and the position still open.
    await page.waitForTimeout(300);
    const cl = await f.box(claimed);
    const balance = await f.box(page.getByText('Wallet balance', { exact: true }).first());
    const open = await f.box(page.getByRole('article', { name: 'Will Bitcoin outperform Gold in 2026?', exact: true }));
    const heading = await f.box(page.getByRole('heading', { name: 'Your positions', level: 1 }));
    const top = Math.min(balance.y, heading.y) - 28, bottom = open.y + open.height + 36;
    const s = clamp(H / (bottom - top), 1.12, 1.7);
    f.camTo(s, { x: cl.x - 32 + W / (2 * s), y: (top + bottom) / 2 }, 0.7, expoOut);
    await f.until(28.0); f.moveTo({ x: cl.x + cl.width * 0.42, y: cl.y + cl.height + 40 }, 0.6);
    await f.until(30.0);
    await ctx.close();
  }

  // ---- The oracle's page: Polygon has settled the game; the oracle proposes it (30–36 s)
  if (part('status')) {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    const chain = new MockChain();
    const v2 = await enableV2(page, chain);
    v2.markets.push(v2Market(ID, 'Cowboys vs. Packers', CONDITION, ADDRESS, MATCH));
    const sources = new MockSources(chain);
    sources.settle(ID, 'Yes');
    await chain.install(page);
    await sources.install(page);
    await gateSignatures(page);
    await page.goto(`${base}#/status`);
    await expect(page.getByRole('heading', { name: 'Markets', level: 2 })).toBeVisible({ timeout: 30_000 });
    await connectAdena(page);
    const propose = page.getByRole('button', { name: 'Propose Cowboys (Yes) in Adena', exact: true });
    await expect(propose).toBeVisible({ timeout: 20_000 });
    await settle(page, 600);
    await f.attach(page);
    await f.scrollNow(0);
    f.cut();
    const card = propose.locator('xpath=ancestor::section[1]');
    f.setCam(1, { x: W / 2, y: H / 2 });
    f.cur = { x: W * 0.62, y: H * 0.86 };
    await f.until(30.0); f.camTo(1.32, await f.fit(card, 1.32, -40), 0.8, expoOut);
    await f.until(30.6); f.moveTo(await f.at(propose, 20, 4), 0.8);
    await f.until(31.5); await f.click();
    await f.until(32.1);
    if (ONLY) await page.screenshot({ path: `${OUT}/debug-status.png` });
    await release(page);
    const notice = page.getByRole('status').filter({ hasText: 'is proposed for “Cowboys vs. Packers”' });
    await expect(notice).toBeVisible({ timeout: 20_000 });
    f.cue('confirmed');
    await page.waitForTimeout(300);
    f.camTo(1, { x: W / 2, y: H / 2 }, 0.7, expoOut);
    const cowboysRow = page.getByText('Cowboys vs. Packers', { exact: true }).last();
    const rowTop = await cowboysRow.evaluate(el => el.getBoundingClientRect().top + scrollY, undefined, { timeout: 5000 }).catch(() => 700);
    await f.until(33.0); f.scrollTo(Math.max(0, rowTop - H * 0.62), 1.6, quintInOut);
    await f.until(33.4); f.moveTo({ x: W * 0.8, y: H * 0.7 }, 1.0);
    await f.until(36.0);
    await ctx.close();
  }

  // ---- The market on gno.land, live (36–42 s)
  if (part('gnoweb')) {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    await page.goto(`https://onyx.testnets.gno.land/r/nym-sixseven067/markets/v2:${ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await f.attach(page);
    await f.scrollNow(0);
    f.cut();
    const title = page.locator('h1').first();
    f.setCam(1.25, await f.fit(title, 1.25, 260, 48));
    f.cur = { x: W * 0.7, y: H * 0.8 };
    await f.until(36.4); f.camTo(1.05, { x: W / 2, y: H / 2 }, 1.2, expoOut);
    const footer = await page.locator('footer').first().evaluate(el => el.getBoundingClientRect().top + scrollY, undefined, { timeout: 5000 }).catch(() => 4000);
    await f.until(36.8); f.scrollTo(430, 3.2, quintInOut);
    // Close in on the terms, the record and the quotes; gnoweb's own footer stays below the frame.
    await f.until(38.2); f.camTo(1.3, { x: W / 2.6 + 8, y: Math.max(H / 2.6, footer - 430 - 24 - H / 2.6) }, 1.6, inOut);
    f.moveTo({ x: W * 0.55, y: H * 0.6 }, 2.4, inOut);
    await f.until(41.4); f.show(false, 0.3);
    await f.until(42.0);
    await f.holdUntil(DURATION);
    await ctx.close();
  }

  await f.close();
  writeFileSync('reel/walk/record.json', `${JSON.stringify({ fps: FPS, frames: f.frame, cues: f.cues }, null, 1)}\n`);
});
