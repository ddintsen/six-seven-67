// Writes the film's captions as SRT and VTT (docs/reel/ and previews/reel/).
//   node --experimental-strip-types reel/walk/captions.ts
import { writeFileSync } from 'node:fs';
import { CAPTIONS, ROBOT } from './film.ts';

const stamp = (t: number, sep: string) => {
  const ms = Math.round(t * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
};
const cues = [
  ...CAPTIONS.map(c => ({ from: c.from, to: c.to + 0.3, text: `${c.lines.join(' ')}\n${c.note}` })),
  { from: ROBOT.from + 0.25, to: ROBOT.to - 0.1, text: `${ROBOT.title}\n${ROBOT.note}` },
];
const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.from, ',')} --> ${stamp(c.to, ',')}\n${c.text}\n`).join('\n');
const vtt = `WEBVTT\n\n${cues.map(c => `${stamp(c.from, '.')} --> ${stamp(c.to, '.')}\n${c.text}\n`).join('\n')}`;
for (const dir of ['docs/reel', 'previews/reel']) {
  writeFileSync(`${dir}/67-walkthrough.en.srt`, srt);
  writeFileSync(`${dir}/67-walkthrough.en.vtt`, vtt);
}
console.log(`${cues.length} captions`);
