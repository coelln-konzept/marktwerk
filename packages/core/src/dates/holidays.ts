import { addDays, isoDate } from "./calendar";

export type Holiday = {
  date: string;
  key: string;
  nameDe: string;
  nameEn: string;
  /**
   * Statutory public holiday (gesetzlicher Feiertag). Easter Sunday and Whit Sunday are listed for
   * planning because markets are held on Sundays, but they are not separate statutory days in NRW.
   */
  statutory: boolean;
};

/** Gregorian Easter Sunday (anonymous Gregorian algorithm, Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

/** Supported federal states. Only Nordrhein-Westfalen for now (settings.bundesland = "NW"). */
export type Bundesland = "NW";

/** Public holidays in North Rhine-Westphalia (Feiertagsgesetz NW §2), sorted by date. */
export function publicHolidays(year: number, _bundesland: Bundesland = "NW"): Holiday[] {
  const easter = easterSunday(year);
  const fixed = (month: number, day: number) => isoDate(year, month, day);
  const list: Holiday[] = [
    {
      date: fixed(1, 1),
      key: "new_year",
      nameDe: "Neujahr",
      nameEn: "New Year's Day",
      statutory: true,
    },
    {
      date: addDays(easter, -2),
      key: "good_friday",
      nameDe: "Karfreitag",
      nameEn: "Good Friday",
      statutory: true,
    },
    {
      date: easter,
      key: "easter_sunday",
      nameDe: "Ostersonntag",
      nameEn: "Easter Sunday",
      statutory: false,
    },
    {
      date: addDays(easter, 1),
      key: "easter_monday",
      nameDe: "Ostermontag",
      nameEn: "Easter Monday",
      statutory: true,
    },
    {
      date: fixed(5, 1),
      key: "labour_day",
      nameDe: "Tag der Arbeit",
      nameEn: "Labour Day",
      statutory: true,
    },
    {
      date: addDays(easter, 39),
      key: "ascension",
      nameDe: "Christi Himmelfahrt",
      nameEn: "Ascension Day",
      statutory: true,
    },
    {
      date: addDays(easter, 49),
      key: "whit_sunday",
      nameDe: "Pfingstsonntag",
      nameEn: "Whit Sunday",
      statutory: false,
    },
    {
      date: addDays(easter, 50),
      key: "whit_monday",
      nameDe: "Pfingstmontag",
      nameEn: "Whit Monday",
      statutory: true,
    },
    {
      date: addDays(easter, 60),
      key: "corpus_christi",
      nameDe: "Fronleichnam",
      nameEn: "Corpus Christi",
      statutory: true,
    },
    {
      date: fixed(10, 3),
      key: "german_unity",
      nameDe: "Tag der Deutschen Einheit",
      nameEn: "German Unity Day",
      statutory: true,
    },
    {
      date: fixed(11, 1),
      key: "all_saints",
      nameDe: "Allerheiligen",
      nameEn: "All Saints' Day",
      statutory: true,
    },
    {
      date: fixed(12, 25),
      key: "christmas_day",
      nameDe: "1. Weihnachtstag",
      nameEn: "Christmas Day",
      statutory: true,
    },
    {
      date: fixed(12, 26),
      key: "boxing_day",
      nameDe: "2. Weihnachtstag",
      nameEn: "Boxing Day",
      statutory: true,
    },
  ];
  return list.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** Holidays in the inclusive range [from, to], keyed by date. */
export function holidaysBetween(
  from: string,
  to: string,
  bundesland: Bundesland = "NW",
): Map<string, Holiday> {
  const result = new Map<string, Holiday>();
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year += 1) {
    for (const holiday of publicHolidays(year, bundesland)) {
      if (holiday.date >= from && holiday.date <= to) result.set(holiday.date, holiday);
    }
  }
  return result;
}
