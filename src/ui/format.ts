const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

export const formatDay = (unixSeconds: number) => day.format(new Date(unixSeconds * 1000));
export const formatDayTime = (unixSeconds: number) => `${dayTime.format(new Date(unixSeconds * 1000))} UTC`;
export const formatClock = (unixSeconds: number) => clock.format(new Date(unixSeconds * 1000));

// Prices are per one-unit payout. Show two decimals, more only when the
// published quote carries more precision, so a price is never rounded away.
export function formatPrice(price: number): string {
  const exact = Math.round(price * 1e6) / 1e6;
  for (const digits of [2, 3, 4, 5, 6]) {
    if (Math.abs(Number(exact.toFixed(digits)) - exact) < 1e-9) return exact.toFixed(digits);
  }
  return exact.toFixed(6);
}

export function relativeTime(unixSeconds: number, now = Date.now() / 1000): string {
  const delta = Math.max(0, now - unixSeconds);
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} h ago`;
  return formatDay(unixSeconds);
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 5)}…${address.slice(-4)}` : address;
}
