import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { ChainMarket } from './gno.ts';
import { canonicalJson, decide, evidenceHash, realmAddress, type ClobRead } from './oracle.ts';
import { bindingHash, fetchClob } from './polymarket.ts';
import { readAgreedSettlement, readSettlement, type PolygonRead } from './polygon.ts';

const REALM = 'gno.land/r/nym-sixseven067/markets';
const NOW = 1_790_000_000;
const condition = '0x' + 'ab'.repeat(32);

function market(over: Partial<ChainMarket> = {}): ChainMarket {
  return {
    id: 'fed', question: 'Q?', rules: 'R', rulesHash: 'h'.repeat(64), conditionId: condition, yesTokenId: '111', noTokenId: '222',
    closesAt: NOW + 10 * 86400, yesPricePpm: 420_000, oracle: 'g1oracle', escrowUgnot: 5_000_000n, yesMicroShares: 1_000_000n, noMicroShares: 0n,
    finalized: false, winner: '', evidenceHash: '', finalizedAt: 0, paidUgnot: 0n, quoteVersion: 3, createdAt: NOW - 86400, volumeUgnot: 420_000n,
    trades: 1, holders: 1, history: [{ at: NOW - 600, yesPricePpm: 420_000, noPricePpm: 580_000, version: 3 }],
    realm: 'gno.land/r/nym-sixseven067/markets', version: 1, noPricePpm: 580_000, state: 'open', outcome: '', proposedAt: 0,
    feePpm: 0, feesUgnot: 0n, limits: null, treasury: null, quotedAt: NOW - 600, quoteExpiresAt: null, realmPaused: false, topic: null, labels: { Yes: 'Yes', No: 'No' }, ...over,
  };
}
const clob = (over: Partial<ClobRead> = {}): ClobRead => ({
  closed: false, question: 'Q?', rulesHash: 'h'.repeat(64), midYesPpm: 420_000,
  tokens: [{ tokenId: '111', outcome: 'Yes', winner: false }, { tokenId: '222', outcome: 'No', winner: false }], ...over,
});
const polygon = (state: string, numerators?: [string, string]): PolygonRead =>
  ({ settlement: numerators ? { state, numerators, denominator: '1' } as PolygonRead['settlement'] : { state } as PolygonRead['settlement'], agreed: ['a', 'b'], failed: [], note: 'two RPCs agree' });

test('an unresolved market follows Polymarket: a cent of drift asks for a requote, five cents alerts', async () => {
  const quiet = await decide(REALM, market(), NOW, clob({ midYesPpm: 425_000 }), polygon('unresolved'));
  assert.deepEqual(quiet.actions, []);
  assert.deepEqual(quiet.alerts, []);
  const drift = await decide(REALM, market(), NOW, clob({ midYesPpm: 440_000 }), polygon('unresolved'));
  assert.deepEqual(drift.actions, [{ kind: 'requote', yesPricePpm: 440_000, noPricePpm: 560_000, expectedVersion: 3, driftPpm: 20_000 }]);
  assert.equal(drift.alerts.length, 0);
  const stale = await decide(REALM, market(), NOW, clob({ midYesPpm: 600_000 }), polygon('unresolved'));
  assert.equal(stale.alerts[0].severity, 'action');
  assert.match(stale.alerts[0].title, /our Yes 42\.0%, Polymarket 60\.0%/);
});

test('a result on Polygon prepares the oracle call, the brake and reproducible evidence', async () => {
  const s = await decide(REALM, market(), NOW, clob({ closed: true, midYesPpm: null, tokens: [{ tokenId: '111', outcome: 'Yes', winner: false }, { tokenId: '222', outcome: 'No', winner: true }] }), polygon('No', ['0', '1']));
  const finalize = s.actions.find(a => a.kind === 'finalize');
  assert.ok(finalize && finalize.kind === 'finalize');
  assert.deepEqual(finalize.args.slice(0, 6), ['fed', condition, 'h'.repeat(64), '111', '222', 'No']);
  assert.match(finalize.evidenceHash, /^[0-9a-f]{64}$/);
  assert.equal(finalize.evidenceHash, await evidenceHash(s.evidence!));
  assert.deepEqual(s.actions.find(a => a.kind === 'brake'), { kind: 'brake', yesPricePpm: 1, reason: 'the result is final on Polygon: No' });
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }), '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
  // The record has no clock in it: the same reads give the same hash later.
  const again = await decide(REALM, market(), NOW + 999, clob({ closed: true, midYesPpm: null, tokens: [{ tokenId: '111', outcome: 'Yes', winner: false }, { tokenId: '222', outcome: 'No', winner: true }] }), polygon('No', ['0', '1']));
  assert.equal(again.evidence && await evidenceHash(again.evidence), finalize.evidenceHash);
});

