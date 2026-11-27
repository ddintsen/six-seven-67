// Signs the robot's calls with its own key, held only in memory: the mnemonic
// comes from the environment (Vercel's encrypted variables, or a shell for a
// local node) and is never written anywhere.
//
// Gas: every transaction is simulated first (`.app/simulate`) and then sent
// with the gas the simulation used plus a margin, not a fixed allowance. The
// fee is the gas wanted times the chain's price, paid whatever the call really
// uses, so the fixed allowances of October (25 million for a quote that uses
// about 5.5 million) cost the robot four to five times what it needed. A call
// the realm would refuse fails in the simulation and is never sent, so it
// costs nothing.
import { decodeTxMessages, GnoJSONRPCProvider, GnoWallet, MsgCall, MsgSend } from '@gnolang/gno-js-client';
import { TM2Error, TransactionEndpoint, type Tx } from '@gnolang/tm2-js-client';
import type { Signer } from './robot.ts';

// The gas a simulation used, plus a fifth and half a million for state that
// moves between the simulation and the block; never above 100 million.
export function gasWanted(simulatedGas: number): number {
  return Math.min(100_000_000, Math.ceil(simulatedGas * 1.2) + 500_000);
}

// The fee for that much gas at the chain's price, with half again as margin in
// case the price moves between the read and the block.
export function feeUgnot(gas: number, ugnotPerGas: number): number {
  return Math.max(1, Math.ceil(gas * ugnotPerGas * 1.5));
}

// The chain's minimum price per unit of gas; Onyx charges 1 ugnot per 1,000.
export function ugnotPerGas(price: { amount?: unknown; gas?: unknown } | null | undefined): number {
  const amount = Number(price?.amount);
  const gas = Number(price?.gas);
  return Number.isFinite(amount) && Number.isFinite(gas) && amount > 0 && gas > 0 ? amount / gas : 0.001;
}

// Used when the simulation endpoint itself is unreachable: the most gas each
// call used on Onyx in October, with half again as headroom.
export const FALLBACK_GAS: Record<string, number> = {
  AcceptRole: 6_000_000, AcceptAdministrator: 5_000_000, ProposeOutcome: 9_000_000, Finalize: 9_000_000, Pause: 9_000_000,
  SetQuote: 13_500_000, WithdrawSurplus: 10_000_000, CreateMarket: 20_000_000, Fund: 9_000_000, send: 2_000_000,
};

type Message = Tx['messages'][number];
type Broadcast = { hash?: string; check_tx?: { ResponseBase?: { Error?: unknown; Log?: string } }; deliver_tx?: { ResponseBase?: { Error?: unknown; Log?: string } } };
const short = (text: string) => text.split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 300);

export async function walletSigner(rpc: string, mnemonic: string): Promise<Signer> {
  const provider = await GnoJSONRPCProvider.create(rpc);
  const wallet = await GnoWallet.fromMnemonic(mnemonic.trim());
  wallet.connect(provider);
  const address = await wallet.getAddress();
  const perGas = ugnotPerGas(await wallet.getGasPrice().catch(() => null));
  const draft = (message: Message, gas: number): Tx => ({ messages: [message], fee: { gas_wanted: BigInt(gas), gas_fee: `${feeUgnot(gas, perGas)}ugnot` }, memo: '', signatures: [] });

  async function submit(message: Message, fallbackGas: number, what: string): Promise<string> {
    // One account read per transaction; both signatures below use the same sequence.
    const account = { accountNumber: String(await wallet.getAccountNumber()), sequence: String(await wallet.getAccountSequence()) };
    let gas = fallbackGas;
    try {
      const probe = await wallet.signTransaction(draft(message, fallbackGas), decodeTxMessages, account);
      gas = gasWanted(Number(await wallet.estimateGas(probe)));
    } catch (error) {
      // The chain answered and refused: sending would fail the same way and still cost the fee.
      if (error instanceof TM2Error) throw new Error(`${what} refused in simulation: ${short(error.log || error.message)}`);
      // The simulation itself could not be reached: send with the fixed allowance.
    }
    const signed = await wallet.signTransaction(draft(message, gas), decodeTxMessages, account);
    const result = await wallet.sendTransaction(signed, TransactionEndpoint.BROADCAST_TX_COMMIT) as Broadcast;
    if (result.check_tx?.ResponseBase?.Error || result.deliver_tx?.ResponseBase?.Error) {
      throw new Error(short(result.deliver_tx?.ResponseBase?.Log || result.check_tx?.ResponseBase?.Log || `${what} failed`));
    }
    return String(result.hash ?? '');
  }

  return {
    address,
    balance: async () => BigInt(await wallet.getBalance('ugnot').catch(() => 0)),
    call: async (realm, func, args, options = {}) => {
      const value = MsgCall.encode({ caller: address, send: options.sendUgnot ? `${options.sendUgnot}ugnot` : '', max_deposit: '', pkg_path: realm, func, args }).finish();
      return submit({ type_url: '/vm.m_call', value }, options.gas ?? FALLBACK_GAS[func] ?? 10_000_000, func);
    },
    send: async (to, ugnot) => {
      const value = MsgSend.encode({ from_address: address, to_address: to, amount: `${ugnot}ugnot` }).finish();
      return submit({ type_url: '/bank.MsgSend', value }, FALLBACK_GAS.send, 'transfer');
    },
  };
}
