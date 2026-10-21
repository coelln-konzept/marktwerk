import type { DateString, Instant, TimeString } from "../types";

/*
 * Pure calendar arithmetic on "YYYY-MM-DD" strings. Everything runs in UTC so results never depend on the
 * machine's time zone. Europe/Berlin wall-clock times are converted explicitly with `berlinInstant`.
 */

const MS_PER_DAY = 86_400_000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toDateString(year: number, month: number, day: number): DateString {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function toUtcMs(date: DateString): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtcMs(ms: number): DateString {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: DateString, days: number): DateString {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: DateString, to: DateString): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: DateString): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

export function yearOf(date: DateString): number {
  return Number(date.slice(0, 4));
}

export function monthOf(date: DateString): number {
  return Number(date.slice(5, 7));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function lastSunday(year: number, month: number): DateString {
  const last = toDateString(year, month, daysInMonth(year, month));
  return addDays(last, -weekday(last));
}

/** Europe/Berlin is on CEST from the last Sunday of March to the last Sunday of October (exclusive). */
export function isBerlinSummerTime(date: DateString): boolean {
  const year = yearOf(date);
  return date >= lastSunday(year, 3) && date < lastSunday(year, 10);
}

/** Converts a Berlin wall-clock time on a business date to a UTC ISO instant. Avoids the 02:00–03:00 switch hour. */
export function berlinInstant(date: DateString, time: TimeString): Instant {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const offsetHours = isBerlinSummerTime(date) ? 2 : 1;
  return new Date(Date.UTC(year, month - 1, day, hours - offsetHours, minutes)).toISOString();
}

/** The Monday before an event day. For a Monday event this is the Monday one week earlier. */
export function mondayBefore(date: DateString): DateString {
  const daysSinceMonday = (weekday(date) + 6) % 7 || 7;
  return addDays(date, -daysSinceMonday);
}

/** Saturday dates of every weekend that the inclusive range [from, to] touches. */
export function weekendSaturdaysTouched(from: DateString, to: DateString): DateString[] {
  const saturdays = new Set<DateString>();
  const span = daysBetween(from, to);
  for (let offset = 0; offset <= span; offset += 1) {
    const day = addDays(from, offset);
    const dow = weekday(day);
    if (dow === 6) saturdays.add(day);
    if (dow === 0) saturdays.add(addDays(day, -1));
  }
  return [...saturdays].sort();
}

export function addMonths(date: DateString, months: number): DateString {
  const year = yearOf(date);
  const month0 = monthOf(date) - 1 + months;
  const targetYear = year + Math.floor(month0 / 12);
  const targetMonth = (((month0 % 12) + 12) % 12) + 1;
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(targetYear, targetMonth));
  return toDateString(targetYear, targetMonth, day);
}
