/*
 * Pure calendar arithmetic on business dates ("YYYY-MM-DD", Europe/Berlin calendar days).
 * Runs in UTC internally, so results never depend on the machine's time zone or DST.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function toUtcMs(date: string): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  // Reject 2026-02-30 and friends instead of silently rolling over.
  const check = new Date(ms);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d)
    throw new Error(`Invalid date: ${date}`);
  return ms;
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    toUtcMs(value);
    return true;
  } catch {
    return false;
  }
}

export function isoDate(year: number, month: number, day: number): string {
  return fromUtcMs(Date.UTC(year, month - 1, day));
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Every day of the inclusive range [from, to]. */
export function eachDay(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, offset) => addDays(from, offset));
}

/** Monday of the ISO week containing `date`. */
export function mondayOf(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

/**
 * ISO 8601 calendar week ("KW"): weeks start on Monday, week 1 contains the year's first Thursday.
 * Returns the week-based year too (29.12.2025 is KW 1 of 2026).
 */
export function isoWeek(date: string): { year: number; week: number } {
  const thursday = addDays(mondayOf(date), 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor(daysBetween(isoDate(year, 1, 1), thursday) / 7) + 1;
  return { year, week };
}

/**
 * Booking cut-off: the Monday before the event (client meeting, research 05). For a Monday event
 * that is the Monday one week earlier.
 */
export function bookingCutoff(eventDay: string): string {
  const daysSinceMonday = (weekday(eventDay) + 6) % 7 || 7;
  return addDays(eventDay, -daysSinceMonday);
}

/**
 * The weekends an event touches, each identified by its Saturday. A day counts if it is a Saturday
 * or Sunday; a Friday-to-Sunday Stadtfest touches one weekend.
 */
export function weekendsTouched(from: string, to: string): string[] {
  const saturdays = new Set<string>();
  for (const day of eachDay(from, to)) {
    const dow = weekday(day);
    if (dow === 6) saturdays.add(day);
    if (dow === 0) saturdays.add(addDays(day, -1));
  }
  return [...saturdays].sort();
}
