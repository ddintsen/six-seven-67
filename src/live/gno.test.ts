import assert from 'node:assert/strict';
import test from 'node:test';
import { ChainError, feeUgnot, fetchMarkets, fetchPositions, formatUgnot, maxPurchase, outcomePricePpm, parseGnot, parseMarket, parseMarketV2, parsePositions, parseQevalString, quoteCost, sharesForSpend, sharesForTotal, unquoteGo } from './gno.ts';
import type { ChainMarket } from './gno.ts';
import { parseTrades } from './indexer.ts';
import { explainFailure } from './failures.ts';
import { interpretCallResponse } from '../adena.ts';

const realm = 'gno.land/r/nym-sixseven067/markets';
const marketJson = (overrides: Record<string, unknown> = {}) => ({
  id: 'btc-vs-gold-2026', question: 'Will Bitcoin outperform Gold in 2026?', rules: 'Rules “quoted”.\n\nSecond paragraph.',
  rulesHash: 'a'.repeat(64), conditionId: `0x${'d'.repeat(64)}`, yesTokenId: '47113934605305582772590235372495078183833796521066344951188393486940857661087', noTokenId: '1',
  closesAt: 1798779600, yesPricePpm: 420000, oracle: 'g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5',
  escrowUgnot: '8000000', yesMicroShares: '0', noMicroShares: '0', finalized: false, winner: '', evidenceHash: '', finalizedAt: 0, paidUgnot: '0',
  quoteVersion: 1, createdAt: 1791743236, volumeUgnot: '0', trades: 0, holders: 0, history: [{ at: 1791743236, yesPricePpm: 420000, version: 1 }],
  ...overrides,
});
// Go's %q quoting as Gno's qeval prints a string result.
const goQuote = (text: string) => `("${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}" string)`;
function rpcFetch(handler: (expression: string) => string | { error: string }) {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const query = Buffer.from(body.params.data, 'base64').toString();
    const expression = query.slice(realm.length + 1);
    const result = handler(expression);
    const base = typeof result === 'string'
      ? { Error: null, Data: Buffer.from(result).toString('base64'), Log: '' }
      : { Error: { msg: result.error }, Data: null, Log: result.error };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { response: { ResponseBase: base } } }), { status: 200 });
  };
}

test('Go string literals decode exactly, including escapes, bytes and astral characters', () => {
  assert.equal(unquoteGo('"plain"'), 'plain');
  assert.equal(unquoteGo('"tab\\tnew\\nline \\"q\\" back\\\\slash"'), 'tab\tnew\nline "q" back\\slash');
  assert.equal(unquoteGo('"\\xe2\\x80\\x9cquoted\\xe2\\x80\\x9d"'), '“quoted”');
  assert.equal(unquoteGo('"\\u2028 \\U0001F600 \\101"'), '  😀 A');
  assert.equal(unquoteGo('"“raw unicode”"'), '“raw unicode”');
  for (const bad of ['plain', '"\\q"', '"\\x4"', '"\\u12"']) assert.throws(() => unquoteGo(bad), ChainError);
  assert.equal(parseQevalString('("[1,2]" string)'), '[1,2]');
  assert.throws(() => parseQevalString('(42 int)'), ChainError);
});

test('market projections are validated and keep financial integers exact', () => {
  const market = parseMarket(marketJson({ escrowUgnot: '9223372036854775807' }));
  assert.equal(market.escrowUgnot, 9223372036854775807n);
  assert.equal(market.yesTokenId.length, 77);
  for (const bad of [
    marketJson({ yesPricePpm: 1000000 }), marketJson({ escrowUgnot: 8000000 }), marketJson({ escrowUgnot: '-1' }),
    marketJson({ winner: 'Yes' }), marketJson({ finalized: true }), marketJson({ winner: 'Maybe', finalized: true }),
    marketJson({ history: [] }), marketJson({ id: 'Bad ID' }), marketJson({ trades: 1.5 }),
  ]) assert.throws(() => parseMarket(bad), ChainError);
  const final = parseMarket(marketJson({ finalized: true, winner: 'No', finalizedAt: 1798800000 }));
  assert.equal(final.winner, 'No');
});

