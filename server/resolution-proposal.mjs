import { createHash } from 'node:crypto';
import { isGnoAddress } from './gno.mjs';
import { isConditionId, parseBoundResolution, validateBinding } from './polymarket.mjs';
import { GatewayError } from './upstream.mjs';

const DOMAIN = 'six-seven.polymarket-resolution-proposal';
const VERSION = 1;
const POLICY = 'trusted-polymarket-api';
const MAX_EVIDENCE_BYTES = 131072;
const REALM_NAME = '[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*';
// Gno 1.5.0 Re_name / IsRealmPath grammar, restricted to the gno.land host.
const REALM_PATH = new RegExp(`^gno\\.land/r/${REALM_NAME}(?:/${REALM_NAME})*$`);

function fail(code, message, status = 400) { throw new GatewayError(code, message, status); }
function exactUtf8(value, maximum) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= maximum && Buffer.from(value, 'utf8').toString('utf8') === value;
}
function canonicalToken(value) { return typeof value === 'string' && /^(?:0|[1-9][0-9]{0,77})$/.test(value); }
function immutableRegistration(value) {
  let core;
  try { core = validateBinding(value); }
  catch { fail('INVALID_BINDING', 'An operator-registered source binding is invalid.'); }
  if (!core.outcomes.includes('Yes') || !core.outcomes.includes('No')) fail('UNSUPPORTED_OUTCOMES', 'The registered source must use the literal outcomes Yes and No.');
  if (core.tokenIds.some(token => !canonicalToken(token))) fail('INVALID_TOKEN_ID', 'Registered token IDs must be canonical decimal strings of at most 78 digits.');
  if (value.gnoChainId !== 'onyx-1') fail('INVALID_TARGET', 'An explicit Onyx target chain ID, onyx-1, is required. Mainnet proposals are outside this scope.');
  if (!exactUtf8(value.gnoRealm, 256) || !REALM_PATH.test(value.gnoRealm) || value.gnoRealm.endsWith('_test')) fail('INVALID_TARGET', 'The registered target must be a valid gno.land/r realm path of at most 256 bytes.');
  if (!exactUtf8(value.gnoMarketId, 64)) fail('INVALID_TARGET', 'The registered Gno market ID must be valid UTF-8, nonempty and at most 64 bytes.');
  if (!isGnoAddress(value.oracleAddress)) fail('INVALID_TARGET', 'A valid checksummed g1 oracle address is required.');
  return Object.freeze({ ...core, gnoChainId: value.gnoChainId, gnoRealm: value.gnoRealm,
    gnoMarketId: value.gnoMarketId, oracleAddress: value.oracleAddress });
}
function freezeRecord(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeRecord); Object.freeze(value); }
  return value;
}
function sortedRecord(value) {
  if (Array.isArray(value)) return value.map(sortedRecord);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedRecord(value[key])]));
  return value;
}
function observationTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('INVALID_OBSERVATION_TIME', 'Observation time must be a canonical UTC ISO timestamp with milliseconds.');
  }
  return value;
}
function prepare(raw, binding, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => key !== 'observedAt')) fail('INVALID_PROPOSAL_OPTIONS', 'Only the local observation timestamp may be supplied; target overrides are not accepted.');
  // Keep the parser's exact condition/rules/order checks; do not reinterpret a
  // source price, slug, proposed outcome or browser-local market as a result.
  const source = parseBoundResolution(raw, binding);
  if (!exactUtf8(source.question, 1024) || !exactUtf8(source.description, 20000)) fail('CONTRACT_BINDING_INCOMPATIBLE', 'Source question or rules exceed the Gno contract UTF-8 limits.');
  if (!source.closed || source.state !== 'api-reported-outcome' || (source.reportedWinner !== 'Yes' && source.reportedWinner !== 'No')) fail('OUTCOME_NOT_REPORTED', 'A closed bound market with exactly one explicit boolean winner is required.', 409);
  const observedAt = observationTime(options.observedAt === undefined ? source.observedAt : options.observedAt);
  const target = { gnoChainId: binding.gnoChainId, gnoRealm: binding.gnoRealm,
    gnoMarketId: binding.gnoMarketId, oracleAddress: binding.oracleAddress };
  const evidenceRecord = sortedRecord({ domain: DOMAIN, version: VERSION, policy: POLICY,
    source: { sourceUrl: source.sourceUrl, conditionId: source.conditionId, question: source.question,
      description: source.description, rulesHash: source.rulesHash, closed: source.closed,
      tokens: source.tokens.map(token => ({ tokenId: token.tokenId, outcome: token.outcome, winner: token.winner })) },
    binding: { conditionId: binding.conditionId, rulesHash: binding.rulesHash,
      outcomes: [...binding.outcomes], tokenIds: [...binding.tokenIds], ...target },
    winner: source.reportedWinner, observedAt });
  const canonicalJson = JSON.stringify(evidenceRecord);
  if (Buffer.byteLength(canonicalJson, 'utf8') > MAX_EVIDENCE_BYTES) fail('EVIDENCE_TOO_LARGE', 'Canonical evidence exceeds the 128 KiB limit.');
  const evidenceHash = createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  const yesTokenId = binding.tokenIds[binding.outcomes.indexOf('Yes')];
  const noTokenId = binding.tokenIds[binding.outcomes.indexOf('No')];
  return freezeRecord({ kind: 'unsigned-oracle-proposal', version: VERSION, policy: POLICY,
    settlementAllowed: false, finality: 'not-proven', sourceTrust: 'polymarket-api-advisory',
    deploymentVerification: 'unverified', oracleAuthorityVerification: 'unverified', unsigned: true,
    submission: 'not-performed', target, observedAt, reportedWinner: source.reportedWinner, evidenceHash,
    businessCall: { gnoRealm: binding.gnoRealm, function: 'FinalizeByOracle',
      args: [binding.gnoMarketId, binding.conditionId, binding.rulesHash, yesTokenId, noTokenId, source.reportedWinner, evidenceHash] },
    evidence: { algorithm: 'sha256', canonicalJson, record: evidenceRecord,
      meaning: 'Evidence commitment only. This hash is not a chain proof or a verified finality attestation.' } });
}

// This registry is server/operator input. No request can create or retarget a
// binding; every stored field is copied and frozen before source inspection.
export function createResolutionRegistry(registrations) {
  if (!Array.isArray(registrations) || registrations.length > 1024) fail('INVALID_REGISTRY', 'Operator bindings must be an array of at most 1024 records.');
  const registered = new Map();
  for (const value of registrations) {
    const binding = immutableRegistration(value);
    if (registered.has(binding.conditionId)) fail('DUPLICATE_BINDING', 'A condition may have only one registered source and target binding.', 409);
    registered.set(binding.conditionId, binding);
  }
  const requireBinding = conditionId => {
    if (!isConditionId(conditionId)) fail('INVALID_CONDITION_ID', 'Condition ID must be 0x followed by 64 lowercase hex digits.');
    const binding = registered.get(conditionId);
    if (!binding) fail('UNBOUND_MARKET', 'No operator-owned source and Gno target binding is registered for this condition.', 409);
    return binding;
  };
  return Object.freeze({ requireBinding,
    propose: (raw, conditionId, options) => prepare(raw, requireBinding(conditionId), options) });
}

export function createResolutionProposal(raw, conditionId, registeredBindings, options) {
  return createResolutionRegistry(registeredBindings).propose(raw, conditionId, options);
}
