import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdenaStore, formatGnot } from './adena.ts';
import type { AdenaProvider } from './adena.ts';

const ok = (data: unknown, type = 'GET_ACCOUNT_SUCCESS') => ({ code: 0, status: 'success', type, message: '', data });
const account = (overrides: Record<string, unknown> = {}) => ({ address: 'g1controlledaccount', coins: '1234567ugnot', chainId: 'onyx-1', accountNumber: '3', sequence: '7', status: 'ACTIVE', ...overrides });
const network = (overrides: Record<string, unknown> = {}) => ({ chainId: 'onyx-1', networkName: 'Onyx', addressPrefix: 'g', rpcUrl: 'https://rpc.onyx.testnets.gno.land', indexerUrl: null, ...overrides });
class ControlledProvider implements AdenaProvider {
  events = new Map<string, (payload: string) => void>();
  onCalls = 0;
  accountReads = 0;
  establishCalls: string[] = [];
  establish = async (): Promise<unknown> => ok({});
  account = async (): Promise<unknown> => ok(account());
  network = async (): Promise<unknown> => ok(network());
  AddEstablish = async (name: string) => { this.establishCalls.push(name); return this.establish(); };
  GetAccount = async () => { this.accountReads++; return this.account(); };
  GetNetwork = async () => this.network();
  On = (event: 'changedAccount' | 'changedNetwork', listener: (payload: string) => void) => { this.onCalls++; this.events.set(event, listener); };
}
async function flush() { for (let index = 0; index < 3; index++) await new Promise<void>(resolve => setImmediate(resolve)); }

