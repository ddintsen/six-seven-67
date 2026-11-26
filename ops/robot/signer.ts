// Signs the robot's calls with its own key, held only in memory: the mnemonic
// comes from the environment (Vercel's encrypted variables, or a shell for a
// local node) and is never written anywhere.
import { GnoJSONRPCProvider, GnoWallet } from '@gnolang/gno-js-client';
import { TransactionEndpoint } from '@gnolang/tm2-js-client';
import type { Signer } from './robot.ts';

export async function walletSigner(rpc: string, mnemonic: string): Promise<Signer> {
  const provider = await GnoJSONRPCProvider.create(rpc);
  const wallet = await GnoWallet.fromMnemonic(mnemonic.trim());
  wallet.connect(provider);
  const address = await wallet.getAddress();
  // The chain's minimum price is a fraction of a ugnot per unit of gas; pay it with a margin.
  const price = await wallet.getGasPrice().catch(() => null);
  const perGas = price && Number(price.gas) > 0 ? Number(price.amount) / Number(price.gas) : 0.001;
  return {
    address,
    balance: async () => BigInt(await wallet.getBalance('ugnot').catch(() => 0)),
    call: async (realm, func, args, options = {}) => {
      const gas = options.gas ?? 10_000_000;
      const fee = Math.max(1, Math.ceil(gas * perGas * 1.5));
      const funds = options.sendUgnot ? new Map([['ugnot', Number(options.sendUgnot)]]) : undefined;
      const result = await wallet.callMethod(realm, func, args, TransactionEndpoint.BROADCAST_TX_COMMIT, funds, undefined, { gas_wanted: BigInt(gas), gas_fee: `${fee}ugnot` });
      const r = result as { hash?: string; check_tx?: { ResponseBase?: { Error?: unknown; Log?: string } }; deliver_tx?: { ResponseBase?: { Error?: unknown; Log?: string } } };
      const failed = r.check_tx?.ResponseBase?.Error || r.deliver_tx?.ResponseBase?.Error;
      if (failed) throw new Error((r.deliver_tx?.ResponseBase?.Log || r.check_tx?.ResponseBase?.Log || 'transaction failed').split('\n').slice(0, 3).join(' '));
      return String(r.hash ?? '');
    },
    send: async (to, ugnot) => {
      const gas = 5_000_000;
      const fee = Math.max(1, Math.ceil(gas * perGas * 1.5));
      const result = await wallet.transferFunds(to, new Map([['ugnot', Number(ugnot)]]), TransactionEndpoint.BROADCAST_TX_COMMIT, { gas_wanted: BigInt(gas), gas_fee: `${fee}ugnot` });
      const r = result as { hash?: string; check_tx?: { ResponseBase?: { Error?: unknown; Log?: string } }; deliver_tx?: { ResponseBase?: { Error?: unknown; Log?: string } } };
      if (r.check_tx?.ResponseBase?.Error || r.deliver_tx?.ResponseBase?.Error) throw new Error((r.deliver_tx?.ResponseBase?.Log || r.check_tx?.ResponseBase?.Log || 'transfer failed').split('\n').slice(0, 3).join(' '));
      return String(r.hash ?? '');
    },
  };
}
