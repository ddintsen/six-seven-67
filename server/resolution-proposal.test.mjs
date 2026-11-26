import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rulesHash } from './polymarket.mjs';
import { createResolutionProposal, createResolutionRegistry } from './resolution-proposal.mjs';
import { runProposalCli } from './propose-resolution.mjs';

const conditionId = `0x${'a'.repeat(64)}`;
const otherConditionId = `0x${'b'.repeat(64)}`;
const oracleAddress = 'g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5';
const question = 'Will the exact bound event happen?';
const description = 'Exact immutable resolution rules, including their original wording.';
const observedAt = '2026-10-10T20:00:00.000Z';
const registration = { conditionId, outcomes: ['Yes', 'No'], tokenIds: ['123', '456'], rulesHash: rulesHash(question, description),
  gnoChainId: 'onyx-1', gnoRealm: 'gno.land/r/sixseven/markets', gnoMarketId: 'controlled-market', oracleAddress };
function source(winner = 'Yes', closed = true) {
  return { condition_id: conditionId, question, description, closed, tokens: [
    { token_id: '123', outcome: 'Yes', winner: winner === 'Yes', price: 1 },
    { token_id: '456', outcome: 'No', winner: winner === 'No', price: 0 },
  ] };
}
const propose = (raw = source(), bindings = [registration], options = { observedAt }) => createResolutionProposal(raw, conditionId, bindings, options);
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}

