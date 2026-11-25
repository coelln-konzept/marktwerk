import type { MarketColor, ScheduleRow } from "@marktwerk/core";
import { type DateRule, holiday, nthSundays, sundays, weekendEnding } from "../lib/market-dates";
import type { EventTypeKey, EventTypeRules } from "../types";

export interface PresetBlueprint {
  /** Stable key (`event_preset.key`). Other parts of the dataset refer to markets by it. */
  key: string;
  eventType: EventTypeKey;
  venueKey: string;
  /** The zone of a shared venue the market uses (Stadion: Vorplatz or P6). Informational. */
  zone: string | null;
  name: string;
  /**
   * The market's Kürzel (`event_preset.short_code`, Fahrplan R15; research 13 G3). The wall calendar's magnet letters
   * repeat ("S" is both Rodenkirchen Hauptstraße and Kerpen Stadtfest), so the place goes in front: Rodenkirchen
   * "RS", "RA", "RM"; Kerpen with three letters ("KST", "KWT" …, so none reads as "KW" = Kalenderwoche). "LS" and
   * "P6" are as on the wall; the others get the short form the team would use ("ALT", "NIP"). Unique, 1–4 characters.
   */
  code: string;
  color: MarketColor;
  /** Usual length in days; a single date may differ (Altstadt is 3 days at Easter and Whitsun). */
  durationDays: number;
  /** When the market takes place, see lib/market-dates.ts. */
  dates: DateRule;
  /**
   * Whether `dates` reproduce the dates read from the 2027 wall calendar (research 13 §2.2), or are plausible dates
   * for a series that had none on the wall yet.
   */
  fromWallCalendar: boolean;
  /** The rhythm shown on the market page (RFC 5545 subset), or null when the dates are irregular. */
  rrule: string | null;
  pricePerMCents: number;
  /** Changes to the copy of the event type's rules ("Marktregeln", D2-3). */
  rules: Partial<EventTypeRules>;
  /** The market's Zeitplan (ADR 0022), copied into every event. */
  schedule: ScheduleRow[];
}

type Window = [from: string, to: string];

function row(
  audience: ScheduleRow["audience"],
  kind: ScheduleRow["kind"],
  day: ScheduleRow["day"],
  [from, to]: Window,
): ScheduleRow {
  return { audience, kind, day, from, to };
}

/**
 * One Sunday: the team tapes off and marks the stalls (Abflattern, Einzeichnen) before the vendors arrive, the
 * vendors set up until opening and tear down after closing.
 */
function sundaySchedule(
  team: Window,
  setup: Window,
  open: Window,
  teardown: Window,
): ScheduleRow[] {
  return [
    row("team", "setup", "first", team),
    row("vendors", "setup", "first", setup),
    row("visitors", "open", "each", open),
    row("vendors", "teardown", "last", teardown),
  ];
}

const KOELN_FLEA = "FREQ=MONTHLY;BYDAY=SU";

/*
 * The 16 Coelln Konzept series of the wall calendar's legend plus Hoffnungsthal (research 13 §2.1, decided
 * 2026-11-13). Coelln Antik & Design (Neumarkt, Rheinauhafen, Flora, Gürzenich) is a separate company and not here.
 * Dates reproduce the 2027 wall calendar (§2.2); series without a date there got plausible ones
 * (`fromWallCalendar: false`). Names of the markets and places are real, everything about people is fictional.
 */
