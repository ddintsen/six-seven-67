import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchCatalogue, fetchCatalogueMarket, formatChance, formatUsd, parseCatalogueMarket, searchCatalogue } from './gamma.ts';

const id = (c: string) => '0x' + c.repeat(64);
const raw = (over: Record<string, unknown> = {}) => ({
  question: 'Will it rain in Kyiv tomorrow?', conditionId: id('a'), outcomes: '["Yes", "No"]', outcomePrices: '["0.62", "0.38"]',
  active: true, closed: false, archived: false, acceptingOrders: true, endDate: '2099-01-01T00:00:00Z', volumeNum: 1234.5, volume24hr: '99',
  description: 'Rules.', clobTokenIds: '["111", "222"]', events: [{ slug: 'rain-kyiv', title: 'Rain in Kyiv' }], ...over,
});
const fetcher = (body: unknown, status = 200) => {
  const urls: string[] = [];
  const fn = async (url: string) => { urls.push(url); return new Response(JSON.stringify(body), { status }); };
  return { fn, urls };
};

test('a Gamma market is read with its event, prices and shape', () => {
  const m = parseCatalogueMarket(raw())!;
  assert.equal(m.question, 'Will it rain in Kyiv tomorrow?');
  assert.deepEqual(m.prices, [0.62, 0.38]);
  assert.equal(m.eventSlug, 'rain-kyiv');
  assert.equal(m.binary, true);
  assert.equal(m.yesTokenId, '111');
  assert.equal(m.volume, 1234.5);
  assert.equal(m.volume24h, 99);
  assert.equal(parseCatalogueMarket(raw({ outcomes: '["Lakers", "Celtics"]' }))!.binary, false);
});

test('closed, ended, malformed or not accepting orders: left out', () => {
  assert.equal(parseCatalogueMarket(raw({ closed: true })), null);
  assert.equal(parseCatalogueMarket(raw({ acceptingOrders: false })), null);
  assert.equal(parseCatalogueMarket(raw({ endDate: '2020-01-01T00:00:00Z' })), null);
  assert.equal(parseCatalogueMarket(raw({ conditionId: '0x12' })), null);
  assert.equal(parseCatalogueMarket(raw({ outcomes: 'not json' })), null);
  assert.equal(parseCatalogueMarket(raw({ question: 'x'.repeat(2000) })), null);
  assert.deepEqual(parseCatalogueMarket(raw({ outcomePrices: '["2", "x"]' }))!.prices, [null, null]);
});

test('topic pages ask Polymarket for its own tag; search flattens events', async () => {
  const page = fetcher([raw(), raw({ conditionId: id('b'), closed: true })]);
  const list = await fetchCatalogue({ topic: 'Crypto', offset: 50, fetcher: page.fn });
  assert.equal(list.length, 1);
  assert.match(page.urls[0], /tag_id=21/);
  assert.match(page.urls[0], /offset=50/);
  const search = fetcher({ events: [{ slug: 'e', title: 'E', markets: [raw({ volume24hr: 1 }), raw({ conditionId: id('c'), volume24hr: 5 })] }] });
  const found = await searchCatalogue(' rain ', { fetcher: search.fn });
  assert.deepEqual(found.map(m => m.conditionId), [id('c'), id('a')]);
  assert.match(search.urls[0], /public-search\?q=rain/);
  assert.deepEqual(await searchCatalogue('  '), []);
  const one = fetcher([raw()]);
  assert.equal((await fetchCatalogueMarket(id('a'), { fetcher: one.fn }))!.conditionId, id('a'));
  assert.equal(await fetchCatalogueMarket('nope'), null);
  await assert.rejects(fetchCatalogue({ fetcher: fetcher({}, 503).fn }), /answered 503/);
});

test('chances and volumes read like Polymarket', () => {
  assert.equal(formatChance(0.004), '<1%');
  assert.equal(formatChance(0.996), '>99%');
  assert.equal(formatChance(0.625), '63%');
  assert.equal(formatChance(null), '–');
  assert.equal(formatUsd(9_400_000), '$9.4M');
  assert.equal(formatUsd(840_400), '$840K');
  assert.equal(formatUsd(95.4), '$95');
});
