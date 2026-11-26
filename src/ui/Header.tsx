import { useEffect, useRef } from 'react';
import type { AdenaState } from '../adena';
import { CHAIN } from '../live/config';
import { BrandMark } from '../brand/BrandMark';

export type Section = 'home' | 'how' | 'contract' | 'markets' | 'portfolio' | 'market' | 'other';

interface Props {
  marketsHref: string;
  active: Section;
  route: string;
  wallet: AdenaState;
  onOpenWallet: () => void;
}

function shortAddress(address: string) { return `${address.slice(0, 5)}…${address.slice(-4)}`; }

// The mark sits in the middle like the fulcrum of a balance: the site on one
// side, the exchange and the wallet on the other. Below 1024px both sides
// fold into one menu sheet.
export default function Header({ marketsHref, active, route, wallet, onOpenWallet }: Props) {
  const menu = useRef<HTMLDialogElement>(null);
  const connected = wallet.status === 'connected';
  const wrongNetwork = connected && wallet.network.chainId !== CHAIN.chainId;
  const current = (section: Section) => (active === section ? 'page' as const : undefined);

  // Any navigation closes the sheet.
  useEffect(() => { if (menu.current?.open) menu.current.close(); }, [route]);

  const links: { href: string; label: string; section: Section; note: string }[] = [
    { href: marketsHref, label: 'Markets', section: 'markets', note: CHAIN.chainName },
    { href: '#/portfolio', label: 'Portfolio', section: 'portfolio', note: 'Positions and claims' },
    { href: '#/how', label: 'How it works', section: 'how', note: 'Prices, collateral, results' },
    { href: '#/contract', label: 'Contract', section: 'contract', note: 'Every rule, on chain' },
  ];

  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="About 67">
        <a href="#/how" aria-current={current('how')}>How it works</a>
        <a href="#/contract" aria-current={current('contract')}>Contract</a>
      </nav>
      <a className="brand" href="#/" aria-label="67 home" aria-current={current('home')}><BrandMark /></a>
      <div className="header-end">
        <nav className="primary-nav" aria-label="Main navigation">
          <a href={marketsHref} aria-current={active === 'markets' || active === 'market' ? 'page' : undefined}>Markets</a>
          <a href="#/portfolio" aria-current={current('portfolio')}>Portfolio</a>
        </nav>
        <div className="wallet-actions">
          {connected && !wrongNetwork && (
            <button type="button" className="balance-button" onClick={onOpenWallet} aria-label={`${wallet.balanceGnot} GNOT in Adena`}>{wallet.balanceGnot} GNOT</button>
          )}
          <button type="button" className={`wallet-button${connected ? '' : ' primary'}${wrongNetwork ? ' caution' : ''}`}
            aria-label={connected ? (wrongNetwork ? `Adena is on ${wallet.network.chainId}. Open wallet` : 'Open Adena wallet') : 'Connect Adena'}
            onClick={onOpenWallet}>
            {connected ? (wrongNetwork ? 'Wrong network' : <><span className="label-long">{shortAddress(wallet.account.address)}</span><span className="label-short">…{wallet.account.address.slice(-4)}</span></>) : <><span className="label-long">Connect Adena</span><span className="label-short">Connect</span></>}
          </button>
          <button type="button" className="menu-button" aria-haspopup="dialog" onClick={() => menu.current?.showModal()}>Menu</button>
        </div>
      </div>

      <dialog ref={menu} className="menu-sheet" aria-label="Menu">
        <div className="menu-inner">
          <div className="menu-top">
            <a href="#/" aria-label="67 home" onClick={() => menu.current?.close()}><BrandMark /></a>
            <button type="button" className="menu-button" onClick={() => menu.current?.close()}>Close</button>
          </div>
          <nav className="menu-links" aria-label="Menu links">
            {links.map(link => (
              <a key={link.section} href={link.href} aria-current={active === link.section || (link.section === 'markets' && active === 'market') ? 'page' : undefined}
                onClick={() => menu.current?.close()}>
                {link.label}<span>{link.note}</span>
              </a>
            ))}
          </nav>
          <div className="menu-foot">
            <p>Every trade is a real transaction on {CHAIN.chainName}, paid in test GNOT through Adena.</p>
          </div>
        </div>
      </dialog>
    </header>
  );
}
