import { formatDay, formatDayTime, relativeTime } from '../ui/format.ts';

const percentFormat = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 2 });

export function freshnessText(quotedAt: number, midpoint: { ppm: number; observedAt: number } | null, yesLabel: string, now: number): string {
  const age = Math.max(0, now - quotedAt);
  const updated = age < 86_400 ? relativeTime(quotedAt, now) : `on ${formatDay(quotedAt)}`;
  const quote = `67 quote updated ${updated}.`;
  if (!midpoint) return quote;
  const percent = percentFormat.format(midpoint.ppm / 1_000_000);
  return `${quote} Polymarket reference for ${yesLabel} was ${percent} (checked ${formatDayTime(midpoint.observedAt)}).`;
}
