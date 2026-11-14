import { addDays, daysInMonth, isIsoDate, isoDate } from "@marktwerk/core";

/*
 * Reading a typed date (UX concept §8, F2 class B): people type "5.3.", "05.03.26", "0503", "heute" or
 * "morgen" and see what the app understood. Used by `DateField`; pure so it can be tested.
 */

export type DateInputError =
  /** Looks like the start of a date ("5.", "05.0", "5.3.2", "050"): typing stopped half-way. */
  | "incomplete"
  /** Not a date ("31.02.", "13.13.", "abc", year 31022). */
  | "invalid"
  /** Empty, but the field needs a date. */
  | "required"
  /** Before `min`. */
  | "tooEarly"
  /** After `max`. */
  | "tooLate";

export type DateInputCheck =
  | { value: string | null; error: null }
  | { value: null; error: DateInputError };

type Parsed =
  | { kind: "empty" }
  /** `fixed`: the text names the year (or is a word like "heute"), so `min` never moves it. */
  | { kind: "date"; date: string; fixed: boolean }
  | { kind: DateInputError };

/** Relative words, German first; English ones work in both languages. */
const WORDS: Record<string, number> = {
  heute: 0,
  morgen: 1,
  übermorgen: 2,
  uebermorgen: 2,
  gestern: -1,
  today: 0,
  tomorrow: 1,
  yesterday: -1,
};

/** "Do 05.03.2026", "Thu, 05/03/2026": the weekday the field itself writes in front is ignored. */
const LEADING_WEEKDAY = /^[a-zäöü]{2,10}\.?,?\s+(?=\d)/;

function dayMonth(day: number, month: number, year: number, fixed = true): Parsed {
  if (year < 1900 || year > 2199) return { kind: "invalid" };
  if (month < 1 || month > 12) return { kind: "invalid" };
  if (day < 1 || day > daysInMonth(year, month)) return { kind: "invalid" };
  return { kind: "date", date: isoDate(year, month, day), fixed };
}

function withYear(day: string, month: string, year: string | undefined, today: string): Parsed {
  if (day.length > 2 || month.length > 2) return { kind: "invalid" };
  if (year === undefined) {
    // No year: this year. Whether that should roll into next year is decided by the caller (`min`).
    return dayMonth(Number(day), Number(month), Number(today.slice(0, 4)), false);
  }
  if (year.length === 2) return dayMonth(Number(day), Number(month), 2000 + Number(year));
  if (year.length === 4) return dayMonth(Number(day), Number(month), Number(year));
  return year.length < 4 ? { kind: "incomplete" } : { kind: "invalid" };
}

/** Reads the text of a date field; `today` is the business date ("YYYY-MM-DD") for words and the year. */
export function parseDateInput(text: string, today: string): Parsed {
  const raw = text.trim().toLowerCase();
  if (raw === "") return { kind: "empty" };

  const word = WORDS[raw];
  if (word !== undefined) return { kind: "date", date: addDays(today, word), fixed: true };
  if (/^[a-zäöü]+$/.test(raw)) {
    return Object.keys(WORDS).some((w) => w.startsWith(raw))
      ? { kind: "incomplete" }
      : { kind: "invalid" };
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (iso) return dayMonth(Number(iso[3]), Number(iso[2]), Number(iso[1]));

  const text2 = raw.replace(LEADING_WEEKDAY, "");
  if (!/^[\d./\-\s]+$/.test(text2)) return { kind: "invalid" };

  // Digits only: DDMM, DDMMYY, DDMMYYYY.
  if (/^\d+$/.test(text2)) {
    const n = text2.length;
    if (n === 4) return withYear(text2.slice(0, 2), text2.slice(2, 4), undefined, today);
    if (n === 6 || n === 8)
      return withYear(text2.slice(0, 2), text2.slice(2, 4), text2.slice(4), today);
    return n < 8 ? { kind: "incomplete" } : { kind: "invalid" };
  }

  const parts = text2.split(/[./\-\s]+/);
  // "5.3." ends with a separator: one empty part at the end.
  if (parts.at(-1) === "") parts.pop();
  if (parts[0] === "" || parts.length > 3) return { kind: "invalid" };
  const [day, month, year] = parts as [string, string?, string?];
  if (month === undefined) return day.length <= 2 ? { kind: "incomplete" } : { kind: "invalid" };
  return withYear(day, month, year, today);
}

/**
 * Everything the field needs to know about its text: the business date it stands for (or null when
 * empty) or why it is not one. Without a typed year the date is in `today`'s year, or the next year
 * when that is the first one allowed by `min` ("5.3." typed in November for a due date means March).
 */
export function checkDateInput(
  text: string,
  {
    today,
    min,
    max,
    required = false,
  }: { today: string; min?: string; max?: string; required?: boolean },
): DateInputCheck {
  const parsed = parseDateInput(text, today);
  if (parsed.kind === "empty")
    return required ? { value: null, error: "required" } : { value: null, error: null };
  if (parsed.kind !== "date") return { value: null, error: parsed.kind };

  let date = parsed.date;
  if (min && date < min && !parsed.fixed) {
    const next = `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;
    if (isIsoDate(next) && next >= min) date = next;
  }
  if (min && date < min) return { value: null, error: "tooEarly" };
  if (max && date > max) return { value: null, error: "tooLate" };
  return { value: date, error: null };
}
