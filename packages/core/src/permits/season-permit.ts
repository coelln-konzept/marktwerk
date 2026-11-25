import { addDays } from "../dates/calendar";
import { resolveRelativeDue } from "../dates/relative";
import { permitCoversSeveralEvents } from "./apply-task";
import { monthDayIn } from "./coverage";
import type { PermitCadence, PermitStatus } from "./status";

/**
 * Season permits created yearly from the Ort's requirements (ADR 0024, Fahrplan SAI4). A requirement whose cadence
 * covers several dates (`per_season`, `per_year`, `multi_year`, `standing`) gets one permit per Ort and season. The
 * nightly job `season-permits` creates next season's permit (with its own "… beantragen" task) **before any date of
 * that season exists**; the logbook fill then links the dates to it. Pure; dates are `YYYY-MM-DD`, month-days `MM-DD`.
 */

/** First day of a market season: the markets start in March (ADR 0024). The one place this month-day lives. */
export const SEASON_START_MD = "03-01";

/**
 * The job creates a season's permit this many days before its apply-by date: early enough that the task shows a
 * month ahead under "Genehmigungen demnächst" (default horizon 30 days) and the reminders reach the person in time,
 * late enough that the logbook is not full of next year's permits all year round.
 */
export const SEASON_PERMIT_CREATE_DAYS = 30;

/** Clock time of a deadline that is only a day ("bis 30.11."): the end of that day, as the logbook fill uses it. */
export const PERMIT_DEADLINE_TIME = "23:59";

export function seasonStartOf(season: number): string {
  return monthDayIn(season, SEASON_START_MD);
}

export type SeasonPermitRequirement = {
  cadence: PermitCadence;
  leadTimeDays: number;
  submissionWindowStartMd: string | null;
  submissionWindowEndMd: string | null;
};

/**
 * Apply-by of a season's permit, before any date of the season is known:
 * - with a submission window (the authority collects applications e.g. 01.10.–30.11.): the end of the last window
 *   that is over by the season start (a window may wrap the year end; one bound alone means the start / end of the
 *   year, as in `applyByFor`);
 * - otherwise `leadTimeDays` before the season start (1 March).
 */
export function seasonPermitApplyBy(req: SeasonPermitRequirement, season: number): string {
  const start = seasonStartOf(season);
  if (!req.submissionWindowStartMd && !req.submissionWindowEndMd)
    return addDays(start, -Math.max(0, req.leadTimeDays));
  const startMd = req.submissionWindowStartMd ?? "01-01";
  const endMd = req.submissionWindowEndMd ?? "12-31";
  const ends: string[] = [];
  for (let y = season - 2; y <= season; y++)
    ends.push(monthDayIn(endMd < startMd ? y + 1 : y, endMd));
  return (
    ends.filter((end) => end <= start).at(-1) ?? addDays(start, -Math.max(0, req.leadTimeDays))
  );
}

/** The "… beantragen" task's due instant for an apply-by day: the end of that day in the company's time zone. */
export function permitApplyDueAt(applyBy: string, timeZone?: string): Date {
  return resolveRelativeDue(applyBy, 0, PERMIT_DEADLINE_TIME, timeZone);
}

/** The title of a permit's own apply task (task text is data in German, like the template items). */
export function permitApplyTaskTitle(requirementTitle: string): string {
  return `${requirementTitle} beantragen`;
}

/** A permit of the requirement that already exists (not archived). */
export type ExistingSeasonPermit = {
  status: PermitStatus;
  season: number | null;
  validUntil: string | null;
};

/** Does an existing permit already stand for the whole season (so no new one is due)? */
function standsFor(cadence: PermitCadence, permit: ExistingSeasonPermit, season: number): boolean {
  if (permit.status === "superseded") return false;
  if (cadence === "multi_year" || cadence === "standing")
    // Until it runs out: no end date (still waiting, or standing) or valid to the end of the season.
    return permit.validUntil === null || permit.validUntil >= `${season}-12-31`;
  return permit.season === season;
}

export type DueSeasonPermit = {
  /** The season (year) the permit is for. */
  season: number;
  applyBy: string;
  /** The day the job creates it (apply-by minus {@link SEASON_PERMIT_CREATE_DAYS}). */
  createOn: string;
};

/**
 * Which season permits of a requirement are due to exist on `today` and do not yet: for the current and the next
 * season, one whose creation day ({@link SEASON_PERMIT_CREATE_DAYS} before its apply-by) has come while the season
 * has not started yet (1 March). A season that has started is left to the logbook fill: its dates link to a permit
 * or make one when they are created. `per_season` / `per_year`: none exists for that season yet. `multi_year` /
 * `standing`: no permit stands for the season (none exists, or the current one runs out before the season ends);
 * at most one, since a new one stands for the following seasons too.
 * `per_event` requirements never get one (each date has its own permit). Ordered by season.
 */
export function dueSeasonPermits(
  req: SeasonPermitRequirement,
  existing: readonly ExistingSeasonPermit[],
  today: string,
): DueSeasonPermit[] {
  if (!permitCoversSeveralEvents(req.cadence)) return [];
  const year = Number(today.slice(0, 4));
  const due: DueSeasonPermit[] = [];
  for (const season of [year, year + 1]) {
    if (today >= seasonStartOf(season)) continue;
    const applyBy = seasonPermitApplyBy(req, season);
    const createOn = addDays(applyBy, -SEASON_PERMIT_CREATE_DAYS);
    if (today < createOn) continue;
    if (existing.some((p) => standsFor(req.cadence, p, season))) continue;
    due.push({ season, applyBy, createOn });
    // A new multi-year or standing permit stands for the following seasons too.
    if (req.cadence === "multi_year" || req.cadence === "standing") break;
  }
  return due;
}
