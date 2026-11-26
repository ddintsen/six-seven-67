import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freshnessText } from './freshness.ts';
import { parseMidpoint } from './polymarket.ts';

const now = 1_760_000_000;

test('freshness says when the price was set', () => {
  assert.equal(freshnessText(now - 30, 440_000, null, 'Yes', now), 'Updated just now.');
  assert.equal(freshnessText(now - 25 * 60, 440_000, null, 'Yes', now), 'Updated 25 min ago.');
  assert.equal(freshnessText(now - 6 * 3600 - 120, 440_000, null, 'Yes', now), 'Updated 6 h ago.');
  assert.equal(freshnessText(now - 2 * 86_400, 440_000, null, 'Yes', now), 'Updated on 7 Oct 2025.');
});

test('freshness compares with Polymarket only when they differ by two points or more', () => {
  assert.equal(freshnessText(now - 3600, 440_000, 459_000, 'Yes', now), 'Updated 1 h ago, in line with Polymarket.');
  assert.equal(freshnessText(now - 3600, 440_000, 421_000, 'Yes', now), 'Updated 1 h ago, in line with Polymarket.');
  assert.equal(freshnessText(now - 3600, 492_000, 439_500, 'Yes', now), 'Updated 1 h ago. Polymarket is at 44% now.');
  assert.equal(freshnessText(now - 3600, 440_000, 460_000, 'Yes', now), 'Updated 1 h ago. Polymarket is at 46% now.');
  assert.equal(freshnessText(now - 3600, 595_000, 625_000, 'Leverkusen', now), 'Updated 1 h ago. Polymarket has Leverkusen at 63% now.');
});

test('a midpoint is read only inside (0, 1)', () => {
  assert.equal(parseMidpoint({ mid: '0.4395' }), 439_500);
  assert.equal(parseMidpoint({ mid: 0.5 }), 500_000);
  for (const bad of [null, [], {}, { mid: '0' }, { mid: '1' }, { mid: 'x' }, { mid: '-0.2' }, 'mid']) assert.equal(parseMidpoint(bad), null);
});
