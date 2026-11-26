// One sentence under a market's price: when 67 last set it and, when
// Polymarket is elsewhere now, where Polymarket is. 67's quote is a fixed price
// that holds until the next one, so a visitor should never take it for a live
// feed.
import { formatDay, relativeTime } from '../ui/format.ts';

// Under two points the quote reads as in line with Polymarket; the robot
// requotes v2 markets from one point.
export const IN_LINE_PPM = 20_000;

export function freshnessText(quotedAt: number, yesPricePpm: number, midYesPpm: number | null, yesLabel: string, now: number): string {
  const age = Math.max(0, now - quotedAt);
  const updated = age < 86_400 ? `Updated ${relativeTime(quotedAt, now)}` : `Updated on ${formatDay(quotedAt)}`;
  if (midYesPpm == null) return `${updated}.`;
  if (Math.abs(midYesPpm - yesPricePpm) < IN_LINE_PPM) return `${updated}, in line with Polymarket.`;
  const percent = Math.round(midYesPpm / 10_000);
  return yesLabel === 'Yes'
    ? `${updated}. Polymarket is at ${percent}% now.`
    : `${updated}. Polymarket has ${yesLabel} at ${percent}% now.`;
}
