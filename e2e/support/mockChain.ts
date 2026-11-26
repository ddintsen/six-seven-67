// A controlled stand-in for the public Onyx RPC, the tx-indexer and the Adena
// extension. Contract rules that matter to the interface (exact price, exact
// payment, collateral and one-time claims) are reproduced so the UI can be
// exercised against refusals without touching a shared network.
import { createHash } from 'node:crypto';
import type { Page, Route } from '@playwright/test';
import { MockRealmV2, REALM_V2, REALM_V2_ADDRESS } from './mockV2';

export const REALM = 'gno.land/r/nym-sixseven067/markets';
export const ADDRESS = 'g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5';
export const ADMIN = 'g1z86xzys5xmsj2etpzmg46q5ymj7rmxkt49uw9q';
const SCALE = 1_000_000n;

export interface MockMarket {
  id: string; question: string; rules: string; conditionId: string; yesTokenId: string; noTokenId: string;
  closesAt: number; yesPricePpm: number; escrow: bigint; yes: bigint; no: bigint; finalized: boolean; winner: '' | 'Yes' | 'No';
  quoteVersion: number; createdAt: number; volume: bigint; trades: number; holders: Set<string>; history: { at: number; yesPricePpm: number; version: number }[];
  oracle: string; evidence: string;
}
export interface MockPosition { yes: bigint; no: bigint; spent: bigint; claimed: boolean; paid: bigint }

const NOW = 1_791_800_000; // 2026-10-12
export const MOCK_NOW = NOW;
export function seedMarkets(): MockMarket[] {
  const make = (id: string, question: string, conditionId: string, yesPricePpm: number, closesAt: number): MockMarket => ({
    id, question, rules: `This market will resolve to “Yes” if ${question.replace(/\?$/, '')}. Otherwise, this market will resolve to “No”.`,
    conditionId, yesTokenId: '11', noTokenId: '22', closesAt, yesPricePpm, escrow: 8_000_000n, yes: 0n, no: 0n, finalized: false, winner: '',
    quoteVersion: 1, createdAt: NOW - 86_400, volume: 0n, trades: 0, holders: new Set(), history: [{ at: NOW - 86_400, yesPricePpm, version: 1 }],
    oracle: ADDRESS, evidence: '',
  });
  return [
    make('btc-vs-gold-2026', 'Will Bitcoin outperform Gold in 2026?', '0xdcae9573d5680a2c958cca4676ed28df7a06861572124f3396cc60ab6b92b9c2', 420_000, 1_798_779_600),
    make('starship-reusable-2026', 'SpaceX Starship fully reusable before 2027?', '0x0a1b551058f78174cf64ed9d61edb103a76c4df88232ee1188dbc9e390896e7d', 340_000, 1_798_779_540),
    make('apple-new-line-2026', 'Will Apple release a new product line before 2027?', '0x0a84cdeb03a25ae441697191edbcc31ad6803c3f4d48af2e0429952336c04fc1', 790_000, 1_798_779_540),
    make('fed-hike-2026', 'Another Fed rate hike in 2026?', '0x9b1a03b41a1a68c209e9c3caf3d8af3f878420d6dbe8cb8afffd66049e73b114', 750_000, 1_796_878_740),
  ];
}

function goQuote(text: string) {
  return `("${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}" string)`;
}
const s = (value: bigint) => `"${value}"`;
// A small plain picture for the image host.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPQcLPBihiGlgQAlrgqgQIgyvsAAAAASUVORK5CYII=', 'base64');
// The realm's BindingHash, so Polymarket mocks can agree with the binding.
export function bindingHash(question: string, rules: string): string {
  const framed = `${Buffer.byteLength(question)}:${question}${Buffer.byteLength(rules)}:${rules}`;
  return createHash('sha256').update(framed, 'utf8').digest('hex');
}
function marketJson(m: MockMarket) {
  return `{"id":${JSON.stringify(m.id)},"question":${JSON.stringify(m.question)},"rules":${JSON.stringify(m.rules)},"rulesHash":"${bindingHash(m.question, m.rules)}","conditionId":"${m.conditionId}","yesTokenId":"${m.yesTokenId}","noTokenId":"${m.noTokenId}","closesAt":${m.closesAt},"yesPricePpm":${m.yesPricePpm},"oracle":"${m.oracle}","escrowUgnot":${s(m.escrow)},"yesMicroShares":${s(m.yes)},"noMicroShares":${s(m.no)},"finalized":${m.finalized},"winner":"${m.winner}","evidenceHash":"${m.finalized ? (m.evidence || 'e'.repeat(64)) : ''}","finalizedAt":${m.finalized ? NOW : 0},"paidUgnot":"0","quoteVersion":${m.quoteVersion},"createdAt":${m.createdAt},"volumeUgnot":${s(m.volume)},"trades":${m.trades},"holders":${m.holders.size},"history":${JSON.stringify(m.history)}}`;
}

