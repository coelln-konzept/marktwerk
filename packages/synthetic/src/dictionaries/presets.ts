import type { DefaultTimes, EventTypeKey } from "../types";

export interface PresetBlueprint {
  key: string;
  eventType: EventTypeKey;
  venueKey: string;
  name: string;
  /** RFC 5545 rule, see src/lib/rrule.ts for the supported subset. */
  rrule: string;
  durationDays: number;
  pricePerMCents: number;
  times: DefaultTimes;
}

const FLEA_MONTHS = "BYMONTH=4,5,6,7,8,9,10";
const FLEA_TIMES: DefaultTimes = {
  setup: "05:00",
  open: "08:00",
  close: "16:00",
  teardown: "18:00",
};
const ANTIQUE_TIMES: DefaultTimes = {
  setup: "05:00",
  open: "11:00",
  close: "17:00",
  teardown: "19:00",
};
const FESTIVAL_TIMES: DefaultTimes = {
  setup: "06:00",
  open: "11:00",
  close: "23:00",
  teardown: "23:30",
};
const FOOD_TIMES: DefaultTimes = {
  setup: "07:00",
  open: "11:00",
  close: "20:00",
  teardown: "21:30",
};

/*
 * 14 blueprints: 8 flea (monthly Apr–Oct, mixed Saturdays and Sundays), 3 antique (4–5 dates per season),
 * 1 city festival (Fri–Sun in July), 2 food & wine (2 dates per season each).
 */
export const PRESET_BLUEPRINTS: readonly PresetBlueprint[] = [
  {
    key: "flea-heumarkt",
    eventType: "flea",
    venueKey: "heumarkt",
    name: "Flohmarkt Heumarkt",
    rrule: `FREQ=MONTHLY;${FLEA_MONTHS};BYDAY=SU;BYSETPOS=1`,
    durationDays: 1,
    pricePerMCents: 1500,
    times: FLEA_TIMES,
  },
  {
    key: "flea-nippes",
    eventType: "flea",
    venueKey: "nippes",
    name: "Flohmarkt Nippes",
    rrule: `FREQ=MONTHLY;${FLEA_MONTHS};BYDAY=SA;BYSETPOS=2`,
    durationDays: 1,
    pricePerMCents: 1500,
    times: FLEA_TIMES,
  },
  {
    key: "flea-ehrenfeld",
    eventType: "flea",
    venueKey: "ehrenfeld",
    name: "Flohmarkt Ehrenfeld",
    rrule: `FREQ=MONTHLY;${FLEA_MONTHS};BYDAY=SU;BYSETPOS=3`,
    durationDays: 1,
    pricePerMCents: 1500,
    times: FLEA_TIMES,
  },
  {
    key: "flea-bonn",
    eventType: "flea",
    venueKey: "bonn",
    name: "Flohmarkt Bonn",
    rrule: `FREQ=MONTHLY;${FLEA_MONTHS};BYDAY=SA;BYSETPOS=3`,
    durationDays: 1,
    pricePerMCents: 1500,
    times: FLEA_TIMES,
  },
  {
    key: "flea-neuss",
    eventType: "flea",
    venueKey: "neuss",
    name: "Flohmarkt Neuss",
    rrule: `FREQ=MONTHLY;${FLEA_MONTHS};BYDAY=SU;BYSETPOS=2`,
    durationDays: 1,
    pricePerMCents: 1500,
    times: FLEA_TIMES,
  },
  {
    key: "flea-bilk",
    eventType: "flea",
    venueKey: "bilk",
    name: "Flohmarkt Bilk",
    rrule: `FREQ=MONTHLY;${FLEA_MONTHS};BYDAY=SA;BYSETPOS=-1`,
    durationDays: 1,
    pricePerMCents: 1500,
    times: FLEA_TIMES,
  },
  {
    key: "flea-leverkusen",
    eventType: "flea",
    venueKey: "leverkusen",
    name: "Flohmarkt Leverkusen",
    rrule: `FREQ=MONTHLY;${FLEA_MONTHS};BYDAY=SU;BYSETPOS=-1`,
    durationDays: 1,
    pricePerMCents: 1500,
    times: FLEA_TIMES,
  },
  {
    key: "flea-bergisch",
    eventType: "flea",
    venueKey: "bergisch",
    name: "Flohmarkt Bergisch Gladbach",
    rrule: `FREQ=MONTHLY;${FLEA_MONTHS};BYDAY=SA;BYSETPOS=1`,
    durationDays: 1,
    pricePerMCents: 1500,
    times: FLEA_TIMES,
  },
  {
    key: "antique-heumarkt",
    eventType: "antique",
    venueKey: "heumarkt",
    name: "Antikmarkt Altstadt",
    rrule: "FREQ=MONTHLY;BYMONTH=3,5,6,9,11;BYDAY=SU;BYSETPOS=3",
    durationDays: 1,
    pricePerMCents: 2200,
    times: ANTIQUE_TIMES,
  },
  {
    key: "antique-bonn",
    eventType: "antique",
    venueKey: "bonn",
    name: "Antikmarkt Bonn",
    rrule: "FREQ=MONTHLY;BYMONTH=4,6,8,10;BYDAY=SU;BYSETPOS=4",
    durationDays: 1,
    pricePerMCents: 1900,
    times: ANTIQUE_TIMES,
  },
  {
    key: "antique-leverkusen",
    eventType: "antique",
    venueKey: "leverkusen",
    name: "Antikmarkt Leverkusen",
    rrule: "FREQ=MONTHLY;BYMONTH=3,5,9,11;BYDAY=SA;BYSETPOS=2",
    durationDays: 1,
    pricePerMCents: 1800,
    times: ANTIQUE_TIMES,
  },
  {
    key: "stadtfest-siegburg",
    eventType: "city_festival",
    venueKey: "siegburg",
    name: "Stadtfest Siegburg",
    rrule: "FREQ=YEARLY;BYMONTH=7;BYDAY=FR;BYSETPOS=2",
    durationDays: 3,
    pricePerMCents: 2000,
    times: FESTIVAL_TIMES,
  },
  {
    key: "foodwine-linz",
    eventType: "food_wine",
    venueKey: "linz",
    name: "Food & Wine Linz",
    rrule: "FREQ=YEARLY;BYMONTH=6,9;BYDAY=SA;BYSETPOS=1",
    durationDays: 2,
    pricePerMCents: 2500,
    times: FOOD_TIMES,
  },
  {
    key: "foodwine-troisdorf",
    eventType: "food_wine",
    venueKey: "troisdorf",
    name: "Food & Wine Troisdorf",
    rrule: "FREQ=YEARLY;BYMONTH=11,12;BYDAY=SA;BYSETPOS=1",
    durationDays: 2,
    pricePerMCents: 2500,
    times: FOOD_TIMES,
  },
];
