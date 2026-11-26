import { createHash } from 'node:crypto';
import { GatewayError, requireObject, requireString } from './upstream.mjs';

export const POLYMARKET_ORIGIN = 'https://clob.polymarket.com';
export function isConditionId(value) { return typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value); }
export function rulesHash(question, description) {
  const framed = `${Buffer.byteLength(question, 'utf8')}:${question}${Buffer.byteLength(description, 'utf8')}:${description}`;
  return createHash('sha256').update(framed, 'utf8').digest('hex');
}

export function inspectMarket(payload, conditionId) {
  if (!isConditionId(conditionId)) throw new GatewayError('INVALID_CONDITION_ID', 'Condition ID must be 0x followed by 64 lowercase hex digits.', 400);
  const market = requireObject(payload, 'Polymarket market');
  if (market.condition_id !== conditionId) throw new GatewayError('SOURCE_MISMATCH', 'Polymarket condition ID does not match the requested source.');
  if (typeof market.closed !== 'boolean' || !Array.isArray(market.tokens) || market.tokens.length !== 2) {
    throw new GatewayError('UNSUPPORTED_MARKET', 'Only explicit binary CLOB market records are supported.');
  }
  const question = requireString(market.question, 'question', 2048);
  const description = requireString(market.description, 'description', 32768);
  const tokens = market.tokens.map((value) => {
    const token = requireObject(value, 'token');
    if (typeof token.token_id !== 'string' || !/^\d+$/.test(token.token_id) || token.token_id.length > 100 || typeof token.winner !== 'boolean') {
      throw new GatewayError('UPSTREAM_SCHEMA', 'Invalid token identity or winner flag.');
    }
    const outcome = requireString(token.outcome, 'outcome', 128);
    if (!outcome) throw new GatewayError('UPSTREAM_SCHEMA', 'Outcome label cannot be empty.');
    return { tokenId: token.token_id, outcome, winner: token.winner };
  });
  if (tokens[0].tokenId === tokens[1].tokenId || tokens[0].outcome === tokens[1].outcome) {
    throw new GatewayError('UPSTREAM_SCHEMA', 'Outcome identities must be distinct.');
  }
  const winners = tokens.filter((token) => token.winner);
  if (winners.length > 1 || (!market.closed && winners.length)) {
    throw new GatewayError('CONTRADICTORY_SOURCE', 'Polymarket winner flags contradict the market state.');
  }
  return { conditionId, question, description, rulesHash: rulesHash(question, description), tokens,
    state: !market.closed ? 'open' : winners.length === 1 ? 'api-reported-outcome' : 'awaiting-outcome',
    reportedWinner: winners[0]?.outcome ?? null, closed: market.closed,
    trust: 'polymarket-api-advisory', settlementAllowed: false,
    observedAt: new Date().toISOString(), sourceUrl: `${POLYMARKET_ORIGIN}/markets/${conditionId}` };
}

export function validateBinding(binding) {
  if (!binding || !isConditionId(binding.conditionId) || !Array.isArray(binding.outcomes) || binding.outcomes.length !== 2 ||
    !Array.isArray(binding.tokenIds) || binding.tokenIds.length !== 2 || !/^[0-9a-f]{64}$/.test(binding.rulesHash ?? '') ||
    binding.outcomes.some((value) => typeof value !== 'string' || !value || value.length > 128) ||
    binding.tokenIds.some((value) => typeof value !== 'string' || !/^\d{1,100}$/.test(value)) ||
    binding.outcomes[0] === binding.outcomes[1] || binding.tokenIds[0] === binding.tokenIds[1]) {
    throw new TypeError('Invalid immutable Polymarket binding.');
  }
  return Object.freeze({ conditionId: binding.conditionId, rulesHash: binding.rulesHash,
    outcomes: Object.freeze([...binding.outcomes]), tokenIds: Object.freeze([...binding.tokenIds]) });
}

export function parseBoundResolution(payload, binding) {
  const immutable = validateBinding(binding);
  const market = inspectMarket(payload, immutable.conditionId);
  if (market.rulesHash !== immutable.rulesHash || market.tokens.some((token, index) =>
    token.outcome !== immutable.outcomes[index] || token.tokenId !== immutable.tokenIds[index])) {
    throw new GatewayError('BINDING_MISMATCH', 'Source rules or outcome/token order differ from the immutable binding.');
  }
  return { ...market, binding: immutable, finality: 'not-proven', settlementAllowed: false,
    policy: 'API winner flags are observations. Gno settlement requires the configured oracle, immutable source binding and an explicit external-result trust policy.' };
}

export async function readPolymarket(request, conditionId, binding) {
  if (!isConditionId(conditionId)) throw new GatewayError('INVALID_CONDITION_ID', 'Condition ID must be 0x followed by 64 lowercase hex digits.', 400);
  const payload = await request(`${POLYMARKET_ORIGIN}/markets/${conditionId}`);
  return binding ? parseBoundResolution(payload, binding) : inspectMarket(payload, conditionId);
}