test('closed Yes and No reports produce the exact seven unsigned business arguments', () => {
  for (const winner of ['Yes', 'No']) {
    const proposal = propose(source(winner));
    assert.equal(proposal.kind, 'unsigned-oracle-proposal');
    assert.equal(proposal.policy, 'trusted-polymarket-api');
    assert.equal(proposal.settlementAllowed, false);
    assert.equal(proposal.finality, 'not-proven');
    assert.equal(proposal.deploymentVerification, 'unverified');
    assert.equal(proposal.oracleAuthorityVerification, 'unverified');
    assert.equal(proposal.unsigned, true);
    assert.equal(proposal.submission, 'not-performed');
    assert.equal(proposal.businessCall.function, 'FinalizeByOracle');
    assert.deepEqual(proposal.businessCall.args, [registration.gnoMarketId, conditionId, registration.rulesHash, '123', '456', winner, proposal.evidenceHash]);
    assert.equal(proposal.businessCall.args.length, 7);
    assert.equal(proposal.businessCall.args.every(value => typeof value === 'string'), true);
    assert.equal(proposal.evidence.record.source.sourceUrl, `https://clob.polymarket.com/markets/${conditionId}`);
    assert.equal(Object.isFrozen(proposal.businessCall.args), true);
    assert.equal(Object.isFrozen(proposal.evidence.record.binding.tokenIds), true);
  }
});
test('a bound No/Yes source order keeps its identity while business arguments map literal labels', () => {
  const raw = source('No'); raw.tokens.reverse();
  const reversed = { ...registration, outcomes: ['No', 'Yes'], tokenIds: ['456', '123'] };
  const proposal = propose(raw, [reversed]);
  assert.deepEqual(proposal.evidence.record.binding.outcomes, ['No', 'Yes']);
  assert.deepEqual(proposal.businessCall.args.slice(3, 6), ['123', '456', 'No']);
});
test('unbound conditions, duplicate registrations and malformed condition IDs fail closed', () => {
  assert.throws(() => propose(source(), []), { code: 'UNBOUND_MARKET' });
  assert.throws(() => createResolutionProposal(source(), otherConditionId, [registration]), { code: 'UNBOUND_MARKET' });
  assert.throws(() => createResolutionRegistry([registration, registration]), { code: 'DUPLICATE_BINDING' });
  assert.throws(() => createResolutionProposal(source(), 'bitcoin-demo', [registration]), { code: 'INVALID_CONDITION_ID' });
  assert.throws(() => createResolutionRegistry({ registration }), { code: 'INVALID_REGISTRY' });
});
test('targets require explicit Onyx chain, strict realm, contract market ID and checksummed oracle', () => {
  for (const patch of [
    { gnoChainId: undefined }, { gnoChainId: 'gnoland-1' }, { gnoRealm: undefined },
    { gnoRealm: 'https://gno.land/r/sixseven/markets' }, { gnoRealm: 'evil.example/r/sixseven/markets' },
    { gnoRealm: 'gno.land/p/sixseven/markets' }, { gnoRealm: 'gno.land/r/sixseven/../markets' },
    { gnoRealm: 'gno.land/r/SixSeven/markets' }, { gnoRealm: 'gno.land/r/sixseven/market__test' },
    { gnoRealm: 'gno.land/r/sixseven/markets_test' }, { gnoRealm: `gno.land/r/${'a'.repeat(260)}` },
    { gnoMarketId: undefined }, { gnoMarketId: '' }, { gnoMarketId: 'x'.repeat(65) },
    { gnoMarketId: 'é'.repeat(33) }, { gnoMarketId: '\ud800' },
    { oracleAddress: undefined }, { oracleAddress: 'g1controlledaccount' }, { oracleAddress: oracleAddress.slice(0, -1) + 'q' },
  ]) assert.throws(() => propose(source(), [{ ...registration, ...patch }]), { code: 'INVALID_TARGET' });
  const boundary = propose(source(), [{ ...registration, gnoMarketId: 'é'.repeat(32) }]);
  assert.equal(Buffer.byteLength(boundary.target.gnoMarketId, 'utf8'), 64);
  const payloadTarget = { ...source(), gnoRealm: 'gno.land/r/attacker/markets', oracleAddress: 'g1untrusted' };
  assert.deepEqual(propose(payloadTarget).target, { gnoChainId: 'onyx-1', gnoRealm: registration.gnoRealm, gnoMarketId: registration.gnoMarketId, oracleAddress });
  assert.throws(() => propose(source(), [registration], { observedAt, gnoRealm: 'gno.land/r/attacker/markets' }), { code: 'INVALID_PROPOSAL_OPTIONS' });
});
test('100% prices, open records and closed records without a boolean winner cannot create a proposal', () => {
  assert.throws(() => propose(source(null)), { code: 'OUTCOME_NOT_REPORTED' });
  assert.throws(() => propose(source(null, false)), { code: 'OUTCOME_NOT_REPORTED' });
  const highPrices = source(null); highPrices.tokens.forEach(token => { token.price = 1; });
  assert.throws(() => propose(highPrices), { code: 'OUTCOME_NOT_REPORTED' });
  const winnerText = source(); winnerText.tokens[0].winner = 'true';
  assert.throws(() => propose(winnerText), { code: 'UPSTREAM_SCHEMA' });
});
test('contradictory flags and changes to exact source condition, text, outcome or token order are rejected', () => {
  assert.throws(() => propose(source('Yes', false)), { code: 'CONTRADICTORY_SOURCE' });
  const both = source(); both.tokens[1].winner = true;
  assert.throws(() => propose(both), { code: 'CONTRADICTORY_SOURCE' });
  assert.throws(() => propose({ ...source(), condition_id: otherConditionId }), { code: 'SOURCE_MISMATCH' });
  assert.throws(() => propose({ ...source(), question: question + ' changed' }), { code: 'BINDING_MISMATCH' });
  assert.throws(() => propose({ ...source(), description: description + ' changed' }), { code: 'BINDING_MISMATCH' });
  const reversed = source(); reversed.tokens.reverse();
  assert.throws(() => propose(reversed), { code: 'BINDING_MISMATCH' });
  const mismapped = source(); mismapped.tokens[0].token_id = '456'; mismapped.tokens[1].token_id = '123';
  assert.throws(() => propose(mismapped), { code: 'BINDING_MISMATCH' });
  const literal = source(); literal.tokens[0].outcome = 'yes';
  assert.throws(() => propose(literal), { code: 'BINDING_MISMATCH' });
  assert.throws(() => propose(source(), [{ ...registration, outcomes: ['Up', 'Down'] }]), { code: 'UNSUPPORTED_OUTCOMES' });
});
test('token IDs match the contract canonical decimal rules, including zero and the 78 digit boundary', () => {
  for (const invalid of ['00', '0123', '9'.repeat(79)]) assert.throws(() => propose(source(), [{ ...registration, tokenIds: [invalid, '456'] }]), { code: 'INVALID_TOKEN_ID' });
  for (const invalid of ['-1', '1.5', '']) assert.throws(() => propose(source(), [{ ...registration, tokenIds: [invalid, '456'] }]), { code: 'INVALID_BINDING' });
  const raw = source(); raw.tokens[0].token_id = '0'; raw.tokens[1].token_id = '9'.repeat(78);
  const accepted = propose(raw, [{ ...registration, tokenIds: ['0', '9'.repeat(78)] }]);
  assert.deepEqual(accepted.businessCall.args.slice(3, 5), ['0', '9'.repeat(78)]);
});
test('source text must fit actual contract byte limits and remain well-formed UTF-8', () => {
  for (const patch of [{ question: 'é'.repeat(513) }, { description: 'a'.repeat(20001) }, { question: '\ud800' }]) {
    const raw = { ...source(), ...patch };
    const bound = { ...registration, rulesHash: rulesHash(raw.question, raw.description) };
    assert.throws(() => propose(raw, [bound]), { code: 'CONTRACT_BINDING_INCOMPATIBLE' });
  }
});
test('canonical evidence commits every core, target, winner and observation field and feeds the final argument', () => {
  const proposal = propose();
  const independentJson = JSON.stringify(sorted(proposal.evidence.record));
  assert.equal(proposal.evidence.canonicalJson, independentJson);
  assert.equal(proposal.evidenceHash, createHash('sha256').update(independentJson, 'utf8').digest('hex'));
  assert.match(proposal.evidenceHash, /^[0-9a-f]{64}$/);
  assert.equal(proposal.businessCall.args[6], proposal.evidenceHash);
  assert.equal(proposal.evidence.record.domain, 'six-seven.polymarket-resolution-proposal');
  assert.equal(proposal.evidence.record.version, 1);
  assert.equal(proposal.evidence.record.policy, 'trusted-polymarket-api');
  assert.deepEqual(proposal.evidence.record.binding, sorted(registration));
  for (const replacement of [
    propose(source('No')),
    propose(source(), [registration], { observedAt: '2026-10-10T20:00:01.000Z' }),
    propose(source(), [{ ...registration, gnoMarketId: 'another-registered-market' }]),
    propose(source(), [{ ...registration, gnoRealm: 'gno.land/r/sixseven/another' }]),
  ]) assert.notEqual(proposal.evidenceHash, replacement.evidenceHash);
  const raw = { ...source(), observedAt: '2000-01-01T00:00:00.000Z' };
  assert.equal(propose(raw).observedAt, observedAt);
  assert.throws(() => propose(source(), [registration], { observedAt: '2026-02-30T00:00:00.000Z' }), { code: 'INVALID_OBSERVATION_TIME' });
});
test('registry snapshots preserve immutable core and target even when the operator input object later changes', () => {
  const input = structuredClone(registration);
  const registry = createResolutionRegistry([input]);
  input.gnoMarketId = 'changed-target'; input.tokenIds[0] = '999'; input.outcomes[0] = 'Up';
  const proposal = registry.propose(source(), conditionId, { observedAt });
  assert.equal(proposal.target.gnoMarketId, registration.gnoMarketId);
  assert.equal(proposal.businessCall.args[3], '123');
  assert.equal(Object.isFrozen(registry.requireBinding(conditionId)), true);
});
test('CLI selects exact operator binding and makes one fixed CLOB GET before printing unsigned JSON', async () => {
  const urls = [], output = [], errors = [];
  const code = await runProposalCli([conditionId], { loadBindings: async () => [registration],
    request: async (...args) => { urls.push(args); return source('No'); },
    writeOutput: value => output.push(value), writeError: value => errors.push(value) });
  assert.equal(code, 0);
  assert.deepEqual(urls, [[`https://clob.polymarket.com/markets/${conditionId}`]]);
  assert.equal(errors.length, 0);
  const result = JSON.parse(output.join(''));
  assert.equal(result.reportedWinner, 'No'); assert.equal(result.unsigned, true);
  assert.equal(result.settlementAllowed, false); assert.equal(result.submission, 'not-performed');
});
test('CLI rejects unbound, missing or mainnet target and invalid arguments without upstream calls', async () => {
  for (const [args, bindings] of [
    [[conditionId], []], [[conditionId], [{ ...registration, gnoRealm: undefined }]],
    [[conditionId], [{ ...registration, gnoChainId: 'gnoland-1' }]],
    [[], [registration]], [['bitcoin-demo'], [registration]], [[conditionId, '--target=other'], [registration]],
  ]) {
    let calls = 0; const output = [], errors = [];
    const code = await runProposalCli(args, { loadBindings: async () => bindings,
      request: async () => { calls++; return source(); }, writeOutput: value => output.push(value), writeError: value => errors.push(value) });
    assert.equal(code, 1); assert.equal(calls, 0); assert.equal(output.length, 0);
    assert.equal(JSON.parse(errors.join('')).status, 'proposal-not-created');
  }
});
