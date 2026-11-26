import { fetchMarkets } from '../../src/live/gno.ts';
import { readAgreedSettlement } from '../../src/live/polygon.ts';
const rpc = 'https://rpc.onyx.testnets.gno.land';
for (const [realm, v] of [['gno.land/r/nym-sixseven067/markets/v2', 2], ['gno.land/r/nym-sixseven067/markets', 1]] as const) {
  const ms = await fetchMarkets(rpc, realm, undefined, v);
  for (const m of ms) {
    if (m.finalized || m.state === 'proposed' || m.oracle.startsWith('g10fa')) continue;
    const s = await readAgreedSettlement(m.conditionId).catch(e => ({ settlement: null, note: String(e) }));
    const st = (s as any).settlement?.state ?? (s as any).note;
    if (st !== 'unresolved') console.log(v, m.id, m.state, '→', st);
  }
}
