import { useEffect, useSyncExternalStore } from 'react';

export interface AdenaAccount {
  address: string;
  coins: string;
  chainId: string;
  accountNumber: string;
  sequence: string;
  status: 'ACTIVE' | 'IN_ACTIVE';
}
export interface AdenaNetwork {
  chainId: string;
  networkName: string;
  addressPrefix: string;
  rpcUrl: string;
  indexerUrl: string | null;
}
export type AdenaState =
  | { status: 'unavailable' | 'disconnected' | 'connecting'; message: string }
  | { status: 'error'; message: string; code: string }
  | { status: 'connected'; account: AdenaAccount; network: AdenaNetwork; balanceGnot: string };

// The extension is an untrusted boundary: validate responses before using their data.
export interface AdenaProvider {
  AddEstablish: (applicationName: string) => Promise<unknown>;
  GetAccount: () => Promise<unknown>;
  GetNetwork: () => Promise<unknown>;
  On: (event: 'changedAccount' | 'changedNetwork', listener: (payload: string) => void) => void;
  DoContract?: (request: { messages: { type: string; value: Record<string, unknown> }[]; memo?: string }) => Promise<unknown>;
  SwitchNetwork?: (chainId: string) => Promise<unknown>;
  AddNetwork?: (network: { chainId: string; chainName: string; rpcUrl: string }) => Promise<unknown>;
}

// A contract call request. send is an exact ugnot amount or empty.
export interface ContractCall { pkgPath: string; func: string; args: string[]; sendUgnot: bigint }
// sent: Adena reports the transaction committed in a block (hash/height).
// broadcast: accepted by the mempool only; inclusion must be reconciled.
// unknown: no answer; the outcome must be reconciled against chain state.
export type CallResult =
  | { status: 'sent'; hash: string; height: number }
  | { status: 'broadcast'; hash: string | null }
  | { status: 'rejected' }
  | { status: 'failed'; code: string; message: string; chainLog: string }
  | { status: 'unknown'; message: string };
