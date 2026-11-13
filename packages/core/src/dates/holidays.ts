import { addDays, isoDate, weekday } from "./calendar";

/**
 * Hours (local time, Europe/Berlin) in which markets are forbidden on a stiller Feiertag (FeiertG NW §6, §7 Abs. 2).
 * `untilHour` 24 means to the end of the day. The Bezirksregierung can allow exceptions (§10), hence "meist".
 */
export type QuietHours = { fromHour: number; untilHour: number };

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
  /**
   * Not a day off at all, only listed for its restrictions: the Gedenk- und Trauertage Volkstrauertag and
   * Totensonntag (FeiertG NW §2 Abs. 2) and Heiligabend (§7 Abs. 2). Only returned with `observances: true`.
   */
  observance: boolean;
  /** Stiller Feiertag: markets are forbidden in these hours (FeiertG NW §6, §7 Abs. 2); null on other days. */
  quiet: QuietHours | null;
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
      observance: false,
      quiet: null,
    },
    {
      date: addDays(easter, -2),
      key: "good_friday",
      nameDe: "Karfreitag",
      nameEn: "Good Friday",
      statutory: true,
      observance: false,
      // §6 Abs. 3: the whole day (to 6:00 the next morning).
      quiet: { fromHour: 0, untilHour: 24 },
    },
    {
      date: easter,
      key: "easter_sunday",
      nameDe: "Ostersonntag",
      nameEn: "Easter Sunday",
      statutory: false,
      observance: false,
      quiet: null,
    },
    {
      date: addDays(easter, 1),
      key: "easter_monday",
      nameDe: "Ostermontag",
      nameEn: "Easter Monday",
      statutory: true,
      observance: false,
      quiet: null,
    },
    {
      date: fixed(5, 1),
      key: "labour_day",
      nameDe: "Tag der Arbeit",
      nameEn: "Labour Day",
      statutory: true,
      observance: false,
      quiet: null,
    },
    {
      date: addDays(easter, 39),
      key: "ascension",
      nameDe: "Christi Himmelfahrt",
      nameEn: "Ascension Day",
      statutory: true,
      observance: false,
      quiet: null,
    },
    {
      date: addDays(easter, 49),
      key: "whit_sunday",
      nameDe: "Pfingstsonntag",
      nameEn: "Whit Sunday",
      statutory: false,
      observance: false,
      quiet: null,
    },
    {
      date: addDays(easter, 50),
      key: "whit_monday",
      nameDe: "Pfingstmontag",
      nameEn: "Whit Monday",
      statutory: true,
      observance: false,
      quiet: null,
    },
    {
      date: addDays(easter, 60),
      key: "corpus_christi",
      nameDe: "Fronleichnam",
      nameEn: "Corpus Christi",
      statutory: true,
      observance: false,
      quiet: null,
    },
    {
      date: fixed(10, 3),
      key: "german_unity",
      nameDe: "Tag der Deutschen Einheit",
      nameEn: "German Unity Day",
      statutory: true,
      observance: false,
      quiet: null,
    },
    {
      date: fixed(11, 1),
      key: "all_saints",
      nameDe: "Allerheiligen",
      nameEn: "All Saints' Day",
      statutory: true,
      observance: false,
      // §6 Abs. 2
      quiet: { fromHour: 5, untilHour: 18 },
    },
    {
      date: fixed(12, 25),
      key: "christmas_day",
      nameDe: "1. Weihnachtstag",
      nameEn: "Christmas Day",
      statutory: true,
      observance: false,
      quiet: null,
    },
    {
      date: fixed(12, 26),
      key: "boxing_day",
      nameDe: "2. Weihnachtstag",
      nameEn: "Boxing Day",
      statutory: true,
      observance: false,
      quiet: null,
    },
  ];
  return list.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** First Sunday of Advent: the fourth Sunday before Christmas Day (27 November to 3 December). */
export function firstAdvent(year: number): string {
  const dec3 = isoDate(year, 12, 3);
  return addDays(dec3, -weekday(dec3));
}

