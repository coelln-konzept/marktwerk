/*
 * Saison record (research 13 §6): one record per market (preset) and calendar year that carries the work done once
 * per season (Termine planen, Genehmigung beantragen …), with its own named dates. Pure rules; dates are business
 * dates ("YYYY-MM-DD", Europe/Berlin calendar days).
 */

import { addDays, daysBetween, isIsoDate, isoDate, mondayOf, weekday } from "../dates/calendar";
import { berlinDay } from "../tasks/board";

export const SEASON_STATUSES = ["planning", "dates_set", "closed"] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

/** The named dates of a season (`event_season_anchor.key`); season template items hang only on these. */
export const SEASON_ANCHOR_KEYS = ["season_start", "season_end"] as const;
export type SeasonAnchorKey = (typeof SEASON_ANCHOR_KEYS)[number];

export function isSeasonStatus(value: unknown): value is SeasonStatus {
  return typeof value === "string" && (SEASON_STATUSES as readonly string[]).includes(value);
}

export function isSeasonAnchorKey(value: unknown): value is SeasonAnchorKey {
  return typeof value === "string" && (SEASON_ANCHOR_KEYS as readonly string[]).includes(value);
}

/** What the rules need to know about an event of the season (archived events are left out by the caller). */
export type SeasonEventDates = { startsOn: string; endsOn: string; status: string };

const counts = (e: SeasonEventDates) => e.status !== "cancelled";

/**
 * Anchor `season_start`: the earliest first day of the season's non-cancelled events; while there is none, the
 * expected start (`event_season.expected_start`).
 */
export function seasonStart(events: readonly SeasonEventDates[], expectedStart: string): string {
  let first: string | null = null;
  for (const e of events)
    if (counts(e) && (first === null || e.startsOn < first)) first = e.startsOn;
  return first ?? expectedStart;
}

/** Anchor `season_end`: the latest last day of the season's non-cancelled events; null without any. */
export function seasonEnd(events: readonly SeasonEventDates[]): string | null {
  let last: string | null = null;
  for (const e of events) if (counts(e) && (last === null || e.endsOn > last)) last = e.endsOn;
  return last;
}

/** Both named dates of a season; `season_end` is null (no anchor row) until the season has a date. */
export function seasonAnchors(
  events: readonly SeasonEventDates[],
  expectedStart: string,
): Record<SeasonAnchorKey, string | null> & { season_start: string } {
  return { season_start: seasonStart(events, expectedStart), season_end: seasonEnd(events) };
}

/** Monday of ISO week 1 of `year` (the week with the year's first Thursday). */
function firstIsoMonday(year: number): string {
  return mondayOf(addDays(isoDate(year, 1, 1), 3));
}

/**
 * The first date we expect for `season` before any event exists: last season's first date moved to the same
 * weekday and ISO week of `season` (Sunday of KW 9 → Sunday of KW 9). Without history: 1 January of the season
 * (decision 2026-11-13, research 13 §6.4). The result always lies in `season`: a date whose week position would
 * fall into the neighbouring year (KW 53, or early-January days of the previous ISO year) moves by one week.
 */
export function expectedStartFromLastSeason(
  lastSeasonFirstDate: string | null,
  season: number,
): string {
  if (!Number.isInteger(season) || season < 1900 || season > 9999)
    throw new Error(`Invalid season: ${season}`);
  if (lastSeasonFirstDate === null) return isoDate(season, 1, 1);
  if (!isIsoDate(lastSeasonFirstDate)) throw new Error(`Invalid date: ${lastSeasonFirstDate}`);
  const from = Number(lastSeasonFirstDate.slice(0, 4));
  // Week position relative to ISO week 1 of the date's calendar year (-1 for early-January days in KW 52/53).
  const week = Math.floor(daysBetween(firstIsoMonday(from), lastSeasonFirstDate) / 7);
  const dayOfWeek = (weekday(lastSeasonFirstDate) + 6) % 7; // Monday = 0
  let result = addDays(firstIsoMonday(season), week * 7 + dayOfWeek);
  if (Number(result.slice(0, 4)) < season) result = addDays(result, 7);
  if (Number(result.slice(0, 4)) > season) result = addDays(result, -7);
  return result;
}

