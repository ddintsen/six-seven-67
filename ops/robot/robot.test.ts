import assert from 'node:assert/strict';
import { test } from 'node:test';
import { twoSided, v1Price } from './robot.ts';

test('a v1 quote is the midpoint to a tenth of a cent, never 0 or 1', () => {
  assert.equal(v1Price(439_500), 440_000);
  assert.equal(v1Price(641_400), 641_000);
  assert.equal(v1Price(200), 1_000);
  assert.equal(v1Price(999_900), 999_000);
});

test('v2 quotes are two-sided inside the band', () => {
  assert.deepEqual(twoSided(500_000, 0), { yes: 500_000, no: 500_000 });
  assert.deepEqual(twoSided(600_000, 10_000), { yes: 605_000, no: 405_000 });
  assert.equal(twoSided(20_000, 0), null);
});
