import { easterSunday } from "@marktwerk/core";
import type { DateString } from "../types";
import { addDays, monthOf, toDateString, weekday } from "./dates";

/*
 * Date rules of the markets, modelled on how the office picks dates on its wall calendar (research 13 §2):
 * "the n-th Sunday of the month" with a different n in some months, holiday weekends (Easter, Whitsun, a holiday
 * Thursday), the last weekend of a month, and multi-day markets Fr–So / Sa–Mo / Do–So. A rule is a list of
 * occurrences per season; `occurrencesIn(rule, year)` turns it into dates for any year, so the same rules give the
 * 2027 wall calendar and the current season.
 */

/** Movable holidays a market date can hang on. */
export type HolidayAnchor = "easter_sunday" | "ascension" | "whit_sunday" | "corpus_christi";

export type Occurrence =
  | {
      /** The `nth` Sunday of `month` (1–5, or −1 for the last one). */
      anchor: "sunday";
      month: number;
      nth: number;
      /** First market day relative to that Sunday (−2 = Friday, −3 = Thursday). Default 0. */
      startOffset?: number;
      /** Market days. Default: the preset's duration. */
      days?: number;
    }
  | {
      anchor: HolidayAnchor;
      startOffset?: number;
      days?: number;
    };

export type DateRule = readonly Occurrence[];

/** One market date of a season, with the start days it may take in order of preference. */
export interface MarketDate {
  /**
   * Possible first days, best first. Holiday dates have exactly one; Sunday-anchored dates list the rule's Sunday and
   * then the other Sundays of the month (nearest first), leaving out any that would touch a blocked Sunday. The
   * scheduler takes the first that keeps the venue free and the day load at most three.
   */
  candidates: DateString[];
  days: number;
}

/** The n-th Sunday of a month for each month in the table: `{ 4: 2, 9: 1 }` = 2nd in April, 1st in September. */
export function nthSundays(
  table: Readonly<Record<number, number>>,
  extra: Omit<Extract<Occurrence, { anchor: "sunday" }>, "anchor" | "month" | "nth"> = {},
): Occurrence[] {
  return Object.entries(table).map(([month, nth]) => ({
    anchor: "sunday" as const,
    month: Number(month),
    nth,
    ...extra,
  }));
}

/** The same n-th Sunday in each of `months`. */
export function sundays(months: readonly number[], nth: number): Occurrence[] {
  return nthSundays(Object.fromEntries(months.map((month) => [month, nth])));
}

/** A weekend that ends on the n-th Sunday of a month: `from` days before it, `days` long (Fr–So = 2, 3). */
export function weekendEnding(
  month: number,
  nth: number,
  daysBeforeSunday: number,
  days: number,
): Occurrence {
  return { anchor: "sunday", month, nth, startOffset: -daysBeforeSunday, days };
}

export function holiday(anchor: HolidayAnchor, startOffset = 0, days?: number): Occurrence {
  return days === undefined ? { anchor, startOffset } : { anchor, startOffset, days };
}

const HOLIDAY_OFFSETS: Record<HolidayAnchor, number> = {
  easter_sunday: 0,
  ascension: 39,
  whit_sunday: 49,
  corpus_christi: 60,
};

export function holidayDate(anchor: HolidayAnchor, year: number): DateString {
  return addDays(easterSunday(year), HOLIDAY_OFFSETS[anchor]);
}

/** Sundays of a month in order. */
export function sundaysOf(year: number, month: number): DateString[] {
  const first = toDateString(year, month, 1);
  const firstSunday = addDays(first, (7 - weekday(first)) % 7);
  const result: DateString[] = [];
  for (let day = firstSunday; monthOf(day) === month; day = addDays(day, 7)) result.push(day);
  return result;
}

/** First Sunday of Advent: the Sunday between 27 November and 3 December. */
function firstAdvent(year: number): DateString {
  const christmas = toDateString(year, 12, 25);
  const sundayBefore = addDays(christmas, -(weekday(christmas) || 7));
  return addDays(sundayBefore, -21);
}

/**
 * Sundays no market is planned on unless its rule says so (holiday markets): Easter Sunday, Whit Sunday, and the
 * "stille Feiertage" Allerheiligen (when it is a Sunday), Volkstrauertag and Totensonntag (research 13 G5: Nippes
 * moved to 28 November 2027 because of Totensonntag).
 */
export function blockedSundays(year: number): Set<DateString> {
  const advent = firstAdvent(year);
  const blocked = new Set<DateString>([
    holidayDate("easter_sunday", year),
    holidayDate("whit_sunday", year),
    addDays(advent, -7),
    addDays(advent, -14),
  ]);
  const allSaints = toDateString(year, 11, 1);
  if (weekday(allSaints) === 0) blocked.add(allSaints);
  return blocked;
}

/** Days of a date [startsOn, startsOn + days). */
export function daysOf(startsOn: DateString, days: number): DateString[] {
  return Array.from({ length: days }, (_, offset) => addDays(startsOn, offset));
}

/** The dates of one rule in one year, before clashes with other markets are resolved (see MarketDate). */
export function occurrencesIn(rule: DateRule, year: number, defaultDays: number): MarketDate[] {
  const blocked = blockedSundays(year);
  return rule.map((occurrence): MarketDate => {
    const days = occurrence.days ?? defaultDays;
    const startOffset = occurrence.startOffset ?? 0;
    if (occurrence.anchor !== "sunday")
      return { candidates: [addDays(holidayDate(occurrence.anchor, year), startOffset)], days };
    const candidates = sundayCandidates(year, occurrence.month, occurrence.nth)
      .map((sunday) => addDays(sunday, startOffset))
      .filter((start) => daysOf(start, days).every((day) => !blocked.has(day)));
    return { candidates, days };
  });
}

/** The n-th Sunday, then the later Sundays of the month, then the earlier ones (nearest first). */
export function sundayCandidates(year: number, month: number, nth: number): DateString[] {
  const list = sundaysOf(year, month);
  const index = nth > 0 ? nth - 1 : list.length + nth;
  if (index < 0 || index >= list.length) throw new Error(`No Sunday #${nth} in ${year}-${month}`);
  const later = list.slice(index);
  const earlier = list.slice(0, index).reverse();
  return [...later, ...earlier];
}
