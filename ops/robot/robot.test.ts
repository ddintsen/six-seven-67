import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LISTING_COST_UGNOT, pickListings, slotLimits, surplusOf, twoSided, v1Moves, v1Price, windowCommitment, type ListingWindow } from './robot.ts';
import { MsgCall } from '@gnolang/gno-js-client';
import { ResponseDeliverTx, Tx, uint8ArrayToBase64, type ABCIResponse, type AbciQueryParams } from '@gnolang/tm2-js-client';
import { feeUgnot, gasWanted, simulateGas, simulationJudged, SimulationRefused, ugnotPerGas } from './signer.ts';
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

const robotCall = (): Tx => ({
  messages: [{ type_url: '/vm.m_call', value: MsgCall.encode({ caller: 'g13wgyakt05a202ekc09vk8mgdg9g4gdp6upxuna', send: '', max_deposit: '', pkg_path: 'gno.land/r/nym-sixseven067/markets/v2', func: 'WithdrawSurplus', args: ['nfl-sea-den-2026-10-16'] }).finish() }],
  fee: { gas_wanted: 10_000_000n, gas_fee: '15000ugnot' }, memo: '', signatures: [],
});
// The node's answer to `.app/simulate`, as tm2-js-client reads it.
const simulated = (deliver: ResponseDeliverTx) => ({
  response: { ResponseBase: { Error: null, Data: null, Events: null, Log: '', Info: '' }, Key: null, Value: uint8ArrayToBase64(ResponseDeliverTx.encode(deliver).finish()), Proof: null, Height: '0' },
}) as unknown as ABCIResponse;

test('a simulation sends the transaction bytes once, and returns the gas the call used', async () => {
  let sent: AbciQueryParams | undefined;
  const gas = await simulateGas({ abciQuery: async params => { sent = params; return simulated(ResponseDeliverTx.fromPartial({ gas_used: 5_474_471n })); } }, robotCall());
  assert.equal(gas, 5_474_471);
  assert.equal(sent?.path, '.app/simulate');
  // The bytes themselves: tm2-rpc adds the one base64 layer for the JSON-RPC call.
  // tm2-js-client's estimateGas sent their base64 text, which Onyx cannot decode.
  assert.deepEqual(sent?.data, Tx.encode(robotCall()).finish());
  assert.equal(Tx.decode(sent!.data).messages[0].type_url, '/vm.m_call');
});

test('only a simulation that ran and refused stops a call', async () => {
  const refusal = await simulateGas({ abciQuery: async () => simulated(ResponseDeliverTx.fromPartial({ response_base: { error: { type_url: '/std.InternalError', value: new Uint8Array() }, log: 'market not found' } })) }, robotCall()).catch((error: unknown) => error);
  assert.ok(refusal instanceof SimulationRefused);
  assert.equal(refusal.log, 'market not found');
  assert.equal(simulationJudged(refusal), true);
  // What Onyx answered on 27 November to every call simulated by tm2-js-client's estimateGas.
  const undecoded = { response: { ResponseBase: { Error: { '@type': '/std.TxDecodeError', value: 'unable to decode tx' }, Log: 'unknown field number 8 for Tx' }, Value: null } } as unknown as ABCIResponse;
  const decode = await simulateGas({ abciQuery: async () => undecoded }, robotCall()).catch((error: unknown) => error);
  assert.ok(decode instanceof Error);
  assert.equal(simulationJudged(decode), false);
  assert.equal(simulationJudged(new SimulationRefused('/std.TxDecodeError', 'unknown field number 8 for Tx')), false);
  assert.equal(simulationJudged(new TypeError('fetch failed')), false);
});

const DAY = 86_400;
const now = Date.UTC(2026, 11, 10) / 1000;
const window: ListingWindow = { from: JUDGING_WINDOW.from, to: JUDGING_WINDOW.to, max: 4, reserveUgnot: 8_000_000n };
const options = { window, liveMax: 1, minLifeSeconds: 2 * DAY, maxOpenListed: 6, reserveUgnot: 3_000_000n };
const match = (at: number, volumeNum: number) => ({ m: { volumeNum }, close: { at } });

test('window matches come first, the most traded first; near-term ones must trade two days', () => {
  const sunday = JUDGING_WINDOW.from + 3600; // Sunday night's game, 01:00 UTC on 21 December
  const candidates = [match(sunday, 50_000), match(sunday + DAY, 900_000), match(sunday + 2 * 3600, 300_000), match(now + 3 * DAY, 80_000), match(now + DAY, 999_999)];
  assert.deepEqual(pickListings(candidates, now, options).map(p => [p.slot, p.candidate.m.volumeNum, p.reserveUgnot]), [
    ['window', 900_000, 8_000_000n], ['window', 300_000, 8_000_000n], ['window', 50_000, 8_000_000n],
    // The busier near-term match closes tomorrow, too soon.
    ['live', 80_000, 3_000_000n],
  ]);
});

test('slots: the window limit, one near-term market, and the cap on markets trading at once', () => {
  const sunday = JUDGING_WINDOW.from + 3600;
  assert.deepEqual(slotLimits([], now, options), { room: 6, window: 4, live: 1 });
  // Two window markets and a near-term one trade already.
  assert.deepEqual(slotLimits([{ closesAt: sunday }, { closesAt: sunday + 60 }, { closesAt: now + 4 * DAY }], now, options), { room: 3, window: 2, live: 0 });
  assert.equal(slotLimits(Array.from({ length: 6 }, () => ({ closesAt: now + 9 * DAY })), now, options).room, 0);
  // Once the window opens, no near-term slot; after it, nothing.
  assert.deepEqual(slotLimits([], JUDGING_WINDOW.from + 60, options), { room: 6, window: 4, live: 0 });
  assert.deepEqual(slotLimits([], JUDGING_WINDOW.to + 60, options), { room: 6, window: 0, live: 0 });
});

test('no near-term pick once the window has started, nothing after it', () => {
  const candidates = [match(JUDGING_WINDOW.from + 3600, 1), match(JUDGING_WINDOW.from + 3 * DAY, 2)];
  assert.deepEqual(pickListings(candidates, JUDGING_WINDOW.from + 60, options).map(p => p.slot), ['window']);
  // Before the window, a match after it is not a near-term pick either.
  assert.deepEqual(pickListings(candidates, JUDGING_WINDOW.from - 3600, options).map(p => p.slot), ['window']);
  assert.equal(pickListings(candidates, JUDGING_WINDOW.to + 60, options).length, 0);
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