export const PRESET_BLUEPRINTS: readonly PresetBlueprint[] = [
  {
    key: "altstadt",
    eventType: "antique",
    venueKey: "altstadt",
    zone: null,
    name: "Altstadt",
    code: "ALT",
    color: "brown",
    durationDays: 2,
    // Easter and Whitsun Sa–Mo, otherwise the last weekend Sa–So June to October.
    dates: [
      holiday("easter_sunday", -1, 3),
      holiday("whit_sunday", -1, 3),
      ...[6, 7, 8, 9, 10].map((month) => weekendEnding(month, -1, 1, 2)),
    ],
    fromWallCalendar: true,
    rrule: null,
    pricePerMCents: 2500,
    rules: {},
    // Leihstände and Abflattern the day before, Nachtwache in between, some vendors leave early on the last morning.
    schedule: [
      row("team", "setup", "before", ["14:00", "20:00"]),
      row("team", "setup", "first", ["05:30", "07:00"]),
      row("vendors", "setup", "first", ["07:00", "10:00"]),
      row("visitors", "open", "each", ["10:00", "18:00"]),
      row("vendors", "teardown", "last", ["07:00", "09:00"]),
      row("vendors", "teardown", "last", ["18:00", "21:00"]),
      row("team", "teardown", "last", ["18:00", "22:00"]),
    ],
  },
  {
    key: "altstadt-lifestyle",
    eventType: "flea",
    venueKey: "altstadt",
    zone: null,
    name: "Altstadt Lifestyle",
    code: "LS",
    color: "rose",
    durationDays: 1,
    dates: sundays([5, 7, 9], 1),
    fromWallCalendar: false,
    rrule: "FREQ=YEARLY;BYMONTH=5,7,9;BYDAY=SU;BYSETPOS=1",
    pricePerMCents: 2200,
    // Design, handmade and new goods are the point of this market.
    rules: { newGoodsMaxShare: 0.6, bannedGoods: ["Batterien"] },
    schedule: sundaySchedule(
      ["07:00", "08:00"],
      ["08:00", "10:00"],
      ["10:00", "18:00"],
      ["18:00", "20:00"],
    ),
  },
  {
    key: "riehler-guertel",
    eventType: "flea",
    venueKey: "riehler-guertel",
    zone: null,
    name: "Riehler Gürtel",
    code: "RIE",
    color: "petrol",
    durationDays: 1,
    // Monthly April–November, 2nd Sunday; 1st Sunday from September.
    dates: nthSundays({ 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 1, 10: 1, 11: 1 }),
    fromWallCalendar: true,
    rrule: `${KOELN_FLEA};BYMONTH=4,5,6,7,8;BYSETPOS=2`,
    pricePerMCents: 1500,
    rules: {},
    schedule: sundaySchedule(
      ["05:00", "06:00"],
      ["06:00", "08:00"],
      ["08:00", "16:00"],
      ["16:00", "18:00"],
    ),
  },
  {
    key: "nippes",
    eventType: "flea",
    venueKey: "nippes",
    zone: null,
    name: "Nippes, Wilhelmplatz",
    code: "NIP",
    color: "olive",
    durationDays: 1,
    // Monthly January–November, 3rd Sunday (4th in April and August), never on Whitsun or Totensonntag.
    dates: nthSundays({ 1: 3, 2: 3, 3: 3, 4: 4, 5: 3, 6: 3, 7: 3, 8: 4, 9: 3, 10: 3, 11: 3 }),
    fromWallCalendar: true,
    rrule: `${KOELN_FLEA};BYMONTH=1,2,3,4,5,6,7,8,9,10,11;BYSETPOS=3`,
    pricePerMCents: 1500,
    rules: {},
    // Einzeichnen and Verkehr regeln on the morning itself (nothing the day before).
    schedule: sundaySchedule(
      ["05:30", "06:30"],
      ["06:30", "08:00"],
      ["08:00", "15:00"],
      ["15:00", "17:00"],
    ),
  },
  {
    key: "stadion",
    eventType: "flea",
    venueKey: "stadion",
    zone: "Vorplatz",
    name: "RheinEnergie Stadion",
    code: "STA",
    color: "slate",
    durationDays: 1,
    dates: nthSundays({ 3: 2, 4: 3, 5: -1 }),
    fromWallCalendar: true,
    rrule: null,
    pricePerMCents: 1200,
    rules: {},
    schedule: sundaySchedule(
      ["04:30", "05:00"],
      ["05:00", "07:00"],
      ["07:00", "15:00"],
      ["15:00", "17:00"],
    ),
  },
  {
    key: "stadion-p6",
    eventType: "flea",
    venueKey: "stadion",
    zone: "P6",
    name: "P6",
    code: "P6",
    color: "graphite",
    durationDays: 1,
    dates: [...nthSundays({ 4: 1 }), holiday("ascension"), ...nthSundays({ 6: 2, 7: 3 })],
    fromWallCalendar: true,
    rrule: null,
    pricePerMCents: 1200,
    rules: {},
    schedule: sundaySchedule(
      ["04:30", "05:00"],
      ["05:00", "07:00"],
      ["07:00", "15:00"],
      ["15:00", "17:00"],
    ),
  },
  {
    key: "suedstadt",
    eventType: "flea",
    venueKey: "suedstadt",
    zone: null,
    name: "Südstadt",
    code: "SÜD",
    color: "cyan",
    durationDays: 1,
    dates: [...nthSundays({ 4: 3 }), holiday("corpus_christi"), ...nthSundays({ 6: 3 })],
    fromWallCalendar: true,
    rrule: null,
    pricePerMCents: 1500,
    rules: {},
    schedule: sundaySchedule(
      ["06:00", "07:00"],
      ["07:00", "09:00"],
      ["09:00", "16:00"],
      ["16:00", "18:00"],
    ),
  },
  {
    key: "suedbruecke",
    eventType: "flea",
    venueKey: "suedbruecke",
    zone: null,
    name: "Südbrücke",
    code: "SBR",
    color: "indigo",
    durationDays: 1,
    // Monthly March–October, 1st or 2nd Sunday (often the same day as Riehler Gürtel).
    dates: nthSundays({ 3: 1, 4: 2, 5: 2, 6: 1, 7: 1, 8: 2, 9: 2, 10: 2 }),
    fromWallCalendar: true,
    rrule: `${KOELN_FLEA};BYMONTH=3,4,5,6,7,8,9,10;BYSETPOS=2`,
    pricePerMCents: 1400,
    rules: {},
    schedule: sundaySchedule(
      ["05:00", "06:00"],
      ["06:00", "08:00"],
      ["08:00", "16:00"],
      ["16:00", "18:00"],
    ),
  },
  {
    key: "rudolfplatz",
    eventType: "food_wine",
    venueKey: "rudolfplatz",
    zone: null,
    name: "Rudolfplatz",
    code: "RUD",
    color: "plum",
    durationDays: 3,
    // Twice a year, Fr–So: the weekend of the 1st Sunday in March and of the 3rd Sunday in September.
    dates: [weekendEnding(3, 1, 2, 3), weekendEnding(9, 3, 2, 3)],
    fromWallCalendar: true,
    rrule: null,
    pricePerMCents: 2500,
    rules: {},
    schedule: [
      row("team", "setup", "before", ["15:00", "19:00"]),
      row("vendors", "setup", "first", ["08:00", "12:00"]),
      row("visitors", "open", "each", ["12:00", "21:00"]),
      row("vendors", "teardown", "last", ["21:00", "23:30"]),
    ],
  },
  {
    key: "rodenkirchen-hauptstrasse",
    eventType: "city_festival",
    venueKey: "rodenkirchen",
    zone: "Hauptstraße",
    name: "Rodenkirchen Hauptstraße",
    code: "RS",
    color: "sand",
    durationDays: 2,
    // Whitsun Sa–So (grey magnet, 15–16 May 2027).
    dates: [holiday("whit_sunday", -1, 2)],
    fromWallCalendar: true,
    rrule: null,
    pricePerMCents: 2000,
    rules: {},
    schedule: [
      row("team", "setup", "before", ["16:00", "20:00"]),
      row("vendors", "setup", "first", ["07:00", "11:00"]),
      row("visitors", "open", "each", ["11:00", "20:00"]),
      row("vendors", "teardown", "last", ["07:00", "09:00"]),
      row("vendors", "teardown", "last", ["20:00", "22:30"]),
    ],
  },
  {
    key: "rodenkirchen-antik",
    eventType: "antique",
    venueKey: "rodenkirchen",
    zone: "Maternusplatz",
    name: "Rodenkirchen Maternusplatz (Antik)",
    code: "RA",
    color: "brown",
    durationDays: 1,
    dates: sundays([4, 6, 8, 10], 1),
    fromWallCalendar: false,
    rrule: "FREQ=YEARLY;BYMONTH=4,6,8,10;BYDAY=SU;BYSETPOS=1",
    pricePerMCents: 2000,
    rules: {},
    schedule: sundaySchedule(
      ["06:00", "07:00"],
      ["07:00", "09:00"],
      ["09:00", "17:00"],
      ["17:00", "19:00"],
    ),
  },
  {
    key: "rodenkirchen-markt",
    eventType: "flea",
    venueKey: "rodenkirchen",
    zone: "Maternusplatz",
    name: "Rodenkirchen Maternusplatz (Trödel)",
    code: "RM",
    color: "cyan",
    durationDays: 1,
    dates: sundays([5, 6, 7, 8, 9], 4),
    fromWallCalendar: false,
    rrule: "FREQ=MONTHLY;BYMONTH=5,6,7,8,9;BYDAY=SU;BYSETPOS=4",
    pricePerMCents: 1500,
    rules: {},
    schedule: sundaySchedule(
      ["05:30", "06:30"],
      ["06:30", "08:00"],
      ["08:00", "15:00"],
      ["15:00", "17:00"],
    ),
  },
  {
    key: "kerpen-stadtfest",
    eventType: "city_festival",
    venueKey: "kerpen",
    zone: null,
    name: "Kerpen Stadtfest",
    code: "KST",
    color: "rose",
    durationDays: 3,
    // Fr–So, the weekend of the 2nd Sunday in June.
    dates: [weekendEnding(6, 2, 2, 3)],
    fromWallCalendar: false,
    rrule: null,
    pricePerMCents: 2000,
    rules: {},
    schedule: [
      row("team", "setup", "before", ["07:00", "19:00"]),
      row("vendors", "setup", "first", ["09:00", "14:00"]),
      row("visitors", "open", "each", ["14:00", "23:00"]),
      row("vendors", "teardown", "last", ["07:00", "09:00"]),
      row("vendors", "teardown", "last", ["20:00", "23:59"]),
    ],
  },
  {
    key: "kerpen-weintage",
    eventType: "food_wine",
    venueKey: "kerpen",
    zone: null,
    name: "Kerpen Weintage",
    code: "KWT",
    color: "plum",
    durationDays: 4,
    // Do–So, ending on the last Sunday in July.
    dates: [weekendEnding(7, -1, 3, 4)],
    fromWallCalendar: true,
    rrule: null,
    pricePerMCents: 2500,
    rules: {},
    schedule: [
      row("team", "setup", "before", ["08:00", "18:00"]),
      row("vendors", "setup", "first", ["10:00", "16:00"]),
      row("visitors", "open", "each", ["16:00", "22:00"]),
      row("vendors", "teardown", "last", ["22:00", "23:59"]),
    ],
  },
  {
    key: "kerpen-bauernmarkt",
    eventType: "food_wine",
    venueKey: "kerpen",
    zone: null,
    name: "Kerpen Bauernmarkt",
    code: "KBM",
    color: "olive",
    durationDays: 1,
    // Spring and Erntedank (1st Sunday in May and October).
    dates: sundays([5, 10], 1),
    fromWallCalendar: false,
    rrule: "FREQ=YEARLY;BYMONTH=5,10;BYDAY=SU;BYSETPOS=1",
    pricePerMCents: 1500,
    // Farmers sell what they grow; booked by phone, one contract per season.
    rules: { newGoodsMaxShare: 1, bannedGoods: ["Trödel", "Neuware ohne regionalen Bezug"] },
    schedule: sundaySchedule(
      ["06:00", "07:00"],
      ["07:00", "09:00"],
      ["09:00", "16:00"],
      ["16:00", "18:00"],
    ),
  },
  {
    key: "kerpen-troedelmarkt",
    eventType: "flea",
    venueKey: "kerpen",
    zone: null,
    name: "Kerpener Trödelmarkt",
    code: "KTM",
    color: "slate",
    durationDays: 1,
    dates: sundays([4, 8, 10], 3),
    fromWallCalendar: false,
    rrule: "FREQ=YEARLY;BYMONTH=4,8,10;BYDAY=SU;BYSETPOS=3",
    pricePerMCents: 1200,
    rules: {},
    schedule: sundaySchedule(
      ["05:30", "06:30"],
      ["06:30", "08:00"],
      ["08:00", "16:00"],
      ["16:00", "18:00"],
    ),
  },
  {
    key: "hoffnungsthal",
    eventType: "city_festival",
    venueKey: "hoffnungsthal",
    zone: null,
    name: "Hoffnungsthal",
    code: "HOF",
    color: "petrol",
    durationDays: 1,
    // Once a year with the Ortsring, 2nd Sunday in September (handwritten on 12 Sep 2027).
    dates: sundays([9], 2),
    fromWallCalendar: true,
    rrule: "FREQ=YEARLY;BYMONTH=9;BYDAY=SU;BYSETPOS=2",
    pricePerMCents: 1500,
    rules: {},
    // PVBT the evening before; Verkehrssicherung at 09:00 after the fire brigade.
    schedule: [
      row("team", "setup", "before", ["16:00", "20:00"]),
      row("team", "setup", "first", ["06:00", "09:00"]),
      row("vendors", "setup", "first", ["07:00", "10:00"]),
      row("visitors", "open", "each", ["11:00", "18:00"]),
      row("vendors", "teardown", "last", ["18:00", "20:00"]),
      row("team", "teardown", "last", ["18:00", "21:00"]),
    ],
  },
];
