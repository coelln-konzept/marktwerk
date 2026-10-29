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

/**
 * Permits whose next market is further out than this many months stay out of notifications and the
 * Übersicht (product owner, 2026-10-28). Measured from the market's first day, not the apply-by date.
 * Not used for the Genehmigungen badge and chip any more: since 2026-10-29 they count by apply-by date
 * within the permit horizon (`permitActionTier` in `permits/action.ts`).
 */
export const PERMIT_NOTIFY_MONTHS = 6;

/** Last day (inclusive) a market may start on for its permits to notify: today + 6 months, clamped. */
export function permitNotifyEnd(today: string): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const months = m - 1 + PERMIT_NOTIFY_MONTHS;
  const year = y + Math.floor(months / 12);
  const month = (months % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

/**
 * Whether a permit may notify: its next market starts within 6 months. A permit no market needs
 * (`nextMarketOn` null) is not held back.
 */
export function isPermitMarketInReach(nextMarketOn: string | null, today: string): boolean {
  return nextMarketOn === null || nextMarketOn <= permitNotifyEnd(today);
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
