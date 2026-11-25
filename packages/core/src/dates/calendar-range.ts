import { daysInMonth, isIsoDate, isoDate } from "./calendar";

/*
 * The years the Kalender browses (UX-041): `?monat=9999-12` used to run past year 9999 in the date
 * arithmetic and fail in the database. A well-formed value outside the range is pulled to its nearest end
 * (`clamped`, so the page can say so); a malformed one is not a date at all (null, the page shows today).
 * Also the typed jump of the Zeitraum popover ("14.3.2027", "3.2027", "März 2027", UX-051).
 */

export const CALENDAR_YEAR_MIN = 2000;
export const CALENDAR_YEAR_MAX = 2100;

const FIRST_DAY = isoDate(CALENDAR_YEAR_MIN, 1, 1);
const LAST_DAY = isoDate(CALENDAR_YEAR_MAX, 12, 31);
const FIRST_MONTH = FIRST_DAY.slice(0, 7);
const LAST_MONTH = LAST_DAY.slice(0, 7);

/** Whether the Kalender shows `year`. */
export function inCalendarRange(year: number): boolean {
  return Number.isInteger(year) && year >= CALENDAR_YEAR_MIN && year <= CALENDAR_YEAR_MAX;
}

/** `?monat=` ("YYYY-MM"): the month, pulled into the range; null when it is no month. */
export function parseCalendarMonth(
  value: string | undefined,
): { month: string; clamped: boolean } | null {
  if (value === undefined || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  if (value < FIRST_MONTH) return { month: FIRST_MONTH, clamped: true };
  if (value > LAST_MONTH) return { month: LAST_MONTH, clamped: true };
  return { month: value, clamped: false };
}

/** `?jahr=` ("YYYY"): the year, pulled into the range; null when it is no year. */
export function parseCalendarYear(
  value: string | undefined,
): { year: number; clamped: boolean } | null {
  if (value === undefined || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  if (year < CALENDAR_YEAR_MIN) return { year: CALENDAR_YEAR_MIN, clamped: true };
  if (year > CALENDAR_YEAR_MAX) return { year: CALENDAR_YEAR_MAX, clamped: true };
  return { year, clamped: false };
}

/** `?ab=` ("YYYY-MM-DD"): the day, pulled into the range; null when it is no date. */
export function parseCalendarDay(
  value: string | undefined,
): { date: string; clamped: boolean } | null {
  if (value === undefined || !isIsoDate(value)) return null;
  if (value < FIRST_DAY) return { date: FIRST_DAY, clamped: true };
  if (value > LAST_DAY) return { date: LAST_DAY, clamped: true };
  return { date: value, clamped: false };
}

/** "YYYY-MM" one month before or after `month`; null when that leaves the range. */
export function shiftCalendarMonth(month: string, by: -1 | 1): string | null {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + by;
  const year = Math.floor(index / 12);
  if (!inCalendarRange(year)) return null;
  return `${year}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** What a typed jump means: a day, or a whole month (`date` is then null). */
export type CalendarJump =
  | { ok: true; month: string; date: string | null }
  | { ok: false; error: "invalid" | "range" };

const MONTH_NAMES: readonly (readonly string[])[] = [
  ["jan", "januar", "jänner", "january"],
  ["feb", "februar", "february"],
  ["mär", "mar", "märz", "maerz", "march"],
  ["apr", "april"],
  ["mai", "may"],
  ["jun", "juni", "june"],
  ["jul", "juli", "july"],
  ["aug", "august"],
  ["sep", "sept", "september"],
  ["okt", "oct", "oktober", "october"],
  ["nov", "november"],
  ["dez", "dec", "dezember", "december"],
];

function monthFromName(word: string): number | null {
  const w = word.replace(/\.$/, "");
  const index = MONTH_NAMES.findIndex((names) => names.includes(w));
  return index === -1 ? null : index + 1;
}

/** Two-digit years are this century ("27" → 2027); no year means the year of `today`. */
function fullYear(raw: string | undefined, today: string): number {
  if (raw === undefined || raw === "") return Number(today.slice(0, 4));
  return raw.length === 2 ? 2000 + Number(raw) : Number(raw);
}

function result(year: number, month: number, day: number | null): CalendarJump {
  if (!Number.isInteger(year) || month < 1 || month > 12) return { ok: false, error: "invalid" };
  if (day !== null && (day < 1 || day > daysInMonth(year, month)))
    return { ok: false, error: "invalid" };
  if (!inCalendarRange(year)) return { ok: false, error: "range" };
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  return { ok: true, month: monthKey, date: day === null ? null : isoDate(year, month, day) };
}

/**
 * A typed Kalender jump, German first: "14.3.2027", "14.03.27", "14.3." (this year), "3.2027", "03/27",
 * "März 2027", "märz" (this year), "2027-03", "2027-03-14", "heute". A day jumps to that day, a month to its
 * first. Years outside {@link CALENDAR_YEAR_MIN}–{@link CALENDAR_YEAR_MAX} are `range`, the rest `invalid`.
 */
export function parseCalendarJump(input: string, today: string): CalendarJump {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (text === "") return { ok: false, error: "invalid" };
  if (text === "heute" || text === "today")
    return result(Number(today.slice(0, 4)), Number(today.slice(5, 7)), Number(today.slice(8, 10)));

  let match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(text);
  if (match) {
    const [, y, m, d] = match;
    return result(Number(y), Number(m), d === undefined ? null : Number(d));
  }
  // Day and month, with or without a year: "14.3.2027", "14.03.27", "14.3.", "14.3".
  // The year needs its own dot, so "3.2027" is March 2027 and not the 3rd of month 20.
  match = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}|\d{2})?)?$/.exec(text);
  if (match) {
    const [, d, m, y] = match;
    return result(fullYear(y, today), Number(m), Number(d));
  }
  // Month and year: "3.2027", "03/2027", "3/27".
  match = /^(\d{1,2})(?:\.(\d{4})|\/(\d{4}|\d{2}))$/.exec(text);
  if (match) {
    const [, m, y4, y] = match;
    return result(fullYear(y4 ?? y, today), Number(m), null);
  }
  // A month name, with or without a year: "März 2027", "mär. 27", "märz".
  match = /^([a-zä]+\.?) ?(\d{4}|\d{2})?$/.exec(text);
  if (match) {
    const [, name, y] = match;
    const m = monthFromName(name as string);
    if (m !== null) return result(fullYear(y, today), m, null);
  }
  // A day and a month name: "14. März 2027", "14 märz".
  match = /^(\d{1,2})\.? ([a-zä]+\.?) ?(\d{4}|\d{2})?$/.exec(text);
  if (match) {
    const [, d, name, y] = match;
    const m = monthFromName(name as string);
    if (m !== null) return result(fullYear(y, today), m, Number(d));
  }
  // A year on its own: its January.
  if (/^\d{4}$/.test(text)) return result(Number(text), 1, null);
  return { ok: false, error: "invalid" };
}