test('nothing is finalized on a 50-50, a disagreement or a changed binding', async () => {
  const voided = await decide(REALM, market(), NOW, clob({ closed: true }), polygon('void', ['1', '1']));
  assert.equal(voided.actions.length, 0);
  assert.equal(voided.alerts[0].severity, 'critical');
  assert.match(voided.alerts[0].title, /50-50/);
  const disagree = await decide(REALM, market(), NOW, clob({ closed: true, tokens: [{ tokenId: '111', outcome: 'Yes', winner: true }, { tokenId: '222', outcome: 'No', winner: false }] }), polygon('No', ['0', '1']));
  assert.equal(disagree.actions.filter(a => a.kind === 'finalize').length, 0);
  assert.ok(disagree.alerts.some(a => a.key === 'fed:disagree'));
  const changed = await decide(REALM, market(), NOW, clob({ rulesHash: 'x'.repeat(64) }), polygon('Yes', ['1', '0']));
  assert.equal(changed.actions.filter(a => a.kind === 'finalize').length, 0);
  assert.ok(changed.alerts.some(a => a.key === 'fed:binding'));
});

test('a reviewed market proposes the frozen binding only when Polygon agrees with the review', async () => {
  const reviewed = new Map([['fed', 'Yes' as const]]);
  const ok = await decide(REALM, market(), NOW, clob({ rulesHash: 'x'.repeat(64) }), polygon('Yes', ['1', '0']), reviewed);
  const propose = ok.actions.find(a => a.kind === 'finalize');
  assert.ok(propose && propose.kind === 'finalize' && propose.outcome === 'Yes');
  assert.equal(propose.args[2], 'h'.repeat(64)); // the frozen rules hash, not Polymarket's new text
  assert.ok(ok.alerts.some(a => a.key === 'fed:binding'));
  const other = await decide(REALM, market(), NOW, clob({ rulesHash: 'x'.repeat(64) }), polygon('No', ['0', '1']), reviewed);
  assert.equal(other.actions.filter(a => a.kind === 'finalize').length, 0);
});

test('a match market binds its team names in token order and proposes the first team as Yes', async () => {
  const match = market({ version: 2, labels: { Yes: 'Lakers', No: 'Celtics' } });
  const tokens = [{ tokenId: '111', outcome: 'Lakers', winner: true }, { tokenId: '222', outcome: 'Celtics', winner: false }];
  const s = await decide(REALM, match, NOW, clob({ closed: true, midYesPpm: null, tokens }), polygon('Yes', ['1', '0']));
  assert.equal(s.polymarket.bindingMatches, true);
  assert.equal(s.polymarket.apiWinner, 'Yes');
  const propose = s.actions.find(a => a.kind === 'finalize');
  assert.ok(propose && propose.kind === 'finalize' && propose.func === 'ProposeOutcome' && propose.outcome === 'Yes');
  // Names listed the wrong way round no longer match Polymarket's tokens.
  const swapped = await decide(REALM, market({ version: 2, labels: { Yes: 'Celtics', No: 'Lakers' } }), NOW, clob({ closed: true, tokens }), polygon('Yes', ['1', '0']));
  assert.equal(swapped.polymarket.bindingMatches, false);
  assert.equal(swapped.actions.filter(a => a.kind === 'finalize').length, 0);
});

test('a wrong final result and a broken invariant are critical', async () => {
  const wrong = await decide(REALM, market({ finalized: true, winner: 'Yes' }), NOW, clob({ closed: true }), polygon('No', ['0', '1']));
  assert.ok(wrong.alerts.some(a => a.key === 'fed:wrong-result' && a.severity === 'critical'));
  const right = await decide(REALM, market({ finalized: true, winner: 'No' }), NOW, clob({ closed: true }), polygon('No', ['0', '1']));
  assert.equal(right.alerts.length, 0);
  assert.equal(right.actions.length, 0);
  const broken = await decide(REALM, market({ yesMicroShares: 6_000_000n }), NOW, clob(), polygon('unresolved'));
  assert.ok(broken.alerts.some(a => a.key === 'fed:invariant'));
});

test('closing within a day is a notice; a closed market is not requoted', async () => {
  const soon = await decide(REALM, market({ closesAt: NOW + 3600 }), NOW, clob({ midYesPpm: 600_000 }), polygon('unresolved'));
  assert.ok(soon.alerts.some(a => a.key === 'fed:closing'));
  const closed = await decide(REALM, market({ closesAt: NOW - 1 }), NOW, clob({ midYesPpm: 600_000 }), polygon('unresolved'));
  assert.equal(closed.realm.state, 'closed');
  assert.equal(closed.actions.length, 0);
});

