import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import { CHAIN } from '../live/config';
import WalletPanel from '../WalletPanel';

function WalletDialog(_props: object, ref: ForwardedRef<HTMLDialogElement>) {
  const close = () => (ref && 'current' in ref ? ref.current?.close() : undefined);
  return (
    <dialog ref={ref} className="dialog wallet-dialog" aria-labelledby="account-title">
      <div className="dialog-header">
        <h2 id="account-title">Wallet</h2>
        <button type="button" className="dialog-close" aria-label="Close wallet" onClick={close}>×</button>
      </div>
      <WalletPanel expectedChainId={CHAIN.chainId} />
      {CHAIN.faucetUrl && (
        <p className="wallet-faucet">New to {CHAIN.chainName}? Test GNOT is free from the <a className="text-link" href={CHAIN.faucetUrl} target="_blank" rel="noopener noreferrer">Gno faucet<span className="sr-only"> (opens in a new tab)</span></a></p>
      )}
    </dialog>
  );
}

export default forwardRef(WalletDialog);
