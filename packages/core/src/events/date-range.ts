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
 * The days a look-up of existing events may span: four-digit years with room for the ± a week the hints
 * add, so "9999-12-31" + 7 days never reaches year 10000, which Postgres rejects (UX-041). Wider than
 * `eventDateRange` on purpose: "Markt planen" and agreements generate dates outside the plannable
 * years, and their hints must still see what is there.
 */
export const LOOKUP_DATE_RANGE = { min: "1000-01-01", max: "9998-12-31" } as const;

/**
 * `from`–`to` cut down to `LOOKUP_DATE_RANGE`, or null when nothing of it is left or a bound is not a
 * date.
 */
export function clampToLookupRange(from: string, to: string): { from: string; to: string } | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  const { min, max } = LOOKUP_DATE_RANGE;
  const lo = from < min ? min : from;
  const hi = to > max ? max : to;
  return lo <= hi ? { from: lo, to: hi } : null;
}
