import { useLayoutEffect, useRef } from 'react';
import { adenaActions, useAdenaWallet } from './adena';

export default function WalletPanel({ expectedChainId }: { expectedChainId?: string }) {
  const wallet = useAdenaWallet();
  const requiresReload = wallet.status === 'error' && wallet.code === 'RELOAD_REQUIRED';
  const sectionRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusOwner = useRef<HTMLButtonElement | null>(null);

  function act(control: HTMLButtonElement, action: () => void | Promise<void>) {
    focusOwner.current = document.hasFocus() && document.activeElement === control ? control : null;
    void action();
  }

  useLayoutEffect(() => {
    const dialog = sectionRef.current?.closest('dialog');
    function restoreFocus() {
      const previous = focusOwner.current;
      if (!previous) return;
      if (!sectionRef.current?.isConnected || (dialog && !dialog.open)) {
        focusOwner.current = null;
        return;
      }
      // Extension approval may temporarily own the window focus.
      if (!document.hasFocus()) return;
      const active = document.activeElement;
      const lostFocus = active === document.body && (!previous.isConnected || previous.disabled);
      if (active !== previous && !lostFocus) {
        focusOwner.current = null;
        return;
      }
      const destination = wallet.status === 'connecting' ? cancelRef.current : primaryRef.current;
      if (!destination || destination.disabled) return;
      focusOwner.current = wallet.status === 'connecting' ? destination : null;
      destination.focus({ preventScroll: true });
    }
    function releaseMovedFocus(event: FocusEvent) {
      if (focusOwner.current && event.target !== focusOwner.current) focusOwner.current = null;
    }
    function releaseClosedDialog() { focusOwner.current = null; }
    restoreFocus();
    window.addEventListener('focus', restoreFocus);
    document.addEventListener('focusin', releaseMovedFocus);
    dialog?.addEventListener('close', releaseClosedDialog);
    return () => {
      window.removeEventListener('focus', restoreFocus);
      document.removeEventListener('focusin', releaseMovedFocus);
      dialog?.removeEventListener('close', releaseClosedDialog);
    };
  }, [wallet]);

  return <section ref={sectionRef} className="adena-wallet" aria-labelledby="adena-title">
    <h3 id="adena-title">Adena wallet</h3>
    <p className="adena-connection-status" role="status" aria-atomic="true">{wallet.status === 'connected' ? `Connected to ${wallet.network.networkName}.${wallet.account.status === 'IN_ACTIVE' ? ' This account has not been used on this network yet.' : ''}` : ''}</p>
    {wallet.status === 'connected' ? <>
      <dl className="adena-account"><div><dt>Account</dt><dd className="adena-address">{wallet.account.address}</dd></div><div><dt>Network</dt><dd>{wallet.network.networkName} <span>({wallet.network.chainId})</span></dd></div><div><dt>Wallet balance</dt><dd className="adena-balance">{wallet.balanceGnot} <span>GNOT</span></dd></div></dl>
      {expectedChainId && wallet.network.chainId !== expectedChainId && <p className="adena-network-notice" role="status">67 is being prepared for {expectedChainId}. Switch networks in Adena to use that network.</p>}
      <p className="adena-note">Read-only connection. No transaction has been signed. This GNOT balance is separate from demo credits.</p>
      <div className="adena-actions"><button ref={primaryRef} className="button" onClick={event => act(event.currentTarget, adenaActions.refresh)}>Refresh account</button><button className="text-button" onClick={event => act(event.currentTarget, adenaActions.disconnect)}>Disconnect Adena</button></div>
    </> : <>
      <p role={wallet.status === 'error' ? 'alert' : 'status'}>{wallet.message}</p>
      {requiresReload ? <div className="adena-actions"><button ref={primaryRef} className="button primary" onClick={() => window.location.reload()}>Reload page</button></div> : wallet.status === 'unavailable' ? <div className="adena-actions"><a className="button primary" href="https://www.adena.app/" target="_blank" rel="noopener noreferrer">Get Adena</a><button ref={primaryRef} className="text-button" onClick={event => act(event.currentTarget, adenaActions.connect)}>Check again</button></div> : <div className="adena-actions"><button ref={primaryRef} className="button primary" disabled={wallet.status === 'connecting'} onClick={event => act(event.currentTarget, adenaActions.connect)}>{wallet.status === 'connecting' ? 'Waiting for Adena…' : wallet.status === 'error' ? 'Retry Adena connection' : 'Connect Adena'}</button>{wallet.status === 'connecting' && <button ref={cancelRef} className="text-button" onClick={event => act(event.currentTarget, adenaActions.disconnect)}>Cancel</button>}</div>}
      <p className="adena-note">Adena opens only when you connect. Your keys stay in the extension.</p>
    </>}
  </section>;
}