test('reads decode qeval strings and distinguish an undeployed contract', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = rpcFetch(expression => expression === 'MarketsJSON()' ? goQuote(JSON.stringify([marketJson()])) : goQuote('[]')) as typeof fetch;
    const markets = await fetchMarkets('https://rpc.test', realm);
    assert.equal(markets.length, 1);
    assert.equal(markets[0].rules, 'Rules “quoted”.\n\nSecond paragraph.');
    assert.deepEqual(await fetchPositions('https://rpc.test', realm, 'g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5'), []);
    await assert.rejects(fetchPositions('https://rpc.test', realm, 'g1"); Evil("'), (error: ChainError) => error.code === 'BAD_ADDRESS');
    globalThis.fetch = rpcFetch(() => ({ error: 'invalid package path' })) as typeof fetch;
    await assert.rejects(fetchMarkets('https://rpc.test', realm), (error: ChainError) => error.code === 'REALM_NOT_FOUND');
    globalThis.fetch = (async () => new Response('nope', { status: 502 })) as typeof fetch;
    await assert.rejects(fetchMarkets('https://rpc.test', realm), (error: ChainError) => error.code === 'RPC_UNAVAILABLE');
  } finally {
    globalThis.fetch = original;
  }
});

test('quote arithmetic matches the realm: shares never cost more than the spend', () => {
  assert.equal(quoteCost(1_000_000n, 420_000n), 420_000n);
  assert.equal(quoteCost(1n, 420_000n), 1n); // rounds up like the contract
  assert.equal(quoteCost(0n, 420_000n), 0n);
  for (const [spend, price] of [[1_000_000n, 420_000n], [420_000n, 210_000n], [999_999n, 333_333n], [7n, 999_999n]] as const) {
    const shares = sharesForSpend(spend, price);
    assert.ok(quoteCost(shares, price) <= spend);
    assert.ok(quoteCost(shares + 1n, price) > spend || shares === 0n);
  }
  assert.equal(outcomePricePpm({ yesPricePpm: 420000, noPricePpm: 580000 }, 'No'), 580_000n);
});

test('market capacity respects the collateral rule for each outcome', () => {
  const market = parseMarket(marketJson({ escrowUgnot: '8000000', yesMicroShares: '3000000', noMicroShares: '1000000' })) as ChainMarket;
  for (const outcome of ['Yes', 'No'] as const) {
    const { microShares, costUgnot } = maxPurchase(market, outcome);
    const held = outcome === 'Yes' ? market.yesMicroShares : market.noMicroShares;
    assert.ok(held + microShares <= market.escrowUgnot + costUgnot, 'within collateral');
    const price = outcomePricePpm(market, outcome);
    assert.ok(held + microShares + 1n > market.escrowUgnot + quoteCost(microShares + 1n, price), 'maximal');
  }
  const drained = parseMarket(marketJson({ escrowUgnot: '1000000', yesMicroShares: '1000000' }));
  assert.equal(maxPurchase(drained, 'Yes').costUgnot, 0n);
});

test('GNOT input and display never pass through floating point', () => {
  assert.equal(parseGnot('1'), 1_000_000n);
  assert.equal(parseGnot('0.000001'), 1n);
  assert.equal(parseGnot(' 12.5 '), 12_500_000n);
  for (const bad of ['', '-1', '1.0000001', '1e3', 'abc', '1,5']) assert.equal(parseGnot(bad), null);
  assert.equal(formatUgnot(1_234_567_890n), '1,234.56789');
  assert.equal(formatUgnot(0n), '0.00');
  assert.equal(formatUgnot(420_000n, 2), '0.42');
  assert.equal(formatUgnot(9223372036854775807n), '9,223,372,036,854.775807');
});

test('indexer trades come only from Bought events of this realm', () => {
  const event = (overrides: Record<string, unknown> = {}, attrs: Record<string, string> = {}) => ({
    hash: 'h1', block_height: 10, success: true,
    response: { events: [{ __typename: 'GnoEvent', type: 'Bought', pkg_path: realm, attrs: Object.entries({ market: 'm', buyer: 'g1x', outcome: 'Yes', microShares: '2000000', costUgnot: '840000', pricePpm: '420000', ...attrs }).map(([key, value]) => ({ key, value })) }] },
    ...overrides,
  });
  const trades = parseTrades([event(), event({ hash: 'h2', block_height: 12 }), event({ success: false }), event({}, { outcome: 'Maybe' }),
    { ...event(), response: { events: [{ __typename: 'GnoEvent', type: 'Bought', pkg_path: 'gno.land/r/other/markets', attrs: [] }] } }], realm);
  assert.deepEqual(trades.map(trade => trade.hash), ['h2', 'h1']);
  assert.equal(trades[0].costUgnot, 840000n);
  assert.deepEqual(parseTrades(null, realm), []);
});