/**
 * Status of a new season record: `closed` when its last date has already passed (the record is history, nothing
 * left to prepare), `dates_set` when it has dates, otherwise `planning`.
 */
export function initialSeasonStatus(
  events: readonly SeasonEventDates[],
  today: string,
): SeasonStatus {
  const end = seasonEnd(events);
  if (end === null) return "planning";
  return end < today ? "closed" : "dates_set";
}

/**
 * Manual status change (research 13 §6.2: "manual switch, undo toast"; no automatic change): any other known
 * status. Whether the season's dates and tasks allow it is `seasonStatusBlock`.
 */
export function canChangeSeasonStatus(from: SeasonStatus, to: SeasonStatus): boolean {
  return isSeasonStatus(from) && isSeasonStatus(to) && from !== to;
}

export type SeasonStatusFacts = {
  status: SeasonStatus;
  /** The season has at least one non-cancelled event. */
  hasDates: boolean;
  /** Anchor `season_end` (null without dates). */
  seasonEnd: string | null;
  today: string;
  /** Open (not done / skipped / cancelled) top-level tasks of the season. */
  openSeasonTasks: number;
};

/** Why a season may not be switched to a status: it would contradict its dates or its tasks (UX-050). */
export type SeasonStatusBlock = "no_dates" | "not_over" | "open_tasks";

/**
 * Guard against contradictory statuses (UX audit round 1 default, UX-050): "Termine stehen" needs at least one
 * date; "Abgeschlossen" needs the last date to be over (a season without dates can be closed) and no open season
 * task. "In Planung" is always possible. Null when the switch is fine.
 */
export function seasonStatusBlock(
  to: SeasonStatus,
  facts: Omit<SeasonStatusFacts, "status">,
): SeasonStatusBlock | null {
  if (to === "dates_set" && !facts.hasDates) return "no_dates";
  if (to === "closed") {
    if (facts.seasonEnd !== null && facts.seasonEnd >= facts.today) return "not_over";
    if (facts.openSeasonTasks > 0) return "open_tasks";
  }
  return null;
}

/**
 * Season tasks of a record created late (UX audit round 1 default, UX-009): a due date that has already passed
 * when the record is made becomes today, so a new season does not start with overdue work. Other dates stay.
 */
export function seasonDueOnCreate(dueOn: string, today: string): string {
  return dueOn < today ? today : dueOn;
}

/** Stable key of the Grundvorlage's "Termine planen" season item (synthetic dictionary, copied into markets). */
export const DATES_PLANNING_KEY = "saison_termine_planen";

/**
 * Is this the season's "Termine planen" task? Only the Grundvorlage's item, by its stable key (it survives
 * versions, renames and the copy into a market's own template); an item someone wrote by hand is left alone, as
 * no marker says what it is for. "Markt planen" completes it when it gives the season its first dates (UX-009
 * default).
 */
export function isDatesPlanningTask(t: { templateStableKey: string | null }): boolean {
  return t.templateStableKey === DATES_PLANNING_KEY;
}

/**
 * The status the UI offers to switch to (never applied automatically): `planning` → `dates_set` once the dates
 * exist; `dates_set` → `closed` after the last day when no season task is open any more.
 */
export function suggestedSeasonStatus(facts: SeasonStatusFacts): SeasonStatus | null {
  if (facts.status === "planning" && facts.hasDates) return "dates_set";
  if (
    facts.status === "dates_set" &&
    facts.seasonEnd !== null &&
    facts.seasonEnd < facts.today &&
    facts.openSeasonTasks === 0
  )
    return "closed";
  return null;
}

