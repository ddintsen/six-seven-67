import { CHAIN } from '../live/config';
import type { ChainStatus } from '../live/gno';
import { BrandMark } from '../brand/BrandMark';

export default function Footer({ chain }: { chain: ChainStatus | null }) {
  return (
    <footer className="site-footer">
      <a className="footer-mark" href="#/" aria-label="67 home"><BrandMark /></a>
      <div className="footer-columns">
        <div>
          <h2>Exchange</h2>
          <a href="#/markets">Markets</a>
          <a href="#/portfolio">Portfolio</a>
        </div>
        <div>
          <h2>Read</h2>
          <a href="#/how">How it works</a>
          <a href="#/contract">Contract</a>
          <a href="#/status">Status</a>
        </div>
        <div>
          <h2>Elsewhere</h2>
          <a href="https://gno.land" target="_blank" rel="noopener noreferrer">Built on Gno.land<span className="sr-only"> (opens in a new tab)</span></a>
          {CHAIN.explorerUrl && <a href={`${CHAIN.explorerUrl}/${CHAIN.realm.replace(/^gno\.land\//, '').replace(/\/markets$/, '/home')}`} target="_blank" rel="noopener noreferrer">67 on gno.land<span className="sr-only"> (opens in a new tab)</span></a>}
          {CHAIN.faucetUrl && <a href={CHAIN.faucetUrl} target="_blank" rel="noopener noreferrer">Test GNOT faucet<span className="sr-only"> (opens in a new tab)</span></a>}
        </div>
      </div>
      <div className="footer-fine">
        <p>Independent project. Not affiliated with Polymarket or Gno.land. Test GNOT has no value.</p>
        <p className="footer-status">{chain ? `${CHAIN.chainName}, block ${chain.height.toLocaleString('en-US')}` : CHAIN.chainName}</p>
      </div>
    </footer>
  );
}