// Polymarket's Gamma API for the catalogue mirror. Each fixture carries the tag
// IDs a topic filter matches; the response drops them, as Gamma's does not carry tags.
export interface GammaFixture { question: string; conditionId: string; outcomes: string[]; prices: number[]; tags: number[]; eventSlug: string; endDate: string; volume: number; description: string; image: string | null }
export const IMAGE_ORIGIN = 'https://polymarket-upload.s3.us-east-2.amazonaws.com';
export function gammaMarket(question: string, conditionId: string, more: Partial<GammaFixture> = {}): GammaFixture {
  return { question, conditionId, outcomes: ['Yes', 'No'], prices: [0.62, 0.38], tags: [2], eventSlug: question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    endDate: '2027-06-30T12:00:00Z', volume: 1_250_000, description: `This market will resolve to “Yes” if ${question.replace(/\?$/, '')}.`,
    image: `${IMAGE_ORIGIN}/${conditionId.slice(2, 10)}.png`, ...more };
}
export function seedGamma(): GammaFixture[] {
  return [
    gammaMarket('Will the Democrats win the Senate in 2026?', '0x' + '1'.repeat(64), { prices: [0.48, 0.52], volume: 9_400_000 }),
    gammaMarket('Will Ethereum reach $5,000 in 2026?', '0x' + '2'.repeat(64), { tags: [21], prices: [0.004, 0.996], volume: 2_100_000 }),
    gammaMarket('Lakers vs. Celtics', '0x' + '3'.repeat(64), { tags: [1], outcomes: ['Lakers', 'Celtics'], prices: [0.55, 0.45], volume: 310_000 }),
    // Listed on 67 already: the mirror leaves it to the 67 list.
    gammaMarket('Will Bitcoin outperform Gold in 2026?', '0xdcae9573d5680a2c958cca4676ed28df7a06861572124f3396cc60ab6b92b9c2', { tags: [21], prices: [0.41, 0.59] }),
  ];
}
function gammaJson(f: GammaFixture) {
  return { question: f.question, conditionId: f.conditionId, outcomes: JSON.stringify(f.outcomes), outcomePrices: JSON.stringify(f.prices.map(String)), active: true, closed: false, archived: false,
    acceptingOrders: true, endDate: f.endDate, volumeNum: f.volume, volume24hr: f.volume / 10, description: f.description, clobTokenIds: JSON.stringify(['111', '222']), icon: f.image, image: f.image, events: [{ slug: f.eventSlug, title: f.question }] };
}

export class MockChain {
  // Realm v2 beside v1, when a test turns it on (enableV2).
  v2: MockRealmV2 | null = null;
  gamma: GammaFixture[] | 'down' = seedGamma();
  gammaRequests: string[] = [];
  markets = seedMarkets();
  positions = new Map<string, Map<string, MockPosition>>();
  deployed = true;
  balance = 25_000_000n;
  administrator = ADMIN;
  pendingAdministrator = '';
  network: 'onyx-1' | 'test5' = 'onyx-1';
  doContract: 'execute' | 'reject' | 'hang' | 'broadcast-only' | { fail: string } = 'execute';
  calls: { func: string; args: string[]; send: string; realm?: 'v2' }[] = [];
  height = 340_000;

  position(owner: string, id: string): MockPosition {
    let byMarket = this.positions.get(owner);
    if (!byMarket) { byMarket = new Map(); this.positions.set(owner, byMarket); }
    let p = byMarket.get(id);
    if (!p) { p = { yes: 0n, no: 0n, spent: 0n, claimed: false, paid: 0n }; byMarket.set(id, p); }
    return p;
  }
  market(id: string) { return this.markets.find(m => m.id === id)!; }
  requote(id: string, yesPricePpm: number) {
    const m = this.market(id);
    m.yesPricePpm = yesPricePpm; m.quoteVersion += 1;
    m.history.push({ at: NOW + m.quoteVersion * 3600, yesPricePpm, version: m.quoteVersion });
  }
  finalize(id: string, winner: 'Yes' | 'No') { const m = this.market(id); m.finalized = true; m.winner = winner; }