test('Adena call responses separate committed, broadcast, rejected and failed outcomes', () => {
  assert.deepEqual(interpretCallResponse({ code: 0, status: 'success', type: 'TRANSACTION_SENT', data: { hash: 'abc=', height: '42' } }), { status: 'sent', hash: 'abc=', height: 42 });
  assert.deepEqual(interpretCallResponse({ code: 0, status: 'success', type: 'TRANSACTION_BROADCAST_SUCCESS', data: { hash: 'abc=' } }), { status: 'broadcast', hash: 'abc=' });
  assert.deepEqual(interpretCallResponse({ code: 4000, status: 'failure', type: 'TRANSACTION_REJECTED', data: null }), { status: 'rejected' });
  const failed = interpretCallResponse({ code: 4001, status: 'failure', type: 'TRANSACTION_FAILED', message: 'failed', data: { log: 'panic: price does not match review' } });
  assert.equal(failed.status, 'failed');
  assert.ok(failed.status === 'failed' && /price does not match review/.test(failed.chainLog));
  assert.equal(interpretCallResponse('garbage').status, 'unknown');
  const locked = interpretCallResponse({ code: 2000, status: 'failure', type: 'WALLET_LOCKED', data: null });
  assert.ok(locked.status === 'failed' && /locked/.test(locked.message));
});

test('realm refusals map to changed terms or plain failures', () => {
  assert.deepEqual(explainFailure('panic: price does not match review', 'x').changed, true);
  assert.deepEqual(explainFailure('insufficient market collateral', 'x').changed, true);
  assert.equal(explainFailure('insufficient funds to pay for fees', 'x').changed, false);
  assert.equal(explainFailure('something else', 'fallback').message, 'fallback');
});

// Realm v2 (contracts/v2/json.gno).
const v2Json = (overrides: Record<string, unknown> = {}) => ({
  id: 'senate-2026', question: 'Q?', rules: 'R', rulesHash: 'a'.repeat(64), conditionId: `0x${'d'.repeat(64)}`, yesTokenId: '11', noTokenId: '22', yesLabel: 'Yes', noLabel: 'No',
  oracle: 'g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5', treasury: 'g1z86xzys5xmsj2etpzmg46q5ymj7rmxkt49uw9q', topic: 'Politics', feePpm: 40000, createdAt: 100,
  tradingEndsAt: 5000, abandonAt: 5000 + 60 * 86400, yesPricePpm: 420000, noPricePpm: 600000, quoteVersion: 2, quotedAt: 900,
  state: 'open', outcome: '', evidenceHash: '', proposedAt: 0, finalizedAt: 0,
  escrowUgnot: '5000000', feesUgnot: '9744', reserveUgnot: '4580000', costUgnot: '420000', feesCollectedUgnot: '9744', yesMicroShares: '1000000', noMicroShares: '0',
  paidUgnot: '0', refundedCostUgnot: '0', refundedFeesUgnot: '0', withdrawnUgnot: '0', maxTradeMicroShares: '500000000', maxHolderMicroShares: '2000000000',
  maxSideMicroShares: '3000000', volumeUgnot: '420000', holders: 1, trades: 1,
  history: [{ at: 100, yesPricePpm: 410000, noPricePpm: 600000, version: 1 }, { at: 900, yesPricePpm: 420000, noPricePpm: 600000, version: 2 }],
  ...overrides,
});
const settings = { quoteTtl: 3600, paused: false, disputeWindow: 86400 };

