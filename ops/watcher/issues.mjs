// Turns watcher alerts into GitHub issues, once each, so the owner gets one
// e-mail and phone notification per event. Needs GITHUB_TOKEN with issues:write
// and GITHUB_REPOSITORY. Usage: node ops/watcher/issues.mjs <alerts.json>
import { readFileSync } from 'node:fs';

const [file] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const run = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
const alerts = JSON.parse(readFileSync(file, 'utf8'));
const api = async (path, init = {}) => {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28', ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`GitHub ${path}: HTTP ${response.status}`);
  return response.json();
};
// Keys of every watcher issue, open or closed: closing an issue means "seen", not "tell me again".
const known = new Set();
for (let page = 1; page <= 10; page++) {
  const issues = await api(`/issues?labels=watcher&state=all&per_page=100&page=${page}`);
  for (const issue of issues) { const key = /<!-- key: (.+?) -->/.exec(issue.body ?? '')?.[1]; if (key) known.add(key); }
  if (issues.length < 100) break;
}
// Labels are created once, so issue creation never fails on a missing label.
const colours = { watcher: '1f6f5c', critical: 'b60205', action: '0e4f9e', notice: '6a737d' };
const existing = new Set((await api('/labels?per_page=100')).map(label => label.name));
for (const [name, color] of Object.entries(colours)) {
  if (!existing.has(name) && alerts.length) await api('/labels', { method: 'POST', body: JSON.stringify({ name, color }) });
}
let created = 0;
for (const alert of alerts) {
  if (known.has(alert.key)) continue;
  await api('/issues', { method: 'POST', body: JSON.stringify({
    title: `67: ${alert.title}`,
    body: `${alert.body}\n\nSeverity: ${alert.severity}.${run ? ` Run: ${run}` : ''}\n\nClose this issue once handled; the watcher will not repeat it.\n\n<!-- key: ${alert.key} -->`,
    labels: ['watcher', alert.severity],
  }) });
  known.add(alert.key);
  created++;
}
console.log(`${alerts.length} alerts, ${created} new issues`);
