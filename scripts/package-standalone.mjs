import { readFile, writeFile, readdir, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The workspace script is also included at 67/scripts/package-standalone.mjs in the source ZIP.
const scriptFile = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptFile);
const project = path.basename(scriptDirectory) === 'scripts'
  ? path.resolve(scriptDirectory, '..')
  : path.resolve(scriptDirectory, '../outputs/67');
const outputDirectory = path.dirname(project);
const dist = await realpath(path.join(project, 'dist'));
const mimeTypes = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon' };

async function localAsset(reference, from = dist) {
  if (/^(?:[a-z]+:|\/\/)/i.test(reference)) throw new Error(`External build resource is not allowed: ${reference}`);
  const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
  const candidate = path.resolve(clean.startsWith('/') ? dist : from, clean.replace(/^\/+/, ''));
  const resolved = await realpath(candidate);
  if (!resolved.startsWith(`${dist}${path.sep}`)) throw new Error(`Build resource escapes dist: ${reference}`);
  return resolved;
}

async function dataUri(reference, from) {
  if (reference.startsWith('data:')) return reference;
  const file = await localAsset(reference, from);
  const mime = mimeTypes[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unsupported embedded resource: ${file}`);
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

async function replaceAsync(text, expression, replacement) {
  const matches = [...text.matchAll(expression)];
  const values = await Promise.all(matches.map(match => replacement(...match)));
  let result = text;
  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index];
    result = result.slice(0, match.index) + values[index] + result.slice(match.index + match[0].length);
  }
  return result;
}

let html = await readFile(path.join(dist, 'index.html'), 'utf8');
let scripts = 0;
let styles = 0;
html = await replaceAsync(html, /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, async (_tag, reference) => {
  scripts++;
  const javascript = await readFile(await localAsset(reference), 'utf8');
  if (/\bimport\s*\(|(?:^|[;\n}])\s*(?:import\s|export\s.*?\bfrom\s)/m.test(javascript)) {
    throw new Error('Standalone delivery requires a single JavaScript bundle without module imports.');
  }
  return `<script type="module">${javascript.replace(/<\/script/gi, '<\\/script')}</script>`;
});
html = await replaceAsync(html, /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi, async tag => {
  styles++;
  const reference = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
  if (!reference) throw new Error('A stylesheet has no href.');
  const file = await localAsset(reference);
  let css = await readFile(file, 'utf8');
  if (/@import\b/i.test(css)) throw new Error('Standalone delivery does not allow CSS imports.');
  css = await replaceAsync(css, /url\(\s*["']?([^"'\s)]+)["']?\s*\)/gi, async (_url, asset) => `url("${await dataUri(asset, path.dirname(file))}")`);
  return `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
});
html = await replaceAsync(html, /<link\b[^>]*>/gi, async tag => {
  const relation = tag.match(/\brel=["']([^"']+)["']/i)?.[1];
  const reference = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
  if (!reference) return tag;
  // A file opened from disk is never added to a home screen.
  if (relation === 'apple-touch-icon') return '';
  // A file opened from disk has no canonical address of its own; the live site keeps it.
  if (relation === 'canonical') return '';
  if (relation !== 'icon' && relation !== 'preload') throw new Error(`Unexpected linked build resource: ${tag}`);
  // Embedded CSS already owns the data-URI font; a file-origin preload produces an unused-resource warning.
  if (relation === 'preload' && /\bas=["']font["']/i.test(tag)) return '';
  return tag.replace(reference, await dataUri(reference));
});
if (scripts !== 1 || styles < 1) throw new Error(`Unexpected build layout: ${scripts} scripts, ${styles} stylesheets.`);
if (/<(?:script|link|img|iframe|source|video|audio)\b[^>]*(?:src|href|poster)=["'](?!data:|#)/i.test(html)) {
  throw new Error('The standalone HTML still contains a non-embedded resource.');
}
const licenses = [];
for (const [id, file] of [['handjet-license', 'Handjet-OFL.txt'], ['ibm-plex-sans-license', 'IBMPlexSans-OFL.txt'], ['ibm-plex-mono-license', 'IBMPlexMono-OFL.txt']]) {
  const text = await readFile(path.join(project, 'public/fonts', file), 'utf8');
  licenses.push(`<script type="text/plain" id="${id}">${text.replace(/<\/script/gi, '<\\/script')}</script>`);
}
html = html.replace('</head>', `<!-- Handjet, IBM Plex Sans and IBM Plex Mono are distributed under SIL OFL 1.1; original licenses below. -->\n${licenses.join('\n')}\n</head>`);

// A small dependency-free ZIP writer. STORE entries preserve original source bytes.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const excluded = new Set(['node_modules', 'dist', '.qa', 'test-results', 'playwright-report', 'coverage', '.git', '_to_delete', 'previews', 'brief', 'deploy', 'history']);
async function sourceEntries(directory, prefix = '67') {
  const entries = [];
  for (const name of (await readdir(directory)).sort()) {
    if (excluded.has(name) || name.startsWith('.env')) continue;
    const file = path.join(directory, name);
    const information = await stat(file);
    const resolved = await realpath(file);
    if (!resolved.startsWith(`${project}${path.sep}`)) throw new Error(`Source entry escapes the project: ${file}`);
    if (information.isDirectory()) entries.push(...await sourceEntries(file, `${prefix}/${name}`));
    else if (information.isFile()) entries.push({ name: `${prefix}/${name}`, data: await readFile(file) });
  }
  return entries;
}

function createZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  if (entries.length > 65535) throw new Error('Too many source files for a ZIP archive.');
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const size = entry.data.length;
    if (size > 0xffffffff || offset > 0xffffffff) throw new Error('Source archive exceeds the supported ZIP size.');
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0x0021, 12); // Fixed 1980-01-01 date makes identical inputs reproducible.
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, entry.data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(0x0021, 14); record.writeUInt32LE(checksum, 16); record.writeUInt32LE(size, 20); record.writeUInt32LE(size, 24);
    record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += local.length + name.length + size;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const entries = await sourceEntries(project);
const packagedScript = '67/scripts/package-standalone.mjs';
if (!entries.some(entry => entry.name === packagedScript)) entries.push({ name: packagedScript, data: await readFile(scriptFile) });
entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
for (const required of ['67/package-lock.json', '67/src/main.tsx', '67/public/fonts/Handjet-OFL.txt', '67/docs/ARCHITECTURE.md', '67/README.md']) {
  if (!entries.some(entry => entry.name === required)) throw new Error(`Required source file is missing: ${required}`);
}
const archive = createZip(entries);
await writeFile(path.join(outputDirectory, '67.html'), html);
await writeFile(path.join(outputDirectory, '67-source.zip'), archive);
console.log(`Created 67.html (${Buffer.byteLength(html)} bytes) and 67-source.zip (${entries.length} files, ${archive.length} bytes).`);
