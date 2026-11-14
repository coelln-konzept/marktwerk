import { addDays, daysInMonth, isoDate } from "../dates/calendar";
import type { PermitCadence, PermitStatus } from "./status";

/**
 * Which permit covers which event, and when it has to be applied for. Pure; used by the logbook fill
 * (`fillLogbookForEvents` in the web app). Dates are `YYYY-MM-DD`, month-days `MM-DD`.
 */

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

/** A real "MM-DD": the day exists in that month (31.02. does not; 29.02. does, in leap years). */
export function isMonthDay(value: unknown): value is string {
  if (typeof value !== "string" || !MONTH_DAY.test(value)) return false;
  const [month, day] = value.split("-").map(Number) as [number, number];
  // 2000 is a leap year: 29.02. is a valid month-day, `monthDayIn` moves it in other years.
  return day <= daysInMonth(2000, month);
}

/** The date of a month-day in a year; 02-29 falls back to 28.02. in non-leap years. */
export function monthDayIn(year: number, md: string): string {
  const [month, day] = md.split("-").map(Number) as [number, number];
  return isoDate(year, month, Math.min(day, daysInMonth(year, month)));
}

export type CoveredEvent = {
  startsOn: string;
  endsOn: string;
  season: number;
  /** The event's market (`event.preset_id`); null or left out for an event without one. */
  presetId?: string | null;
};

/** The Saison record a permit belongs to (`permit.season_id` → `event_season`): its market and year. */
export type PermitSeasonRecord = { presetId: string; season: number };

export type CoveringPermit = {
  status: PermitStatus;
  season: number | null;
  validFrom: string | null;
  validUntil: string | null;
  /** Its Saison record (Fahrplan R11/R27); null or left out for a permit without one. */
  seasonRecord?: PermitSeasonRecord | null;
};

function withinValidity(permit: CoveringPermit, event: CoveredEvent): boolean {
  if (permit.validFrom && event.startsOn < permit.validFrom) return false;
  if (permit.validUntil && event.endsOn > permit.validUntil) return false;
  return true;
}

/**
 * Does a permit that belongs to a Saison record serve this event's market (Fahrplan R27)? A place can hold
 * several markets (Rodenkirchen, Kerpen, Stadion + P6 …), each with its own permit, so a permit with a record
 * covers only the events of that record's market, and a season or year permit only those of the record's year
 * (a multi-year or standing permit also covers its market's later years, within its validity). A permit without
 * a record (older data, events without a market, permits made by hand) keeps the place + season rule.
 */
export function permitServesMarket(
  cadence: PermitCadence,
  record: PermitSeasonRecord | null | undefined,
  event: Pick<CoveredEvent, "season" | "presetId">,
): boolean {
  if (!record) return true;
  if (!event.presetId || record.presetId !== event.presetId) return false;
  return cadence === "multi_year" || cadence === "standing" || record.season === event.season;
}

/**
 * Does an existing permit cover the event? `per_event` permits are never shared. `per_season` /
 * `per_year` permits cover the events of their season (and, if validity is entered, only the days
 * inside it). `multi_year` / `standing` permits cover everything inside their validity; without dates
 * (still waiting for the authority) they cover everything. A superseded permit covers nothing; a rejected
 * one still does, so the logbook shows the rejection instead of silently opening a second application.
 * A permit with a Saison record covers only its own market's events ({@link permitServesMarket}).
 */
export function permitCovers(
  cadence: PermitCadence,
  permit: CoveringPermit,
  event: CoveredEvent,
): boolean {
  if (permit.status === "superseded") return false;
  if (!permitServesMarket(cadence, permit.seasonRecord, event)) return false;
  switch (cadence) {
    case "per_event":
      return false;
    case "per_season":
    case "per_year":
      return permit.season === event.season && withinValidity(permit, event);
    case "multi_year":
    case "standing":
      return withinValidity(permit, event);
  }
}

/** The `permit.season` of a new instance: single-event, season and year permits belong to one season; multi-year and standing ones to none. */
export function seasonFor(cadence: PermitCadence, eventSeason: number): number | null {
  return cadence === "multi_year" || cadence === "standing" ? null : eventSeason;
}

/**
 * The title of a permit instance made by the logbook fill. Single-event permits carry their date ("Halteverbot –
 * 2027-05-01", shown in the locale's format), the others are named by the requirement (the season is a column of
 * its own). Where a place holds several markets (`marketName` given), the market is named too, so the logbook
 * tells their permits apart (Fahrplan R27): "Marktgenehmigung – Rodenkirchen Maternusplatz Antik".
 */
export function permitInstanceTitle(
  requirementTitle: string,
  cadence: PermitCadence,
  eventStartsOn: string,
  marketName?: string | null,
): string {
  const parts = [requirementTitle];
  if (marketName) parts.push(marketName);
  if (cadence === "per_event") parts.push(eventStartsOn);
  return parts.join(" – ");
}

export type SubmissionWindow = { startMd: string | null; endMd: string | null };

/**
 * Last day to apply: event day minus lead time. If the authority only collects applications in a window
 * (e.g. 01.10.–30.11.), the date is moved back to the end of the latest window that is over by then; a
 * date inside a window stays. A window may wrap the year end (11-01 … 02-28). Only one bound given →
 * the other is the start / end of the year.
 */
export function applyByFor(
  eventDay: string,
  leadTimeDays: number,
  window?: SubmissionWindow | null,
): string {
  const candidate = addDays(eventDay, -Math.max(0, leadTimeDays));
  if (!window || (!window.startMd && !window.endMd)) return candidate;
  const startMd = window.startMd ?? "01-01";
  const endMd = window.endMd ?? "12-31";
  const year = Number(candidate.slice(0, 4));
  const windows: { start: string; end: string }[] = [];
  for (let y = year - 2; y <= year + 1; y++) {
    windows.push({
      start: monthDayIn(y, startMd),
      end: monthDayIn(endMd < startMd ? y + 1 : y, endMd),
    });
  }
  if (windows.some((w) => w.start <= candidate && candidate <= w.end)) return candidate;
  const before = windows.filter((w) => w.end < candidate).at(-1);
  return before?.end ?? candidate;
}

/** The next date after the application deadline on which the authority usually decides ("01-15"). */
export function expectedDecisionAfter(applyBy: string, decisionMd: string | null): string | null {
  if (!decisionMd) return null;
  const year = Number(applyBy.slice(0, 4));
  const thisYear = monthDayIn(year, decisionMd);
  return thisYear > applyBy ? thisYear : monthDayIn(year + 1, decisionMd);
}