  // Executes a MsgCall with the realm's checks. Returns a panic message or null.
  execute(caller: string, func: string, args: string[], send: string): string | null {
    const sent = send ? BigInt(send.replace('ugnot', '')) : 0n;
    if (func === 'Buy') {
      const [id, outcome, sharesText, expectedText] = args;
      const m = this.market(id);
      if (!m) return 'unknown market';
      if (m.finalized || NOW >= m.closesAt) return 'trading closed';
      const price = outcome === 'Yes' ? BigInt(m.yesPricePpm) : SCALE - BigInt(m.yesPricePpm);
      if (BigInt(expectedText) !== price) return 'price does not match review';
      const shares = BigInt(sharesText);
      const product = shares * price;
      const cost = product / SCALE + (product % SCALE ? 1n : 0n);
      if (sent !== cost) return 'send the exact quoted ugnot amount';
      const nextYes = m.yes + (outcome === 'Yes' ? shares : 0n);
      const nextNo = m.no + (outcome === 'No' ? shares : 0n);
      if ((nextYes > nextNo ? nextYes : nextNo) > m.escrow + cost) return 'insufficient market collateral';
      if (cost > this.balance) return 'insufficient funds';
      this.balance -= cost;
      m.yes = nextYes; m.no = nextNo; m.escrow += cost; m.volume += cost; m.trades += 1; m.holders.add(caller);
      const p = this.position(caller, id);
      if (outcome === 'Yes') p.yes += shares; else p.no += shares;
      p.spent += cost;
      this.height += 1;
      return null;
    }
    if (func === 'Claim') {
      const [id] = args;
      const m = this.market(id);
      if (!m.finalized) return 'outcome is not final';
      const p = this.position(caller, id);
      if (p.claimed) return 'position already claimed';
      const payout = m.winner === 'Yes' ? p.yes : p.no;
      p.claimed = true; p.paid = payout; m.escrow -= payout; this.balance += payout;
      this.height += 1;
      return null;
    }
    if (func === 'SetQuote') {
      const [id, priceText, versionText] = args;
      const m = this.market(id);
      if (caller !== this.administrator) return 'administrator only';
      if (m.finalized || NOW >= m.closesAt) return 'trading closed';
      if (Number(versionText) !== m.quoteVersion) return 'quote version changed';
      if (Number(priceText) === m.yesPricePpm) return 'quote unchanged';
      this.requote(id, Number(priceText));
      this.height += 1;
      return null;
    }
    if (func === 'FinalizeByOracle') {
      const [id, conditionId, rulesHash, yesTokenId, noTokenId, winner, evidence] = args;
      const m = this.market(id);
      if (caller !== m.oracle) return 'oracle only';
      if (m.finalized) return 'outcome already final';
      if (conditionId !== m.conditionId || rulesHash !== bindingHash(m.question, m.rules) || yesTokenId !== m.yesTokenId || noTokenId !== m.noTokenId) return 'source binding mismatch';
      m.finalized = true; m.winner = winner as 'Yes' | 'No'; m.evidence = evidence;
      this.height += 1;
      return null;
    }
    if (func === 'AcceptAdministrator') {
      if (caller !== this.pendingAdministrator) return 'pending administrator only';
      this.administrator = caller; this.pendingAdministrator = '';
      return null;
    }
    return 'unknown function';
  }

  qeval(expression: string): string | { error: string } {
    if (!this.deployed) return { error: `invalid package path "${REALM}"` };
    if (expression === 'MarketsJSON()') return goQuote(`[${this.markets.map(marketJson).join(',')}]`);
    if (expression === 'Administrator()') return `("${this.administrator}" address)`;
    if (expression === 'PendingAdministrator()') return this.pendingAdministrator ? `("${this.pendingAdministrator}" address)` : '("" address)';
    const match = /^PositionsJSON\("(g1[a-z0-9]+)"\)$/.exec(expression);
    if (match) {
      const byMarket = this.positions.get(match[1]) ?? new Map();
      const entries = this.markets.filter(m => byMarket.has(m.id)).map(m => {
        const p = byMarket.get(m.id)!;
        return `{"marketId":"${m.id}","position":{"yesMicroShares":${s(p.yes)},"noMicroShares":${s(p.no)},"spentUgnot":${s(p.spent)},"claimed":${p.claimed},"paidUgnot":${s(p.paid)}}}`;
      });
      return goQuote(`[${entries.join(',')}]`);
    }
    return { error: 'unknown expression' };
  }

