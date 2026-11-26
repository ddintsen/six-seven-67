const RPC = 'https://rpc.onyx.testnets.gno.land';
async function q(pkg, expr) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'abci_query', params: { path: 'vm/qeval', data: Buffer.from(`${pkg}.${expr}`).toString('base64') } }) });
  const j = await res.json(); const t = Buffer.from(j.result.response.ResponseBase.Data, 'base64').toString();
  const m = /^\("([\s\S]*)" string\)$/.exec(t.trim()); return JSON.parse(JSON.parse('"' + m[1] + '"'));
}
const now = Date.now() / 1000;
const v1 = await q('gno.land/r/nym-sixseven067/markets', 'MarketsJSON()');
const v2 = await q('gno.land/r/nym-sixseven067/markets/v2', 'MarketsJSON()');
const list1 = Array.isArray(v1) ? v1 : v1.markets; const list2 = Array.isArray(v2) ? v2 : v2.markets;
console.log('v1', list1.length, 'v2', list2.length);
const mid = async token => { try { const r = await fetch(`https://clob.polymarket.com/midpoint?token_id=${token}`); if (!r.ok) return null; const j = await r.json(); return Number(j.mid); } catch { return null; } };
const rows = [];
for (const m of list1) {
  const p = await mid(m.yesTokenId);
  rows.push({ realm: 'v1', id: m.id, closesInH: ((m.closesAt - now) / 3600).toFixed(1), ours: m.yesPricePpm / 1e6, poly: p, drift: p == null ? null : Math.round(Math.abs(p - m.yesPricePpm / 1e6) * 100), final: m.finalized });
}
for (const m of list2) {
  const p = await mid(m.yesTokenId);
  rows.push({ realm: 'v2', id: m.id, closesInH: ((m.tradingEndsAt - now) / 3600).toFixed(1), ours: m.yesPricePpm / 1e6, poly: p, drift: p == null ? null : Math.round(Math.abs(p - m.yesPricePpm / 1e6) * 100), state: m.state, quoteAgeH: ((now - m.quotedAt) / 3600).toFixed(1) });
}
const bad = rows.filter(r => Number(r.closesInH) < 0 && !r.final && r.state !== 'final' || (r.drift ?? 0) >= 5 || r.poly == null);
console.log('closing within 48h:', rows.filter(r => Number(r.closesInH) >= 0 && Number(r.closesInH) < 48).map(r => `${r.id} ${r.closesInH}h`).join('; '));
console.log('past close, not final:', rows.filter(r => Number(r.closesInH) < 0 && !r.final && r.state !== 'final').map(r => `${r.realm} ${r.id} ${r.closesInH}h ${r.state ?? ''}`).join('; ') || 'none');
console.log('drift >= 5 points:', rows.filter(r => (r.drift ?? 0) >= 5).map(r => `${r.realm} ${r.id} ours ${r.ours} poly ${r.poly}`).join('; ') || 'none');
console.log('drift 2-4:', rows.filter(r => (r.drift ?? 0) >= 2 && r.drift < 5).map(r => `${r.id} ${r.ours}/${r.poly}`).join('; ') || 'none');
console.log('no Polymarket midpoint:', rows.filter(r => r.poly == null).map(r => `${r.realm} ${r.id}`).join('; ') || 'none');
console.log('v2 quote ages h:', rows.filter(r => r.realm === 'v2').map(r => `${r.id} ${r.quoteAgeH} ${r.state}`).join('; '));
