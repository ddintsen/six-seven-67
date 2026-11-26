// The market's own picture, as Polymarket shows it. The slot keeps its size
// while the picture loads or when there is none, so questions stay aligned.
import { useState } from 'react';

// On the67.click Vercel serves a resized copy (scripts/prepare-deploy.mjs);
// anywhere else, or if the resized copy fails, the original picture is used.
const resized = typeof location !== 'undefined' && /(^|\.)the67\.click$/.test(location.hostname);
const thumbnailUrl = (src: string, width: 96 | 160) => `/_vercel/image?url=${encodeURIComponent(src)}&w=${width}&q=70`;

export function MarketThumb({ src, size = 'row' }: { src: string | null; size?: 'row' | 'lead' | 'page' }) {
  // How many sources have failed for this picture: the resized copy, then the original.
  const [failed, setFailed] = useState<{ src: string; count: number } | null>(null);
  const px = size === 'row' ? 44 : size === 'lead' ? 72 : 64;
  const count = failed?.src === src ? failed.count : 0;
  const sources = src ? (resized ? [thumbnailUrl(src, size === 'row' ? 96 : 160), src] : [src]) : [];
  const current = sources[count];
  return (
    <span className={`market-thumb market-thumb-${size}`} aria-hidden="true">
      {src && current && (
        <img key={current} src={current} alt="" width={px} height={px} loading={size === 'row' ? 'lazy' : 'eager'} decoding="async"
          referrerPolicy="no-referrer" onError={() => setFailed({ src, count: count + 1 })} />
      )}
    </span>
  );
}
