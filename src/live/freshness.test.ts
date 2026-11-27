import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freshnessText } from './freshness.ts';
import { parseMidpoint } from './polymarket.ts';

const now = 1_760_000_000;

test('freshness says when the price was set', () => {
  assert.equal(freshnessText(now - 30, null, 'Yes', now), '67 quote updated just now.');
  assert.equal(freshnessText(now - 25 * 60, null, 'Yes', now), '67 quote updated 25 min ago.');
  assert.equal(freshnessText(now - 6 * 3600 - 120, null, 'Yes', now), '67 quote updated 6 h ago.');
  assert.equal(freshnessText(now - 2 * 86_400, null, 'Yes', now), '67 quote updated on 7 Oct 2025.');
});

test('a reference identifies the source, outcome and its own observation time', () => {
  assert.equal(
    freshnessText(now - 2 * 86_400, { ppm: 439_500, observedAt: now }, 'Yes', now),
    '67 quote updated on 7 Oct 2025. Polymarket reference for Yes was 43.95% (checked 9 Oct 2025, 08:53 UTC).',
  );
  assert.match(freshnessText(now - 3600, { ppm: 625_000, observedAt: now - 120 }, 'Leverkusen', now), /Leverkusen was 62\.5% \(checked 9 Oct 2025, 08:51 UTC\)/);
});

test('a midpoint is read only inside (0, 1)', () => {
  assert.equal(parseMidpoint({ mid: '0.4395' }), 439_500);
  assert.equal(parseMidpoint({ mid: 0.5 }), 500_000);
  for (const bad of [null, [], {}, { mid: '0' }, { mid: '1' }, { mid: 'x' }, { mid: '-0.2' }, 'mid']) assert.equal(parseMidpoint(bad), null);
});
