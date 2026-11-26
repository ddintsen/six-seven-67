// Stand-ins for Polymarket's CLOB API and the Polygon RPCs the status page and
// the market page read. Each market's state is set by the test.
import type { Page, Route } from '@playwright/test';
import type { MockChain } from './mockChain';

export interface SourceState { closed: boolean; winner: '' | 'Yes' | 'No'; mid: number | null; payouts: [number, number] | null }

const POLYGON = ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org', 'https://1rpc.io/matic'];
const word = (n: bigint | number) => '0x' + BigInt(n).toString(16).padStart(64, '0');

type Bound = { id: string; question: string; rules: string; conditionId: string; yesTokenId: string; noTokenId: string; yesPricePpm: number; yesLabel?: string; noLabel?: string };

export class MockSources {
  state = new Map<string, SourceState>(); // by condition ID
  // Markets of both realms (v2 when the test turned it on before creating the sources).
  private all(): Bound[] { return [...this.chain.markets, ...(this.chain.v2?.markets ?? [])]; }
  constructor(private chain: MockChain) {
    // Distinct outcome tokens per market, as on Polymarket, so midpoints can be told apart.
    this.all().forEach((m, index) => { m.yesTokenId = `${index + 1}1`; m.noTokenId = `${index + 1}2`; });
    for (const m of this.all()) this.state.set(m.conditionId, { closed: false, winner: '', mid: m.yesPricePpm / 1_000_000, payouts: null });
  }
  set(id: string, next: Partial<SourceState>) {
    const m = this.all().find(item => item.id === id)!;
    this.state.set(m.conditionId, { ...this.state.get(m.conditionId)!, ...next });
  }
  void(id: string) { this.set(id, { closed: true, winner: '', mid: null, payouts: [1, 1] }); }
  settle(id: string, winner: 'Yes' | 'No') { this.set(id, { closed: true, winner, mid: null, payouts: winner === 'Yes' ? [1, 0] : [0, 1] }); }

  async install(page: Page) {
    await page.route('https://clob.polymarket.com/**', async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/prices-history') return route.fallback(); // the chain mock serves it
      if (url.pathname === '/midpoint') {
        const token = url.searchParams.get('token_id');
        const market = this.all().find(m => m.yesTokenId === token);
        const mid = market ? this.state.get(market.conditionId)?.mid : null;
        return mid == null ? route.fulfill({ status: 404, json: { error: 'No orderbook' } }) : route.fulfill({ json: { mid: String(mid) } });
      }
      const conditionId = url.pathname.split('/').pop()!;
      const market = this.all().find(m => m.conditionId === conditionId);
      const s = this.state.get(conditionId);
      if (!market || !s) return route.fulfill({ status: 404, json: { error: 'not found' } });
      return route.fulfill({ json: { condition_id: conditionId, closed: s.closed, question: market.question, description: market.rules,
        tokens: [{ token_id: market.yesTokenId, outcome: market.yesLabel ?? 'Yes', winner: s.winner === 'Yes' },
          { token_id: market.noTokenId, outcome: market.noLabel ?? 'No', winner: s.winner === 'No' }] } });
    });
    for (const rpc of POLYGON) {
      await page.route(`${rpc}/**`, (route: Route) => this.polygon(route));
      await page.route(rpc, (route: Route) => this.polygon(route));
    }
  }

  private polygon(route: Route) {
    const body = route.request().postDataJSON() as { params: [{ data: string }] };
    const data = body.params[0].data;
    const conditionId = '0x' + data.slice(10, 74);
    const s = this.state.get(conditionId);
    const payouts = s?.payouts ?? null;
    let result: string;
    if (data.startsWith('0xd42dc0c2')) result = word(s ? 2 : 0);
    else if (data.startsWith('0xdd34de67')) result = word(payouts ? payouts[0] + payouts[1] : 0);
    else result = word(payouts ? payouts[Number(BigInt('0x' + data.slice(74)))] : 0);
    return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result } });
  }
}
