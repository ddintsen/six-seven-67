// Copies the production build into deploy/six-seven-67/ with a vercel.json,
// ready for `vercel deploy deploy/six-seven-67 --prod`. The folder name gives
// the Vercel project its name. Generated: rebuild, never edit by hand.
//   npm run build && node scripts/prepare-deploy.mjs [--robot]
// --robot adds the listing robot (ops/robot) as the function api/robot.js and
// its schedule: six daily Vercel Cron jobs four hours apart, the most the Hobby
// plan allows without paying (each job may run once a day).
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const withRobot = process.argv.includes('--robot');
const project = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(project, 'dist');
const target = path.join(project, 'deploy', 'six-seven-67');

if (!(await stat(path.join(dist, 'index.html')).catch(() => null))) throw new Error('Run npm run build first.');
// Keep the Vercel link (.vercel/project.json: project and team IDs, no secrets).
await mkdir(target, { recursive: true });
for (const name of await readdir(target)) if (name !== '.vercel') await rm(path.join(target, name), { recursive: true, force: true });
await cp(dist, target, { recursive: true });

const config = {
  cleanUrls: false,
  trailingSlash: false,
  // the67.click is the site's address (owner, 15 October 2026). The project's
  // domain settings redirect the old vercel.app alias (308); this rule is a
  // fallback and did not take effect on that alias. Browsers keep the #route.
  redirects: [
    { source: '/:path*', has: [{ type: 'host', value: 'six-seven-67-phi.vercel.app' }], destination: 'https://the67.click/:path*', permanent: true },
  ],
  // Market pictures come from Polymarket's upload bucket at full size (about
  // 120 KB each); Vercel resizes them to thumbnails (src/ui/MarketThumb.tsx).
  // On the Hobby plan this is free up to its monthly limit; past it the app
  // falls back to the original picture.
  images: {
    sizes: [96, 160],
    remotePatterns: [{ protocol: 'https', hostname: 'polymarket-upload.s3.us-east-2.amazonaws.com' }],
    formats: ['image/webp'],
    minimumCacheTTL: 2678400,
  },
  headers: [
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/fonts/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] },
  ],
};
if (withRobot) {
  const { build } = await import('esbuild');
  await build({
    entryPoints: [path.join(project, 'ops/robot/api.ts')], outfile: path.join(target, 'api/robot.js'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'warning', legalComments: 'none',
    footer: { js: 'module.exports = module.exports.default;' },
  });
  config.functions = { 'api/robot.js': { maxDuration: 300 } };
  // Minutes off the hour, so the jobs do not queue behind everyone else's.
  config.crons = [0, 4, 8, 12, 16, 20].map((hour, slot) => ({ path: `/api/robot?slot=${slot}`, schedule: `17 ${hour} * * *` }));
}
await writeFile(path.join(target, 'vercel.json'), `${JSON.stringify(config, null, 2)}\n`);

async function list(dir, prefix = '') {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const file = path.join(dir, name);
    if (name === '.vercel') continue;
    if ((await stat(file)).isDirectory()) out.push(...await list(file, `${prefix}${name}/`));
    else out.push({ name: `${prefix}${name}`, sha: createHash('sha256').update(await readFile(file)).digest('hex') });
  }
  return out;
}
const files = await list(target);
const source = new Map((await list(dist)).map(file => [file.name, file.sha]));
for (const file of files) if (file.name !== 'vercel.json' && !file.name.startsWith('api/') && source.get(file.name) !== file.sha) throw new Error(`Copy mismatch: ${file.name}`);
console.log(`deploy/six-seven-67: ${files.length} files, copy verified against dist${withRobot ? '; the robot function and its six daily jobs added' : ''}.`);
