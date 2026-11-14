import { isIsoDate } from "../dates/calendar";

/**
 * The years a Termin can be planned in: last year (catching up on one that already took place) up to
 * five years ahead (multi-year agreements). A typo like 9999 or 0001 is caught at the field instead of
 * creating an event nobody finds again, and date arithmetic around it (± a week for the hints) never
 * leaves the four-digit years Postgres and `addDays` handle (UX-041).
 */
export const EVENT_YEARS_BACK = 1;
export const EVENT_YEARS_AHEAD = 5;

export type EventDateRange = {
  /** First allowed day, YYYY-01-01. */
  min: string;
  /** Last allowed day, YYYY-12-31. */
  max: string;
  minYear: number;
  maxYear: number;
};

/** The allowed range for `today` (a business date, YYYY-MM-DD). */
export function eventDateRange(today: string): EventDateRange {
  const year = Number(today.slice(0, 4));
  const minYear = year - EVENT_YEARS_BACK;
  const maxYear = year + EVENT_YEARS_AHEAD;
  return { min: `${minYear}-01-01`, max: `${maxYear}-12-31`, minYear, maxYear };
}

/** Whether `date` is a real calendar day inside `eventDateRange(today)`. */
export function isInEventDateRange(date: string, today: string): boolean {
  if (!isIsoDate(date)) return false;
  const { min, max } = eventDateRange(today);
  return date >= min && date <= max;
}

/**
 * `from`–`to` cut down to the allowed range (for look-ups around a typed date), or null when nothing of it
 * is left or a bound is not a date.
 */
export function clampToEventDateRange(
  from: string,
  to: string,
  today: string,
): { from: string; to: string } | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  const { min, max } = eventDateRange(today);
  const lo = from < min ? min : from;
  const hi = to > max ? max : to;
  return lo <= hi ? { from: lo, to: hi } : null;
}