/** The seasons the nightly job keeps a record of: the current and the next calendar year in Berlin. */
export function seasonsToKeep(now: Date, timeZone?: string): [number, number] {
  const year = Number(berlinDay(now, timeZone).slice(0, 4));
  return [year, year + 1];
}

// ---------------------------------------------------------------------------------------------
// Market page: the Saison panel (research 13 §6.3, Fahrplan R12)

/** The manual order of the status switch: planning → dates_set → closed; null after closed. */
export function nextSeasonStatus(status: SeasonStatus): SeasonStatus | null {
  const i = SEASON_STATUSES.indexOf(status);
  return i >= 0 && i < SEASON_STATUSES.length - 1 ? (SEASON_STATUSES[i + 1] ?? null) : null;
}

/**
 * How the panel shows the season's start: its first and last date and how many events it has, or, while it has
 * none, the expected start ("erwartet ab …"). Cancelled events do not count.
 */
export type SeasonStartInfo =
  | { kind: "dates"; firstDate: string; lastDate: string; events: number }
  | { kind: "expected"; expectedStart: string };

export function seasonStartInfo(
  events: readonly SeasonEventDates[],
  expectedStart: string,
): SeasonStartInfo {
  const end = seasonEnd(events);
  if (end === null) return { kind: "expected", expectedStart };
  return {
    kind: "dates",
    firstDate: seasonStart(events, expectedStart),
    lastDate: end,
    events: events.filter(counts).length,
  };
}

/**
 * `expected_start` is edited by hand only while the season has no dates (decision 2026-11-13: editable on the
 * market page); once it has dates, the first date is the season start.
 */
export function canEditExpectedStart(events: readonly SeasonEventDates[]): boolean {
  return seasonEnd(events) === null;
}

export type ExpectedStartProblem = "invalid_date" | "outside_season" | "has_dates";

/** Why a new `expected_start` is refused, or null: it must be a real date in the season's year, without dates. */
export function expectedStartProblem(
  date: string,
  season: number,
  events: readonly SeasonEventDates[],
): ExpectedStartProblem | null {
  if (!isIsoDate(date)) return "invalid_date";
  if (Number(date.slice(0, 4)) !== season) return "outside_season";
  if (!canEditExpectedStart(events)) return "has_dates";
  return null;
}

/**
 * The order of the market page's Saison panels: seasons that are not closed first, by year, then the closed ones,
 * by year (in November a closed current season sits below the next one). A year without a record (`status` null,
 * "Saison anlegen") counts as not closed.
 */
export function orderSeasonPanels<T extends { season: number; status: SeasonStatus | null }>(
  panels: readonly T[],
): T[] {
  const closed = (p: T) => (p.status === "closed" ? 1 : 0);
  return [...panels].sort((a, b) => closed(a) - closed(b) || a.season - b.season);
}

/** What the panel needs to know to order a season task. */
export type SeasonTaskLike = { title: string; status: string; dueOn: string | null };

/** Done and skipped tasks are finished; cancelled ones are not listed. */
const FINISHED = new Set(["done", "skipped"]);

const byDueThenTitle = (a: SeasonTaskLike, b: SeasonTaskLike) => {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return a.title.localeCompare(b.title, "de");
};

/**
 * The season's tasks as the panel lists them: open ones first (earliest due date first, no due date last), then
 * the finished ones (done, skipped) in the same order. Cancelled tasks are left out.
 */
export function seasonTaskList<T extends SeasonTaskLike>(
  tasks: readonly T[],
): { open: T[]; finished: T[] } {
  const open: T[] = [];
  const finished: T[] = [];
  for (const task of tasks) {
    if (task.status === "cancelled") continue;
    (FINISHED.has(task.status) ? finished : open).push(task);
  }
  return { open: open.sort(byDueThenTitle), finished: finished.sort(byDueThenTitle) };
}
