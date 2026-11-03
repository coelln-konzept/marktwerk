import { daysBetween } from "./calendar";

/*
 * How far a business date is from today, in the unit people say out loud (decision 2026-10-29, one
 * due vocabulary): "heute", "morgen", "gestern", "in 3 Tagen", "3 Tage überfällig", then weeks after
 * 14 days ("seit 6 Wochen") and months after 59 days. Pure calendar-day arithmetic, so DST cannot
 * shift it; callers pass Berlin dates.
 */

export type DayDistance =
  | { when: "today" }
  | { when: "future" | "past"; unit: "day" | "week" | "month"; count: number };

/** Up to this many days the distance is counted in days, then in weeks. */
export const DISTANCE_DAYS_MAX = 14;
/** Up to this many days the distance is counted in weeks, then in months. */
export const DISTANCE_WEEKS_MAX = 59;

export function dayDistance(date: string, today: string): DayDistance {
  const days = daysBetween(today, date);
  if (days === 0) return { when: "today" };
  const when = days > 0 ? "future" : "past";
  const abs = Math.abs(days);
  if (abs <= DISTANCE_DAYS_MAX) return { when, unit: "day", count: abs };
  if (abs <= DISTANCE_WEEKS_MAX) return { when, unit: "week", count: Math.floor(abs / 7) };
  return { when, unit: "month", count: Math.floor(abs / 30) };
}