declare global { interface Window { adena?: AdenaProvider } }
interface Response { code: number; type: string; status: 'success' | 'failure'; data: unknown }
class WalletError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function response(value: unknown): Response {
  if (!record(value) || typeof value.code !== 'number' || !Number.isInteger(value.code) || typeof value.type !== 'string' || !value.type || (value.status !== 'success' && value.status !== 'failure')) throw new WalletError('INVALID_RESPONSE', 'Adena returned an unsupported response. Update the extension and retry.');
  return { code: value.code, type: value.type, status: value.status, data: value.data };
}
function requireSuccess(value: unknown): unknown {
  const result = response(value);
  if (result.status !== 'success') throw failure(result.type);
  return result.data;
}
function failure(code: string): WalletError {
  if (/REJECT|DENIED|CANCEL/i.test(code)) return new WalletError(code, 'Connection was declined in Adena. Retry when you are ready.');
  if (/LOCK|INACTIVE|IN_ACTIVE|ACCOUNT/i.test(code)) return new WalletError(code, 'Unlock Adena and select an active account, then retry.');
  return new WalletError(code, 'Adena could not read your account. Open the extension, check its network, and retry.');
}
function textField(data: Record<string, unknown>, key: string, allowEmpty = false): string {
  const value = data[key];
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new WalletError('INVALID_RESPONSE', `Adena returned invalid ${key} data. Update the extension and retry.`);
  return value;
}
function integerField(data: Record<string, unknown>, key: string): string {
  const value = textField(data, key);
  if (!/^\d+$/.test(value)) throw new WalletError('INVALID_RESPONSE', `Adena returned invalid ${key} data. Update the extension and retry.`);
  return value;
}
function accountData(value: unknown): AdenaAccount {
  if (!record(value)) throw new WalletError('INVALID_RESPONSE', 'Adena returned no account data. Unlock the extension and retry.');
  const status = value.status;
  if (status !== 'ACTIVE' && status !== 'IN_ACTIVE') throw new WalletError('INVALID_RESPONSE', 'Adena returned an unsupported account status. Update the extension and retry.');
  return { address: textField(value, 'address'), coins: textField(value, 'coins', true), chainId: textField(value, 'chainId'), accountNumber: integerField(value, 'accountNumber'), sequence: integerField(value, 'sequence'), status };
}
function networkData(value: unknown): AdenaNetwork {
  if (!record(value)) throw new WalletError('INVALID_RESPONSE', 'Adena returned no network data. Check the extension and retry.');
  const network = { chainId: textField(value, 'chainId'), networkName: textField(value, 'networkName'), addressPrefix: textField(value, 'addressPrefix'), rpcUrl: textField(value, 'rpcUrl'), indexerUrl: value.indexerUrl == null ? null : textField(value, 'indexerUrl', true) };
  try { if (!['http:', 'https:'].includes(new URL(network.rpcUrl).protocol)) throw new Error(); }
  catch { throw new WalletError('INVALID_RESPONSE', 'Adena returned an invalid network endpoint. Select another network and retry.'); }
  return network;
}
export function formatGnot(coins: string): string {
  let ugnot = 0n;
  const seen = new Set<string>();
  for (const coin of coins ? coins.split(',') : []) {
    const match = /^(\d+)([a-zA-Z][a-zA-Z0-9/:._-]*)$/.exec(coin.trim());
    if (!match || seen.has(match[2])) throw new WalletError('INVALID_BALANCE', 'Adena returned an invalid coin balance. Refresh the account to retry.');
    seen.add(match[2]);
    if (match[2] === 'ugnot') ugnot = BigInt(match[1]);
  }
  const fraction = (ugnot % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${ugnot / 1_000_000n}${fraction ? `.${fraction}` : ''}`;
}
function providerFromWindow(): AdenaProvider | undefined { return typeof window === 'undefined' ? undefined : window.adena; }
function validProvider(value: AdenaProvider | undefined): value is AdenaProvider {
  return !!value && ['AddEstablish', 'GetAccount', 'GetNetwork', 'On'].every(key => typeof (value as unknown as Record<string, unknown>)[key] === 'function');
}
// A timed-out request can still own the extension's single resolver. Only a page
// reload resets that executor; a local disconnect or late response cannot do so.
const blockedProviders = new WeakSet<AdenaProvider>();
function reloadRequired() { return new WalletError('RELOAD_REQUIRED', 'Adena did not respond. Reload this page to reconnect safely.'); }
function withTimeout<T>(promise: Promise<T>, milliseconds: number, provider: AdenaProvider): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { blockedProviders.add(provider); reject(reloadRequired()); }, milliseconds);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
// Adena exposes On but no Off. Register one listener per provider/event and fan out locally.
const providerListeners = new WeakMap<AdenaProvider, Set<() => void>>();
// The injected executor owns one request resolver, so even read calls must be serialized.
const providerQueues = new WeakMap<AdenaProvider, Promise<unknown>>();
function providerCall(provider: AdenaProvider, operation: () => Promise<unknown>, milliseconds: number): Promise<unknown> {
  if (blockedProviders.has(provider)) return Promise.reject(reloadRequired());
  const pending = (providerQueues.get(provider) ?? Promise.resolve()).then(() => {
    if (blockedProviders.has(provider)) throw reloadRequired();
    // Waiting in the queue is not extension response time. Start the deadline
    // only when dispatched, and refuse every queued call after a timeout.
    return withTimeout(operation(), milliseconds, provider);
  });
  providerQueues.set(provider, pending.catch(() => undefined));
  return pending;
}
function watch(provider: AdenaProvider, listener: () => void) {
  let listeners = providerListeners.get(provider);
  if (!listeners) {
    listeners = new Set();
    providerListeners.set(provider, listeners);
    const notify = () => providerListeners.get(provider)?.forEach(callback => callback());
    provider.On('changedAccount', notify);
    provider.On('changedNetwork', notify);
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function chainLogOf(value: Record<string, unknown>): string {
  const parts: string[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 4 || parts.length > 8) return;
    if (typeof node === 'string') { if (node.length < 4000) parts.push(node); return; }
    if (node && typeof node === 'object') Object.values(node as Record<string, unknown>).forEach(child => visit(child, depth + 1));
  };
  visit(value.message, 0);
  visit(value.data, 0);
  return parts.join('\n');
}

export function interpretCallResponse(value: unknown): CallResult {
  if (!record(value) || typeof value.type !== 'string' || (value.status !== 'success' && value.status !== 'failure')) {
    return { status: 'unknown', message: 'Adena returned an unsupported transaction response. Check your positions before trying again.' };
  }
  if (value.status === 'success') {
    const data = record(value.data) ? value.data : {};
    const hash = typeof data.hash === 'string' && data.hash ? data.hash : null;
    const height = Number(data.height);
    if (value.type === 'TRANSACTION_SENT' && hash && Number.isSafeInteger(height) && height > 0) return { status: 'sent', hash, height };
    return { status: 'broadcast', hash };
  }
  if (/REJECT/i.test(value.type)) return { status: 'rejected' };
  const chainLog = chainLogOf(value);
  const known: Record<string, string> = {
    NOT_CONNECTED: 'Adena is not connected to 67. Connect again, then retry.',
    UNRESOLVED_TRANSACTION_EXISTS: 'Another Adena approval is still open. Finish or reject it, then retry.',
    WALLET_LOCKED: 'Adena is locked. Unlock it, then retry.',
    ACCOUNT_MISMATCH: 'The selected Adena account changed. Refresh the wallet, then review again.',
    NO_ACCOUNT: 'Adena has no account. Create or restore one, then retry.',
    NETWORK_TIMEOUT: 'The network did not confirm in time. Check your position before trying again.',
  };
  return { status: 'failed', code: value.type, message: known[value.type] ?? 'The transaction was not executed.', chainLog };
}

export function createAdenaStore(getProvider: () => AdenaProvider | undefined = providerFromWindow) {
  let state: AdenaState = validProvider(getProvider()) ? { status: 'disconnected', message: 'Connect your Adena account.' } : { status: 'unavailable', message: 'Adena is not available in this browser.' };
  const listeners = new Set<() => void>();
  let generation = 0;
  let connected = false;
  let provider: AdenaProvider | undefined;
  let unwatch: (() => void) | undefined;
  let mountCount = 0;
  let stopLifecycle: (() => void) | undefined;
  function publish(next: AdenaState) { state = next; listeners.forEach(listener => listener()); }
  function showError(error: unknown) { publish({ status: 'error', code: error instanceof WalletError ? error.code : 'PROVIDER_ERROR', message: error instanceof WalletError ? error.message : 'Could not reach Adena. Open the extension and retry.' }); }
  async function read(request: number, source: AdenaProvider) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const rawAccount = await providerCall(source, () => source.GetAccount(), 10_000);
      if (request !== generation || !connected) return;
      const rawNetwork = await providerCall(source, () => source.GetNetwork(), 10_000);
      if (request !== generation || !connected) return;
      const account = accountData(requireSuccess(rawAccount));
      const network = networkData(requireSuccess(rawNetwork));
      // A network change may occur between the two reads. Retry once, never combine chains.
      if (account.chainId !== network.chainId) {
        if (attempt === 0) continue;
        throw new WalletError('NETWORK_CHANGED', 'The wallet network changed while loading. Refresh to read the current account.');
      }
      if (!account.address.startsWith(`${network.addressPrefix}1`)) throw new WalletError('INVALID_ADDRESS', 'The account address does not match the wallet network. Select an account and retry.');
      publish({ status: 'connected', account, network, balanceGnot: formatGnot(account.coins) });
      return;
    }
  }
  async function refresh() {
    if (!connected || !provider) {
      if (state.status === 'unavailable' && validProvider(getProvider())) publish({ status: 'disconnected', message: 'Adena is available. Connect your account.' });
      return;
    }
    const request = ++generation;
    try { await read(request, provider); } catch (error) { if (request === generation && connected) showError(error); }
  }
  async function connect() {
    if (state.status === 'connecting') return;
    const candidate = getProvider();
    const request = ++generation;
    connected = false;
    unwatch?.(); unwatch = undefined;
    if (!validProvider(candidate)) { publish({ status: 'unavailable', message: 'Install Adena, then reload this page to connect.' }); return; }
    provider = candidate;
    if (blockedProviders.has(candidate)) { showError(reloadRequired()); return; }
    publish({ status: 'connecting', message: 'Approve the connection in Adena.' });
    try {
      const established = response(await providerCall(candidate, () => candidate.AddEstablish('67'), 35_000));
      if (request !== generation) return;
      if (established.status !== 'success' && established.type !== 'ALREADY_CONNECTED') throw failure(established.type);
      connected = true;
      unwatch = watch(candidate, () => { if (connected) void refresh(); });
      await read(request, candidate);
    } catch (error) {
      if (request === generation) showError(error);
    }
  }
  function disconnect() {
    generation++;
    connected = false;
    unwatch?.(); unwatch = undefined;
    provider = undefined;
    publish({ status: 'disconnected', message: 'Disconnected from 67. You can revoke site access in Adena.' });
  }
  function mount() {
    if (state.status === 'unavailable' && validProvider(getProvider())) publish({ status: 'disconnected', message: 'Connect your Adena account.' });
    if (typeof window === 'undefined') return () => undefined;
    if (mountCount++ === 0) {
      const onFocus = () => { if (connected) void refresh(); };
      const onVisible = () => { if (document.visibilityState === 'visible') onFocus(); };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisible);
      stopLifecycle = () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
    }
    return () => { if (--mountCount === 0) { stopLifecycle?.(); stopLifecycle = undefined; } };
  }
  // Sends one contract call through Adena. Approval may take as long as the
  // person needs; a missing answer is an unknown outcome, never a failure.
  // Several calls go in one transaction: Adena shows them together, one
  // signature approves them, and the chain applies all of them or none.
  async function call(request: ContractCall | ContractCall[]): Promise<CallResult> {
    if (state.status !== 'connected' || !provider || !connected) return { status: 'failed', code: 'NOT_CONNECTED', message: 'Connect Adena before trading.', chainLog: '' };
    const source = provider;
    if (typeof source.DoContract !== 'function') return { status: 'failed', code: 'UNSUPPORTED', message: 'This Adena version cannot send contract calls. Update the extension.', chainLog: '' };
    const caller = state.account.address;
    const requests = Array.isArray(request) ? request : [request];
    if (requests.length === 0) return { status: 'failed', code: 'EMPTY', message: 'Nothing to send.', chainLog: '' };
    const messages = requests.map(item => ({ type: '/vm.m_call', value: { caller, send: item.sendUgnot > 0n ? `${item.sendUgnot}ugnot` : '', pkg_path: item.pkgPath, func: item.func, args: item.args } }));
    try {
      const raw = await providerCall(source, () => source.DoContract!({ messages, memo: '67' }), 180_000);
      const result = interpretCallResponse(raw);
      void refresh();
      return result;
    } catch (error) {
      if (error instanceof WalletError && error.code === 'RELOAD_REQUIRED') {
        showError(error);
        return { status: 'unknown', message: 'Adena did not answer. Reload the page, then check your position before trying again.' };
      }
      return { status: 'unknown', message: 'Adena did not confirm the result. Check your position before trying again.' };
    }
  }
  async function switchNetwork(target: { chainId: string; chainName: string; rpcUrl: string }): Promise<'switched' | 'rejected' | 'failed'> {
    const source = provider;
    if (!source || !connected || typeof source.SwitchNetwork !== 'function') return 'failed';
    try {
      let result = response(await providerCall(source, () => source.SwitchNetwork!(target.chainId), 60_000));
      if (result.status !== 'success' && /UNADDED|NOT_INITIALIZED/i.test(result.type) && typeof source.AddNetwork === 'function') {
        const added = response(await providerCall(source, () => source.AddNetwork!(target), 60_000));
        if (added.status !== 'success' && !/ALREADY_EXISTS/i.test(added.type)) return /REJECT/i.test(added.type) ? 'rejected' : 'failed';
        result = response(await providerCall(source, () => source.SwitchNetwork!(target.chainId), 60_000));
      }
      await refresh();
      if (result.status === 'success' || /REDUNDANT/i.test(result.type)) return 'switched';
      return /REJECT/i.test(result.type) ? 'rejected' : 'failed';
    } catch (error) {
      if (error instanceof WalletError && error.code === 'RELOAD_REQUIRED') showError(error);
      return 'failed';
    }
  }
  return { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, connect, refresh, disconnect, mount, call, switchNetwork };
}
const wallet = createAdenaStore();
export const adenaActions = { connect: wallet.connect, refresh: wallet.refresh, disconnect: wallet.disconnect, call: wallet.call, switchNetwork: wallet.switchNetwork };
export function useAdenaWallet(): AdenaState {
  useEffect(wallet.mount, []);
  return useSyncExternalStore(wallet.subscribe, wallet.getSnapshot, wallet.getSnapshot);
}