test('GNOT formatting preserves micro-unit precision beyond Number limits', () => {
  assert.equal(formatGnot('9007199254740993123456ugnot,42utoken'), '9007199254740993.123456');
  assert.equal(formatGnot('1ugnot'), '0.000001');
  assert.equal(formatGnot('1000000ugnot'), '1');
  assert.equal(formatGnot('5utoken'), '0');
  assert.equal(formatGnot(''), '0');
  for (const invalid of ['-1ugnot', '1.5ugnot', '1ugnot,2ugnot', '3', ',']) assert.throws(() => formatGnot(invalid));
});
test('missing extension stays unavailable without opening anything', async () => {
  const wallet = createAdenaStore(() => undefined);
  assert.equal(wallet.getSnapshot().status, 'unavailable');
  await wallet.connect();
  assert.equal(wallet.getSnapshot().status, 'unavailable');
});
test('connection reads an exact GNOT balance and validated current network', async () => {
  const provider = new ControlledProvider();
  const wallet = createAdenaStore(() => provider);
  assert.equal(provider.establishCalls.length, 0);
  await wallet.connect();
  assert.deepEqual(provider.establishCalls, ['67']);
  const state = wallet.getSnapshot();
  assert.equal(state.status, 'connected');
  if (state.status !== 'connected') throw new Error('Expected connected');
  assert.equal(state.balanceGnot, '1.234567');
  assert.equal(state.account.address, 'g1controlledaccount');
  assert.equal(state.network.chainId, 'onyx-1');
  assert.equal(state.network.indexerUrl, null);
});
test('ALREADY_CONNECTED failure continues into account reading', async () => {
  const provider = new ControlledProvider();
  provider.establish = async () => ({ code: 4001, type: 'ALREADY_CONNECTED', status: 'failure', message: 'Already connected', data: null });
  const wallet = createAdenaStore(() => provider);
  await wallet.connect();
  assert.equal(wallet.getSnapshot().status, 'connected');
});
test('declined connection is recoverable without fabricated account data', async () => {
  const provider = new ControlledProvider();
  provider.establish = async () => ({ code: 4001, type: 'ADD_ESTABLISH_REJECTED', status: 'failure', message: 'Rejected', data: null });
  const wallet = createAdenaStore(() => provider);
  await wallet.connect();
  assert.equal(wallet.getSnapshot().status, 'error');
  assert.equal(provider.accountReads, 0);
  provider.establish = async () => ok({});
  await wallet.connect();
  assert.equal(wallet.getSnapshot().status, 'connected');
});
test('malformed and unsupported account responses are rejected at the provider boundary', async () => {
  for (const data of [account({ status: 'UNKNOWN' }), account({ accountNumber: 3 }), account({ address: 'cosmos1wrongprefix' }), account({ coins: '-1ugnot' })]) {
    const provider = new ControlledProvider(); provider.account = async () => ok(data);
    const wallet = createAdenaStore(() => provider);
    await wallet.connect();
    assert.equal(wallet.getSnapshot().status, 'error');
  }
});
test('a successful unused IN_ACTIVE account connects read-only with its exact zero balance', async () => {
  const provider = new ControlledProvider();
  provider.account = async () => ok(account({ status: 'IN_ACTIVE', coins: '', accountNumber: '0', sequence: '0' }));
  const wallet = createAdenaStore(() => provider);
  await wallet.connect();
  const state = wallet.getSnapshot();
  assert.equal(state.status, 'connected');
  if (state.status !== 'connected') throw new Error('Expected unused account connection');
  assert.equal(state.account.status, 'IN_ACTIVE');
  assert.equal(state.balanceGnot, '0');
  assert.equal(state.account.coins, '');
  assert.equal(state.account.accountNumber, '0');
  assert.equal(state.account.sequence, '0');
});
test('numeric response codes and string types are required, with errors selected by type', async () => {
  for (const invalid of [{ ...ok(account()), code: 'GET_ACCOUNT_SUCCESS' }, { ...ok(account()), type: undefined }, { ...ok(account()), status: 'unexpected' }]) {
    const provider = new ControlledProvider(); provider.account = async () => invalid;
    const wallet = createAdenaStore(() => provider); await wallet.connect();
    const state = wallet.getSnapshot();
    if (state.status !== 'error') throw new Error('Expected boundary error');
    assert.equal(state.code, 'INVALID_RESPONSE');
  }
  const provider = new ControlledProvider();
  provider.account = async () => ({ code: 4001, type: 'WALLET_LOCKED', status: 'failure', data: null });
  const wallet = createAdenaStore(() => provider); await wallet.connect();
  const state = wallet.getSnapshot();
  if (state.status !== 'error') throw new Error('Expected locked error');
  assert.match(state.message, /Unlock Adena/);
});
test('a transient account/network race retries once and a persistent mismatch fails', async () => {
  const provider = new ControlledProvider();
  let reads = 0;
  provider.network = async () => ok(network({ chainId: ++reads === 1 ? 'gnoland-1' : 'onyx-1' }));
  const wallet = createAdenaStore(() => provider);
  await wallet.connect();
  assert.equal(wallet.getSnapshot().status, 'connected');
  assert.equal(reads, 2);
  provider.network = async () => ok(network({ chainId: 'gnoland-1' }));
  await wallet.refresh();
  const state = wallet.getSnapshot();
  assert.equal(state.status, 'error');
  if (state.status === 'error') assert.equal(state.code, 'NETWORK_CHANGED');
});
test('provider events are attached once and ignored by disconnected stores', async () => {
  const provider = new ControlledProvider();
  const first = createAdenaStore(() => provider), second = createAdenaStore(() => provider);
  await first.connect(); await second.connect();
  assert.equal(provider.onCalls, 2);
  first.disconnect();
  provider.account = async () => ok(account({ coins: '2000000ugnot' }));
  const reads = provider.accountReads;
  provider.events.get('changedAccount')?.('untrusted event payload');
  await flush();
  assert.equal(provider.accountReads, reads + 1);
  assert.equal(first.getSnapshot().status, 'disconnected');
  const state = second.getSnapshot();
  if (state.status !== 'connected') throw new Error('Expected connected');
  assert.equal(state.balanceGnot, '2');
  await first.connect();
  assert.equal(provider.onCalls, 2);
});
test('disconnect cancels late establishment and pending account results', async () => {
  const provider = new ControlledProvider();
  let finish: (value: unknown) => void = () => undefined;
  provider.establish = () => new Promise(resolve => { finish = resolve; });
  const wallet = createAdenaStore(() => provider);
  const connecting = wallet.connect();
  await flush();
  wallet.disconnect(); finish(ok({})); await connecting;
  assert.equal(wallet.getSnapshot().status, 'disconnected');
  assert.equal(provider.accountReads, 0);
  provider.establish = async () => ok({}); await wallet.connect();
  provider.account = () => new Promise(resolve => { finish = resolve; });
  const refreshing = wallet.refresh();
  await flush();
  wallet.disconnect(); finish(ok(account({ coins: '99000000ugnot' }))); await refreshing;
  assert.equal(wallet.getSnapshot().status, 'disconnected');
});
test('newer refresh wins over an older in-flight response', async () => {
  const provider = new ControlledProvider();
  const wallet = createAdenaStore(() => provider); await wallet.connect();
  let finish: (value: unknown) => void = () => undefined;
  provider.account = () => new Promise(resolve => { finish = resolve; });
  const oldRead = wallet.refresh();
  await flush();
  provider.account = async () => ok(account({ coins: '3000000ugnot' }));
  const newRead = wallet.refresh();
  finish(ok(account({ coins: '2000000ugnot' }))); await oldRead; await newRead;
  const state = wallet.getSnapshot();
  if (state.status !== 'connected') throw new Error('Expected connected');
  assert.equal(state.balanceGnot, '3');
});
test('injected requests are serialized across stores sharing one provider', async () => {
  const provider = new ControlledProvider();
  let active = 0;
  let maximum = 0;
  async function exclusive(data: unknown) {
    active++; maximum = Math.max(maximum, active);
    await flush(); active--;
    return ok(data);
  }
  provider.establish = () => exclusive({});
  provider.account = () => exclusive(account());
  provider.network = () => exclusive(network());
  const first = createAdenaStore(() => provider), second = createAdenaStore(() => provider);
  await Promise.all([first.connect(), second.connect()]);
  assert.equal(first.getSnapshot().status, 'connected');
  assert.equal(second.getSnapshot().status, 'connected');
  assert.equal(maximum, 1);
});
test('an unanswered connection requires reload and never starts another request on that provider', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const provider = new ControlledProvider();
  let finish: (value: unknown) => void = () => undefined;
  provider.establish = () => new Promise(resolve => { finish = resolve; });
  let currentProvider: AdenaProvider = provider;
  const wallet = createAdenaStore(() => currentProvider);
  const connecting = wallet.connect();
  await flush();
  const second = createAdenaStore(() => provider);
  const queuedConnection = second.connect();
  await flush();
  context.mock.timers.tick(35_000);
  await Promise.all([connecting, queuedConnection]);
  const state = wallet.getSnapshot();
  assert.equal(state.status, 'error');
  if (state.status !== 'error') throw new Error('Expected reload-required error');
  assert.equal(state.code, 'RELOAD_REQUIRED');
  assert.match(state.message, /reload/i);
  assert.equal(second.getSnapshot().status, 'error');
  await wallet.connect();
  assert.equal(provider.establishCalls.length, 1);
  wallet.disconnect();
  assert.equal(wallet.getSnapshot().status, 'disconnected');
  await wallet.connect();
  assert.equal(provider.establishCalls.length, 1);
  assert.equal(wallet.getSnapshot().status, 'error');
  const afterTimeout = createAdenaStore(() => provider);
  await afterTimeout.connect();
  assert.equal(provider.establishCalls.length, 1);
  finish(ok({}));
  await flush();
  await wallet.connect();
  assert.equal(provider.establishCalls.length, 1);
  assert.equal(provider.accountReads, 0);
  const replacement = new ControlledProvider();
  currentProvider = replacement;
  await wallet.connect();
  assert.equal(wallet.getSnapshot().status, 'connected');
  assert.equal(replacement.establishCalls.length, 1);
});
test('a timed-out account read remains blocked after local disconnect', async context => {
  const provider = new ControlledProvider();
  const wallet = createAdenaStore(() => provider);
  await wallet.connect();
  const reads = provider.accountReads;
  context.mock.timers.enable({ apis: ['setTimeout'] });
  provider.account = () => new Promise(() => undefined);
  const refreshing = wallet.refresh();
  await flush();
  context.mock.timers.tick(10_000);
  await refreshing;
  const state = wallet.getSnapshot();
  if (state.status !== 'error') throw new Error('Expected reload-required error');
  assert.equal(state.code, 'RELOAD_REQUIRED');
  await wallet.refresh();
  assert.equal(provider.accountReads, reads + 1);
  wallet.disconnect();
  await wallet.connect();
  assert.equal(provider.establishCalls.length, 1);
  assert.equal(provider.accountReads, reads + 1);
});
test('a queued account read starts its timeout only when actually dispatched', async context => {
  const provider = new ControlledProvider();
  const first = createAdenaStore(() => provider);
  await first.connect();
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let finish: (value: unknown) => void = () => undefined;
  provider.establish = () => new Promise(resolve => { finish = resolve; });
  const second = createAdenaStore(() => provider);
  const connecting = second.connect();
  await flush();
  const refreshing = first.refresh();
  await flush();
  context.mock.timers.tick(10_000);
  await flush();
  assert.equal(first.getSnapshot().status, 'connected');
  assert.equal(provider.accountReads, 1);
  finish(ok({}));
  await Promise.all([connecting, refreshing]);
  assert.equal(first.getSnapshot().status, 'connected');
  assert.equal(second.getSnapshot().status, 'connected');
  assert.equal(provider.accountReads, 3);
});
