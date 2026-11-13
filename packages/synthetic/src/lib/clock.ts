import { seasonsFor } from "../constants";
import type { DateString } from "../types";

/**
 * "Today" of one generator run plus the seasons derived from it. Passed to every generator that decides a
 * status or a date, so nothing reads a calendar literal or the real clock.
 */
export interface Clock {
  today: DateString;
  /** The current season (the reference year). */
  season: number;
  /** The season after it. */
  nextSeason: number;
}

export function clockFor(today: DateString): Clock {
  const [season, nextSeason] = seasonsFor(today);
  return { today, season, nextSeason };
}

/** The later of two `YYYY-MM-DD` dates. */
export function laterOf(a: DateString, b: DateString): DateString {
  return a >= b ? a : b;
}

/** The earlier of two `YYYY-MM-DD` dates. */
export function earlierOf(a: DateString, b: DateString): DateString {
  return a <= b ? a : b;
}
