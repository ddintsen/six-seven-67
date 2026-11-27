// The robot's settings: the environment over the defaults production runs
// with. One copy for the Vercel Function (api.ts) and the shell (cli.ts).
import type { ListingWindow, RobotOptions } from './robot.ts';

// Gnome Tavern judging runs 18-21 December 2026. Matches whose trading ends
// from 21 December 00:00 UTC (Sunday night's NFL game, Monday's games) to
// 23 December 00:00 UTC are open through all of it.
export const JUDGING_WINDOW = { from: Date.UTC(2026, 11, 21) / 1000, to: Date.UTC(2026, 11, 23) / 1000 };

// A time as seconds since 1970, or as an ISO date.
export function timeOf(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const t = /^\d+$/.test(value) ? Number(value) : Date.parse(value) / 1000;
  return Number.isFinite(t) ? Math.floor(t) : fallback;
}

export function robotSettings(env: Record<string, string | undefined>) {
  const window: ListingWindow | null = env.ROBOT_WINDOW === 'off' ? null : {
    from: timeOf(env.ROBOT_WINDOW_FROM, JUDGING_WINDOW.from),
    to: timeOf(env.ROBOT_WINDOW_TO, JUDGING_WINDOW.to),
    max: Number(env.ROBOT_WINDOW_MAX || 4),
    reserveUgnot: BigInt(env.ROBOT_WINDOW_RESERVE_UGNOT || 8_000_000),
  };
  return {
    listPerRun: Number(env.ROBOT_LIST_PER_RUN || 2),
    listKinds: env.ROBOT_LIST_KINDS === 'all' ? 'all' : 'games',
    maxOpenListed: Number(env.ROBOT_MAX_OPEN || 6),
    reserveUgnot: BigInt(env.ROBOT_RESERVE_UGNOT || 3_000_000),
    minBalanceUgnot: BigInt(env.ROBOT_MIN_BALANCE_UGNOT || 8_000_000),
    liveMax: Number(env.ROBOT_LIVE_MAX || 1),
    window,
  } satisfies Partial<RobotOptions>;
}