  // The network alone (Onyx RPC, indexer, Polymarket's Gamma API), for tests
  // that bring their own wallet stand-in.
  async installNetwork(page: Page) {
    await page.route('https://rpc.onyx.testnets.gno.land/**', async (route: Route) => {
      const body = route.request().postDataJSON() as { method: string; params: { data?: string } };
      if (body.method === 'status') {
        return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: { node_info: { network: 'onyx-1' }, sync_info: { latest_block_height: String(this.height), latest_block_time: new Date(NOW * 1000).toISOString() } } } });
      }
      const path = (body.params as { path?: string }).path ?? '';
      if (path.startsWith('bank/balances/') && this.v2 && path.endsWith(REALM_V2_ADDRESS)) {
        const owed = this.v2.markets.reduce((sum, m) => sum + m.escrow + m.fees, 0n);
        return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: { response: { ResponseBase: { Error: null, Data: Buffer.from(`"${owed}ugnot"`).toString('base64'), Log: '' } } } } });
      }
      if (path.startsWith('bank/balances/')) {
        const escrow = this.markets.reduce((sum, m) => sum + m.escrow, 0n);
        return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: { response: { ResponseBase: { Error: null, Data: Buffer.from(`"${escrow}ugnot"`).toString('base64'), Log: '' } } } } });
      }
      const query = Buffer.from(body.params.data ?? '', 'base64').toString();
      if (query.startsWith(`${REALM_V2}.`)) {
        const answer = this.v2?.qeval(query.slice(REALM_V2.length + 1)) ?? null;
        const v2Base = answer === null
          ? { Error: { msg: 'package not found' }, Data: null, Log: `package not found: ${REALM_V2}` }
          : { Error: null, Data: Buffer.from(goQuote(answer)).toString('base64'), Log: '' };
        return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: { response: { ResponseBase: v2Base } } } });
      }
      const result = this.qeval(query.slice(REALM.length + 1));
      const base = typeof result === 'string'
        ? { Error: null, Data: Buffer.from(result).toString('base64'), Log: '' }
        : { Error: { msg: result.error }, Data: null, Log: result.error };
      return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: { response: { ResponseBase: base } } } });
    });
    await page.route('https://indexer.onyx.testnets.gno.land/**', route => route.fulfill({ json: { data: { transactions: [], blocks: [] } } }));
    await page.route('https://gamma-api.polymarket.com/**', (route: Route) => {
      const url = new URL(route.request().url());
      this.gammaRequests.push(url.pathname + url.search);
      if (this.gamma === 'down') return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      const all = this.gamma;
      if (url.pathname === '/public-search') {
        const q = (url.searchParams.get('q') ?? '').toLowerCase();
        const hits = all.filter(f => f.question.toLowerCase().includes(q));
        return route.fulfill({ json: { events: hits.map(f => ({ slug: f.eventSlug, title: f.question, markets: [gammaJson(f)] })), pagination: { hasMore: false } } });
      }
      const ids = url.searchParams.getAll('condition_ids').flatMap(v => v.split(',')).filter(Boolean);
      const tag = Number(url.searchParams.get('tag_id') ?? 0);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const list = all.filter(f => (!ids.length || ids.includes(f.conditionId)) && (!tag || f.tags.includes(tag)));
      return route.fulfill({ json: list.slice(offset).map(gammaJson) });
    });
    // Market pictures and Polymarket's price history, as its own hosts serve them.
    await page.route(`${IMAGE_ORIGIN}/**`, (route: Route) => route.fulfill({ contentType: 'image/png', body: PIXEL }));
    // No midpoint unless a test installs MockSources, which answers one per market.
    await page.route('https://clob.polymarket.com/midpoint**', (route: Route) => route.fulfill({ json: {} }));
    await page.route('https://clob.polymarket.com/prices-history**', (route: Route) => {
      const start = NOW - 30 * 86_400;
      return route.fulfill({ json: { history: Array.from({ length: 31 }, (_, i) => ({ t: start + i * 86_400, p: Math.round((0.4 + 0.08 * Math.sin(i / 4)) * 1000) / 1000 })) } });
    });
  }

  async install(page: Page) {
    await this.installNetwork(page);
    await page.exposeFunction('__mockAccount', () => ({ coins: `${this.balance}ugnot`, network: this.network }));
    await page.exposeFunction('__mockSwitch', (chainId: string) => { if (chainId === 'onyx-1') this.network = 'onyx-1'; return this.network; });
    await page.exposeFunction('__mockDoContract', (request: { messages: { value: { caller: string; func: string; args: string[]; send: string; pkg_path: string } }[] }) => {
      const messages = request.messages.map(message => message.value);
      for (const { func, args, send, pkg_path } of messages) this.calls.push({ func, args, send, ...(pkg_path === REALM_V2 ? { realm: 'v2' as const } : {}) });
      if (this.doContract === 'reject') return { code: 4000, status: 'failure', type: 'TRANSACTION_REJECTED', message: 'rejected', data: null };
      if (this.doContract === 'hang') return new Promise(() => undefined);
      if (typeof this.doContract === 'object') return { code: 4001, status: 'failure', type: 'TRANSACTION_FAILED', message: 'failed', data: { log: this.doContract.fail } };
      if (this.doContract === 'broadcast-only') return { code: 0, status: 'success', type: 'TRANSACTION_BROADCAST_SUCCESS', message: 'sent', data: { hash: 'bWVtcG9vbA==' } };
      // One transaction: every message applies or none does, as on chain.
      const snapshot = structuredClone({ markets: this.markets.map(m => ({ ...m, holders: [...m.holders] })), balance: this.balance, administrator: this.administrator, pending: this.pendingAdministrator });
      const v2Saved = this.v2?.snapshot();
      for (const { caller, func, args, send, pkg_path } of messages) {
        const sent = send ? BigInt(send.replace('ugnot', '')) : 0n;
        const refusal = pkg_path === REALM_V2
          ? (this.v2 ? this.v2.execute(caller, func, args, sent, amount => { if (amount > this.balance) return false; this.balance -= amount; return true; }, amount => { this.balance += amount; }) : 'package not found')
          : this.execute(caller, func, args, send);
        if (!refusal) this.height += pkg_path === REALM_V2 ? 1 : 0;
        if (refusal) {
          this.markets = snapshot.markets.map(m => ({ ...m, holders: new Set(m.holders) }));
          if (this.v2 && v2Saved) this.v2.restore(v2Saved);
          this.balance = snapshot.balance; this.administrator = snapshot.administrator; this.pendingAdministrator = snapshot.pending;
          return { code: 4001, status: 'failure', type: 'TRANSACTION_FAILED', message: 'failed', data: { log: `panic: ${refusal}` } };
        }
      }
      return { code: 0, status: 'success', type: 'TRANSACTION_SENT', message: 'sent', data: { hash: 'dHhoYXNo', height: String(this.height) } };
    });
    await page.addInitScript(address => {
      const w = window as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const ok = (type: string, data: unknown) => ({ code: 0, status: 'success', type, message: '', data });
      (window as unknown as { adena: unknown }).adena = {
        AddEstablish: async () => ok('CONNECTION_SUCCESS', {}),
        GetAccount: async () => { const a = await w.__mockAccount() as { coins: string; network: string }; return ok('GET_ACCOUNT', { address, coins: a.coins, chainId: a.network, accountNumber: '7', sequence: '3', status: 'ACTIVE' }); },
        GetNetwork: async () => { const a = await w.__mockAccount() as { network: string }; return ok('GET_NETWORK', { chainId: a.network, networkName: a.network === 'onyx-1' ? 'Onyx' : 'Test5', addressPrefix: 'g', rpcUrl: 'https://rpc.onyx.testnets.gno.land', indexerUrl: null }); },
        On: () => undefined,
        SwitchNetwork: async (chainId: unknown) => { const network = await w.__mockSwitch(chainId); return network === chainId ? ok('SWITCH_NETWORK_SUCCESS', { chainId }) : { code: 4001, status: 'failure', type: 'UNADDED_NETWORK', message: '', data: null }; },
        DoContract: (request: unknown) => w.__mockDoContract(request),
      };
    }, ADDRESS);
  }
}

export async function connectAdena(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: /Connect Adena/ }).click();
  const wallet = page.getByRole('dialog', { name: 'Wallet', exact: true });
  await wallet.getByRole('button', { name: 'Connect Adena', exact: true }).click();
  await wallet.getByRole('button', { name: 'Close wallet', exact: true }).click();
}

// Turns realm v2 on for the app: the chain override (honoured on a loopback
// origin only) adds the v2 path to the Onyx configuration.
export async function enableV2(page: Page, chain: MockChain): Promise<MockRealmV2> {
  chain.v2 = chain.v2 ?? new MockRealmV2();
  await page.addInitScript(path => {
    localStorage.setItem('67.chain.override', JSON.stringify({ id: 'onyx', chainId: 'onyx-1', chainName: 'Onyx testnet', rpcUrl: 'https://rpc.onyx.testnets.gno.land',
      indexerUrl: 'https://indexer.onyx.testnets.gno.land/graphql/query', realm: 'gno.land/r/nym-sixseven067/markets', realmV2: path,
      explorerUrl: 'https://onyx.testnets.gno.land', txExplorerUrl: 'https://gnoscan.io/transactions/details', faucetUrl: 'https://faucet.gno.land' }));
  }, REALM_V2);
  return chain.v2;
}