test('the v2 fee matches the realm, rounding up, and a spend covers cost plus fee', () => {
  assert.equal(feeUgnot(1_000_000n, 420_000n, 40_000), 9_744n);
  assert.equal(feeUgnot(1_000_000n, 500_000n, 40_000), 10_000n);
  assert.equal(feeUgnot(1n, 500_000n, 40_000), 1n);
  assert.equal(feeUgnot(9_223_372_036_854_775_807n, 500_000n, 70_000), 161_409_010_644_958_577n); // the realm's own largest case
  assert.equal(feeUgnot(1_000_000n, 500_000n, 0), 0n);
  for (const spend of [10_000n, 1_000_000n, 7_777_777n]) {
    const shares = sharesForTotal(spend, 420_000n, 40_000);
    const total = (n: bigint) => quoteCost(n, 420_000n) + feeUgnot(n, 420_000n, 40_000);
    assert.ok(total(shares) <= spend);
    assert.ok(total(shares + 1n) > spend);
  }
  assert.equal(sharesForTotal(1_000_000n, 420_000n, 0), sharesForSpend(1_000_000n, 420_000n));
});

test('a v2 market reads into the shared shape with its fee, limits, quote expiry and states', () => {
  const m = parseMarketV2(v2Json(), 'gno.land/r/nym-sixseven067/markets/v2', settings);
  assert.equal(m.version, 2);
  assert.equal(m.noPricePpm, 600_000);
  assert.equal(outcomePricePpm(m, 'No'), 600_000n);
  assert.equal(m.closesAt, 5000);
  assert.equal(m.quoteExpiresAt, 4500);
  assert.equal(m.feesUgnot, 9_744n);
  assert.equal(m.topic, 'Politics');
  assert.equal(parseMarketV2(v2Json({ topic: '<b>x</b>' }), '', settings).topic, null);
  assert.deepEqual(m.limits, { trade: 500_000_000n, holder: 2_000_000_000n, side: 3_000_000n });
  // The side limit (3 shares, 1 held) binds before the collateral does.
  assert.equal(maxPurchase(m, 'Yes').microShares, 2_000_000n);
  assert.equal(maxPurchase(m, 'Yes').costUgnot, quoteCost(2_000_000n, 420_000n) + feeUgnot(2_000_000n, 420_000n, 40_000));
  const proposed = parseMarketV2(v2Json({ state: 'proposed', outcome: 'Void', proposedAt: 2000 }), '', settings);
  assert.equal(proposed.finalized, false);
  assert.equal(proposed.winner, '');
  const voided = parseMarketV2(v2Json({ state: 'final', outcome: 'Void', finalizedAt: 3000 }), '', settings);
  assert.equal(voided.finalized, true);
  assert.equal(voided.winner, '');
  const won = parseMarketV2(v2Json({ state: 'final', outcome: 'No' }), '', settings);
  assert.equal(won.winner, 'No');
  assert.throws(() => parseMarketV2(v2Json({ yesPricePpm: 420000, noPricePpm: 570000 }), '', settings), /invalid quote/);
  assert.throws(() => parseMarketV2(v2Json({ yesPricePpm: 20000 }), '', settings), /invalid quote/);
  assert.throws(() => parseMarketV2(v2Json({ state: 'final', outcome: '' }), '', settings), /contradictory/);
  assert.throws(() => parseMarketV2(v2Json({ feePpm: 70001 }), '', settings), /fee rate/);
  // Outcome names: Yes and No by default, two teams for a match, refused when they could mislead.
  assert.deepEqual(m.labels, { Yes: 'Yes', No: 'No' });
  assert.deepEqual(parseMarketV2(v2Json({ yesLabel: 'Los Angeles Dodgers', noLabel: 'Milwaukee Brewers' }), '', settings).labels, { Yes: 'Los Angeles Dodgers', No: 'Milwaukee Brewers' });
  for (const [yesLabel, noLabel] of [['Lakers', 'Lakers'], ['', 'Celtics'], ['[Lakers](x)', 'Celtics'], [' Lakers', 'Celtics'], ['L'.repeat(49), 'Celtics']]) {
    assert.throws(() => parseMarketV2(v2Json({ yesLabel, noLabel }), '', settings), /outcome names/);
  }
  const positions = parsePositions([{ marketId: 'senate-2026', position: { yesMicroShares: '1', noMicroShares: '0', spentUgnot: '1', feeUgnot: '1' } }], 'gno.land/r/x/v2', 2);
  assert.deepEqual(positions[0], { realm: 'gno.land/r/x/v2', marketId: 'senate-2026', yesMicroShares: 1n, noMicroShares: 0n, spentUgnot: 1n, feeUgnot: 1n, claimed: false, paidUgnot: 0n });
});
