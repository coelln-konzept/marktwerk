import { addDays, daysBetween } from "../dates/calendar";

/**
 * How early permits show up on the Übersicht: this many days before the date to act on (apply-by, or the
 * expected decision once filed). Company setting `permit_horizon_days`; tasks, instalments etc. keep
 * their own fixed 7-day horizon.
 */
export const PERMIT_HORIZON_MIN_DAYS = 7;
export const PERMIT_HORIZON_MAX_DAYS = 180;
export const PERMIT_HORIZON_DEFAULT_DAYS = 30;
/** Within this many days a due item is "Diese Woche" (soon); further out permits are "upcoming". */
export const SOON_DAYS = 7;

export function isValidPermitHorizonDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= PERMIT_HORIZON_MIN_DAYS &&
    value <= PERMIT_HORIZON_MAX_DAYS
  );
}

/** Last day (inclusive) a permit with that horizon is still listed. */
export function permitHorizonEnd(today: string, horizonDays: number): string {
  return addDays(today, Math.max(horizonDays, SOON_DAYS));
}

/**
 * Urgency of a permit's due date: overdue / today / soon (≤ 7 days) / upcoming (8 days up to the horizon),
 * null beyond the horizon.
 */
export function permitUrgency(
  dueOn: string,
  today: string,
  horizonDays: number,
): "overdue" | "today" | "soon" | "upcoming" | null {
  const days = daysBetween(today, dueOn);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= SOON_DAYS) return "soon";
  return days <= horizonDays ? "upcoming" : null;
}