/**
 * Days that are no public holiday but restrict markets under the Feiertagsgesetz NW, sorted by date:
 * Volkstrauertag (second Sunday before Advent) and Totensonntag (last Sunday before Advent) as Gedenk- und
 * Trauertage (§2 Abs. 2, rules in §6 Abs. 1 and 2), and Heiligabend from 16:00 (§7 Abs. 2). Karfreitag and
 * Allerheiligen, the other stille Feiertage, are public holidays and carry `quiet` in `publicHolidays`.
 */
export function quietObservances(year: number, _bundesland: Bundesland = "NW"): Holiday[] {
  const advent = firstAdvent(year);
  return [
    {
      date: addDays(advent, -14),
      key: "national_mourning_day",
      nameDe: "Volkstrauertag",
      nameEn: "National Day of Mourning",
      statutory: false,
      observance: true,
      // §6 Abs. 1: markets 5–13 Uhr
      quiet: { fromHour: 5, untilHour: 13 },
    },
    {
      date: addDays(advent, -7),
      key: "sunday_of_the_dead",
      nameDe: "Totensonntag",
      nameEn: "Sunday of the Dead",
      statutory: false,
      observance: true,
      // §6 Abs. 2
      quiet: { fromHour: 5, untilHour: 18 },
    },
    {
      date: isoDate(year, 12, 24),
      key: "christmas_eve",
      nameDe: "Heiligabend",
      nameEn: "Christmas Eve",
      statutory: false,
      observance: true,
      // §7 Abs. 2: §6 Abs. 1 applies from 16:00
      quiet: { fromHour: 16, untilHour: 24 },
    },
  ];
}

/** True for a stiller Feiertag: markets are (mostly) not allowed for at least part of the day. */
export function isQuietHoliday(holiday: Holiday): holiday is Holiday & { quiet: QuietHours } {
  return holiday.quiet !== null;
}

/**
 * Holidays in the inclusive range [from, to], keyed by date in date order. `observances: true` adds the stille Tage that are
 * no holiday (Volkstrauertag, Totensonntag, Heiligabend) for calendars and planning; leave it off wherever the
 * map means "day off" (working days for due dates, hours).
 */
export function holidaysBetween(
  from: string,
  to: string,
  bundesland: Bundesland = "NW",
  options: { observances?: boolean } = {},
): Map<string, Holiday> {
  const result = new Map<string, Holiday>();
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year += 1) {
    const days = options.observances
      ? [...publicHolidays(year, bundesland), ...quietObservances(year, bundesland)].sort((x, y) =>
          x.date < y.date ? -1 : x.date > y.date ? 1 : 0,
        )
      : publicHolidays(year, bundesland);
    for (const holiday of days) {
      if (holiday.date >= from && holiday.date <= to) result.set(holiday.date, holiday);
    }
  }
  return result;
}

export type HolidayWeekend = {
  key: "easter" | "whitsun";
  nameDe: string;
  nameEn: string;
  /** Saturday before the Sunday. */
  from: string;
  /** The Monday holiday. */
  to: string;
};

/** Easter (Karsamstag–Ostermontag) and Whitsun (Pfingstsamstag–Pfingstmontag) weekends of a year. */
export function holidayWeekends(year: number): HolidayWeekend[] {
  const easter = easterSunday(year);
  const whitSunday = addDays(easter, 49);
  return [
    {
      key: "easter",
      nameDe: "Osterwochenende",
      nameEn: "Easter weekend",
      from: addDays(easter, -1),
      to: addDays(easter, 1),
    },
    {
      key: "whitsun",
      nameDe: "Pfingstwochenende",
      nameEn: "Whitsun weekend",
      from: addDays(whitSunday, -1),
      to: addDays(whitSunday, 1),
    },
  ];
}

/** Every day in [from, to] that belongs to a holiday weekend (Sa–Mo), keyed by date. */
export function holidayWeekendsBetween(from: string, to: string): Map<string, HolidayWeekend> {
  const result = new Map<string, HolidayWeekend>();
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year += 1) {
    for (const weekend of holidayWeekends(year)) {
      for (let day = weekend.from; day <= weekend.to; day = addDays(day, 1)) {
        if (day >= from && day <= to) result.set(day, weekend);
      }
    }
  }
  return result;
}
