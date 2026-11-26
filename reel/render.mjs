// Records the reel frame by frame from the dev server (npm run dev).
//   node reel/render.mjs stills 1,4.2,9 [--scale 0.5] [--out dir]     PNG stills
//   node reel/render.mjs video [--from 0] [--to 60] [--fps 30] [--scale 1] [--layer both|3d|type] [--out file]
// Frames are piped straight into ffmpeg. --layer 3d writes the sets alone,
// losslessly (H.264 4:4:4, qp 0); --layer type writes the type alone with
// alpha (PNG in MOV); both writes the finished picture (H.264, yuv420p).
// Software WebGL is slow but deterministic: each frame is drawn from t alone.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [mode = 'stills', list = '0'] = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const scale = Number(arg('scale', '1'));
const layer = arg('layer', 'both');
const executablePath = process.env.REEL_BROWSER || '/opt/pw-browsers/chromium';
const base = process.env.REEL_URL || 'http://127.0.0.1:6767/reel/index.html';

const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
page.setDefaultTimeout(300000);
page.on('console', message => { if (message.type() === 'error') console.error('page:', message.text()); });
page.on('pageerror', error => console.error('page error:', error.message));
await page.goto(`${base}?scale=${scale}&layer=${layer}${process.env.REEL_QUERY ? `&${process.env.REEL_QUERY}` : ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__reel && window.__reel.ready);
const { fps: reelFps, duration, cues } = await page.evaluate(() => ({ fps: window.__reel.fps, duration: window.__reel.duration, cues: window.__reel.cues }));

if (mode === 'cues') {
  const out = arg('out', 'reel/cues.json');
  writeFileSync(out, `${JSON.stringify({ duration, cues }, null, 1)}\n`);
  console.log(`${cues.length} cues → ${out}`);
} else if (mode === 'stills') {
  const out = arg('out', '/tmp/claude-0/reel-stills');
  mkdirSync(out, { recursive: true });
  for (const t of list.split(',').map(Number)) {
    const started = Date.now();
    await page.evaluate(time => window.__reel.seek(time), t);
    const file = path.join(out, `t${t.toFixed(2).padStart(6, '0')}.png`);
    await page.screenshot({ path: file, omitBackground: layer === 'type' });
    console.log(file, `${Date.now() - started} ms`);
  }
} else if (mode === 'video') {
  const fps = Number(arg('fps', String(reelFps)));
  const from = Number(arg('from', '0'));
  const to = Number(arg('to', String(duration)));
  const out = arg('out', '/tmp/claude-0/reel.mp4');
  const encode = {
    both: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
    '3d': ['-c:v', 'libx264', '-preset', 'veryfast', '-qp', '0', '-pix_fmt', 'yuv444p'],
    type: ['-c:v', 'png', '-pix_fmt', 'rgba'],
  }[layer];
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    ...encode, '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const first = Math.round(from * fps);
  const last = Math.round(to * fps);
  const started = Date.now();
  for (let frame = first; frame < last; frame++) {
    await page.evaluate(time => window.__reel.seek(time), frame / fps);
    const png = await page.screenshot({ type: 'png', omitBackground: layer === 'type' });
    if (!ffmpeg.stdin.write(png)) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
    if ((frame - first) % 30 === 0) {
      const done = frame - first + 1;
      const rate = (Date.now() - started) / done;
      console.log(`frame ${frame}/${last} ${(rate / 1000).toFixed(2)} s each, ${(((last - frame) * rate) / 60000).toFixed(1)} min left`);
    }
  }
  ffmpeg.stdin.end();
  await new Promise(resolve => ffmpeg.on('close', resolve));
  console.log(`${out}: ${last - first} frames in ${((Date.now() - started) / 60000).toFixed(1)} min`);
}
await browser.close();
