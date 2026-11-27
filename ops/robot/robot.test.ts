import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LISTING_COST_UGNOT, pickListings, surplusOf, twoSided, v1Moves, v1Price, windowCommitment, type ListingWindow } from './robot.ts';
import { feeUgnot, gasWanted, ugnotPerGas } from './signer.ts';
import { JUDGING_WINDOW, robotSettings, timeOf } from './settings.ts';

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

test('surplus is read from the raw answer of two int64 values', () => {
  assert.equal(surplusOf('(3000000 int64)\n(0 int64)'), 3_000_000n);
  assert.equal(surplusOf('(2500000 int64)\n(57560 int64)'), 2_557_560n);
  assert.equal(surplusOf('(-1 int64)\n(5 int64)'), 0n);
  assert.equal(surplusOf('("x" string)'), 0n);
});

test('gas comes from the simulation with a margin, and the fee follows the gas', () => {
  assert.equal(gasWanted(5_474_471), 7_069_366);
  assert.equal(gasWanted(0), 500_000);
  assert.equal(gasWanted(500_000_000), 100_000_000);
  // Onyx charges 1 ugnot per 1,000 gas; a quote used about 5.5 million in October.
  assert.equal(ugnotPerGas({ amount: 1, gas: 1000 }), 0.001);
  assert.equal(ugnotPerGas(null), 0.001);
  assert.equal(feeUgnot(gasWanted(5_474_471), 0.001), 10_605);
  assert.equal(feeUgnot(25_000_000, 0.001), 37_500); // what one quote cost in October
});

const DAY = 86_400;
const now = Date.UTC(2026, 11, 10) / 1000;
const window: ListingWindow = { from: JUDGING_WINDOW.from, to: JUDGING_WINDOW.to, max: 4, reserveUgnot: 8_000_000n };
const options = { window, liveMax: 1, minLifeSeconds: 2 * DAY, maxOpenListed: 6, reserveUgnot: 3_000_000n };
const match = (at: number, volumeNum: number) => ({ m: { volumeNum }, close: { at } });

test('window matches come first, the most traded first, up to the window limit', () => {
  const sunday = JUDGING_WINDOW.from + 3600; // Sunday night's game, 01:00 UTC on 21 December
  const candidates = [match(sunday, 50_000), match(sunday + DAY, 900_000), match(sunday + 2 * 3600, 300_000), match(now + 3 * DAY, 80_000), match(now + DAY, 999_999)];
  const picks = pickListings(candidates, [], now, options);
  assert.deepEqual(picks.map(p => [p.slot, p.candidate.m.volumeNum, p.reserveUgnot]), [
    ['window', 900_000, 8_000_000n], ['window', 300_000, 8_000_000n], ['window', 50_000, 8_000_000n],
    // One near-term match that trades at least two days; the busier one closes tomorrow, too soon.
    ['live', 80_000, 3_000_000n],
  ]);
  // Two window markets already trade: two more at most; the near-term slot is taken too.
  const open = [{ closesAt: sunday }, { closesAt: sunday + 60 }, { closesAt: now + 4 * DAY }];
  assert.deepEqual(pickListings(candidates, open, now, options).map(p => p.candidate.m.volumeNum), [900_000, 300_000]);
  // The cap on markets trading at once wins over both.
  assert.equal(pickListings(candidates, Array.from({ length: 6 }, () => ({ closesAt: now + 9 * DAY })), now, options).length, 0);
});

test('no near-term listing once the window has started, nothing after it', () => {
  const candidates = [match(JUDGING_WINDOW.from + 3600, 1), match(JUDGING_WINDOW.from + 3 * DAY, 2)];
  const during = JUDGING_WINDOW.from - 3600;
  assert.deepEqual(pickListings(candidates, [], JUDGING_WINDOW.from + 60, options).map(p => p.slot), ['window']);
  assert.deepEqual(pickListings(candidates, [], during, options).map(p => p.slot), ['window']);
  assert.equal(pickListings(candidates, [], JUDGING_WINDOW.to + 60, options).length, 0);
});

test('a near-term listing leaves what the window still needs', () => {
  assert.equal(windowCommitment([], { window }), 4n * (8_000_000n + LISTING_COST_UGNOT));
  assert.equal(windowCommitment([{ closesAt: JUDGING_WINDOW.from + 1 }], { window }), 3n * (8_000_000n + LISTING_COST_UGNOT));
  assert.equal(windowCommitment([], { window: null }), 0n);
});

test('v1: brakes first, then drifts from two points, largest first', () => {
  const m = (id: string, yesPricePpm: number) => ({ id, yesPricePpm, quoteVersion: 1 });
  const moves = v1Moves([
    { m: m('a', 500_000), status: { actions: [{ kind: 'requote', yesPricePpm: 515_000, driftPpm: 15_000 }] } },
    { m: m('b', 500_000), status: { actions: [{ kind: 'requote', yesPricePpm: 560_000, driftPpm: 60_000 }] } },
    { m: m('c', 500_000), status: { actions: [{ kind: 'brake', yesPricePpm: 1, reason: 'settled' }] } },
    { m: m('d', 400_000), status: { actions: [{ kind: 'requote', yesPricePpm: 425_000, driftPpm: 25_000 }] } },
    { m: m('e', 999_999), status: { actions: [{ kind: 'brake', yesPricePpm: 999_999 }] } },
  ], 20_000);
  assert.deepEqual(moves.map(x => [x.m.id, x.kind, x.price]), [['c', 'brake', 1], ['b', 'requote', 560_000], ['d', 'requote', 425_000]]);
});

test('settings: the judging window by default, dates from the environment, off on request', () => {
  const s = robotSettings({});
  assert.deepEqual([s.maxOpenListed, s.liveMax, s.reserveUgnot, s.minBalanceUgnot], [6, 1, 3_000_000n, 8_000_000n]);
  assert.deepEqual(s.window, { from: 1_797_811_200, to: 1_797_984_000, max: 4, reserveUgnot: 8_000_000n });
  assert.equal(robotSettings({ ROBOT_WINDOW_FROM: '2027-01-02T00:00:00Z' }).window?.from, Date.UTC(2027, 0, 2) / 1000);
  assert.equal(robotSettings({ ROBOT_WINDOW: 'off' }).window, null);
  assert.equal(timeOf('nonsense', 7), 7);
  assert.equal(timeOf('1797811200', 7), 1_797_811_200);
});
