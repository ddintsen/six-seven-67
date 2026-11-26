import assert from 'node:assert/strict';
import test from 'node:test';
import { closing, idFrom, outcomesOf, SENSITIVE, topicOf, type GammaMarket } from './listing.ts';
import { twoSided } from '../../ops/robot/robot.ts';

const NOW = Date.parse('2026-10-15T00:00:00Z') / 1000;
const market = (over: Partial<GammaMarket>): GammaMarket => ({ question: 'Q?', conditionId: '0x' + 'a'.repeat(64), slug: 'q', description: 'd', outcomes: '["Yes","No"]', clobTokenIds: '["1","2"]', active: true, closed: false, ...over });

test('a game closes ten minutes before kick-off; other markets twelve hours before a far end date', () => {
  const game = closing(market({ gameStartTime: '2026-10-18 17:00:00+00', endDate: '2026-10-25T00:00:00Z' }), NOW, 6 * 3600);
  assert.deepEqual(game, { at: Date.parse('2026-10-18T16:50:00Z') / 1000, reason: 'Ten minutes before the game starts.' });
  // Too soon for the robot's six-hour lead, and for the hand-picked list's two days.
  assert.equal(closing(market({ gameStartTime: '2026-10-15 03:00:00+00' }), NOW, 6 * 3600), null);
  assert.equal(closing(market({ gameStartTime: '2026-10-16 03:00:00+00' }), NOW), null);
  // Without an event time, a market ending within 30 days may be decided while trading is open.
  assert.equal(closing(market({ endDate: '2026-11-01T00:00:00Z' }), NOW), null);
  assert.equal(closing(market({ endDate: '2027-03-01T00:00:00Z' }), NOW)?.at, Date.parse('2027-02-28T12:00:00Z') / 1000);
  // Election-day races close an hour before the first polls close.
  assert.equal(closing(market({ question: 'Will the Democrats win the Senate race in 2026?', endDate: '2026-11-30T00:00:00Z' }), NOW)?.at, Date.parse('2026-11-03T22:00:00Z') / 1000);
});

test('outcomes: Yes and No always, two names only for realm v2 and only within its rule', () => {
  assert.deepEqual(outcomesOf({ outcomes: '["Yes","No"]' }, false), ['Yes', 'No']);
  assert.equal(outcomesOf({ outcomes: '["Lakers","Celtics"]' }, false), null);
  assert.deepEqual(outcomesOf({ outcomes: '["Lakers","Celtics"]' }, true), ['Lakers', 'Celtics']);
  assert.equal(outcomesOf({ outcomes: '["Lakers","Lakers"]' }, true), null);
  assert.equal(outcomesOf({ outcomes: '["[x](y)","Celtics"]' }, true), null);
  assert.equal(outcomesOf({ outcomes: '["A","B","C"]' }, true), null);
  assert.equal(outcomesOf({ outcomes: 'not json' }, true), null);
});

test('topics, readable IDs and the sensitive filter', () => {
  assert.equal(topicOf({ slug: 'e', title: 'Seahawks vs. Broncos', tags: [{ label: 'NFL' }] }), 'Sports');
  assert.equal(topicOf({ slug: 'e', title: 'Fed decision', tags: [{ label: 'Fed Rates' }] }), 'Economy');
  assert.equal(topicOf({ slug: 'e', title: 'Daily weather', tags: [{ label: 'Weather' }] }), null);
  assert.equal(topicOf({ slug: 'e', title: 'Ceasefire talks', tags: [{ label: 'Ukraine' }] }), null);
  const taken = new Set(['nfl-sea-den-2026-10-16']);
  assert.equal(idFrom('nfl-sea-den-2026-10-16', taken), 'nfl-sea-den-2026-10-16-2');
  assert.equal(idFrom('will-x-happen-1760000000000', new Set()), 'will-x-happen');
  assert.ok(SENSITIVE.test('Will the war end?') && !SENSITIVE.test('Will the Lakers win?'));
});

test('the robot quotes both sides inside the band and never below one plus the spread', () => {
  assert.deepEqual(twoSided(552_400, 0), { yes: 552_000, no: 448_000 });
  assert.deepEqual(twoSided(500_000, 20_000), { yes: 510_000, no: 510_000 });
  assert.equal(twoSided(20_000, 0), null);
  assert.equal(twoSided(975_000, 0), null);
  const q = twoSided(400_000, 15_000)!;
  assert.ok(q.yes + q.no >= 1_015_000 && q.yes >= 30_000 && q.no <= 970_000);
});