test('Polygon payouts map to Yes, No, void or invalid', async () => {
  const fake = (slots: bigint, den: bigint, nums: bigint[]) => async (_rpc: string, data: string) =>
    data.startsWith('0xd42dc0c2') ? slots : data.startsWith('0xdd34de67') ? den : nums[Number(BigInt('0x' + data.slice(-64)))];
  assert.deepEqual(await readSettlement(condition, 'r', fake(0n, 0n, [])), { state: 'unprepared' });
  assert.deepEqual(await readSettlement(condition, 'r', fake(2n, 0n, [0n, 0n])), { state: 'unresolved' });
  assert.equal((await readSettlement(condition, 'r', fake(2n, 1n, [1n, 0n]))).state, 'Yes');
  assert.equal((await readSettlement(condition, 'r', fake(2n, 1n, [0n, 1n]))).state, 'No');
  assert.equal((await readSettlement(condition, 'r', fake(2n, 2n, [1n, 1n]))).state, 'void');
  assert.equal((await readSettlement(condition, 'r', fake(2n, 3n, [2n, 1n]))).state, 'invalid');
  await assert.rejects(readSettlement('0xBAD', 'r', fake(2n, 1n, [1n, 0n])));
});

test('two Polygon RPCs must agree', async () => {
  const by = (answers: Record<string, bigint[] | 'fail'>) => async (rpc: string, data: string) => {
    const a = answers[rpc];
    if (a === 'fail') throw new Error('down');
    return data.startsWith('0xd42dc0c2') ? 2n : data.startsWith('0xdd34de67') ? 1n : a[Number(BigInt('0x' + data.slice(-64)))];
  };
  const agreed = await readAgreedSettlement(condition, ['a', 'b', 'c'], by({ a: 'fail', b: [0n, 1n], c: [0n, 1n] }));
  assert.equal(agreed.settlement?.state, 'No');
  assert.deepEqual(agreed.agreed, ['b', 'c']);
  const split = await readAgreedSettlement(condition, ['a', 'b', 'c'], by({ a: [1n, 0n], b: [0n, 1n], c: 'fail' }));
  assert.equal(split.settlement, null);
  assert.equal(split.note, 'Polygon RPCs disagree');
});

test("a realm's bank address is derived like the chain does", async () => {
  // Checked on a local node: this address held exactly the realm's escrow.
  assert.equal(await realmAddress('gno.land/r/nym-sixseven067/markets'), 'g1x2gmw2tlf5xua2ruduy3jruejjzp63fqyh03jf');
  assert.match(await realmAddress('gno.land/r/nym-sixseven067/home'), /^g1[02-9ac-hj-np-z]{38}$/);
});

test('the rules hash matches the one frozen in the realm for every seeded market', async () => {
  const seed = JSON.parse(readFileSync(new URL('../../ops/markets.seed.json', import.meta.url), 'utf8')) as { question: string; rules: string; rulesHash: string }[];
  for (const m of seed) assert.equal(await bindingHash(m.question, m.rules), m.rulesHash);
  assert.equal(await bindingHash('é', 'ü'), await bindingHash('é', 'ü'));
});

test('the Polymarket reader validates the market and reads the midpoint only while open', async () => {
  const calls: string[] = [];
  const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const market = (over: Record<string, unknown> = {}) => ({ condition_id: condition, closed: false, question: 'Q?', description: 'R',
    tokens: [{ token_id: '111', outcome: 'Yes', winner: false }, { token_id: '222', outcome: 'No', winner: false }], ...over });
  const open = await fetchClob(condition, '111', async url => { calls.push(url); return url.includes('/midpoint') ? respond({ mid: '0.42' }) : respond(market()); });
  assert.equal(open.midYesPpm, 420_000);
  assert.equal(open.rulesHash, await bindingHash('Q?', 'R'));
  assert.equal(calls.length, 2);
  const closed = await fetchClob(condition, '111', async url => { calls.push(url); return respond(market({ closed: true, tokens: [{ token_id: '111', outcome: 'Yes', winner: true }, { token_id: '222', outcome: 'No', winner: false }] })); });
  assert.equal(closed.midYesPpm, null);
  assert.equal(calls.length, 3);
  await assert.rejects(fetchClob(condition, '111', async () => respond(market({ condition_id: '0x' + 'cd'.repeat(32) }))), /another market/);
  await assert.rejects(fetchClob(condition, '111', async () => respond(market({ tokens: [{ token_id: '111', outcome: 'Yes', winner: true }, { token_id: '222', outcome: 'No', winner: false }] }))), /contradictory/);
  await assert.rejects(fetchClob(condition, '111', async () => new Response('nope', { status: 503 })), /503/);
});
