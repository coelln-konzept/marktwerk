import { addDays } from "../dates/calendar";
import { resolveRelativeDue } from "../dates/relative";
import { permitCoversSeveralEvents } from "./apply-task";
import { applyByFor, monthDayIn } from "./coverage";
import type { PermitCadence } from "./status";

/**
 * Season permits (ADR 0024, amended 2026-11-26, Fahrplan SAI8). A requirement whose cadence covers several dates
 * (`per_season`, `per_year`, `multi_year`, `standing`) gets one permit per Ort and season, with its own "… beantragen"
 * task. **Planning the dates creates it**: the logbook fill makes it with the first date of that season at the Ort and
 * links the later ones (there is no nightly job any more). Its apply-by stays fixed in the calendar before the season
 * starts ({@link fillApplyBy}). Pure; dates are `YYYY-MM-DD`, month-days `MM-DD`.
 */

/** First day of a market season: the markets start in March (ADR 0024). The one place this month-day lives. */
export const SEASON_START_MD = "03-01";

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
 * Apply-by of a season's permit, fixed in the calendar (whatever its dates are):
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

/**
 * Apply-by of the permit a new date makes (logbook fill). A permit covering several dates, for a season that has not
 * started on `today` (1 March): the season's calendar deadline ({@link seasonPermitApplyBy}); for a date before the
 * season start (January, February) the date's own one when that is earlier. Otherwise (a per-date permit, or a date added while its
 * season is running): the date's own deadline, lead time before its first day respecting the submission window
 * (`applyByFor`).
 */
export function fillApplyBy(
  req: SeasonPermitRequirement,
  eventStartsOn: string,
  eventSeason: number,
  today: string,
): string {
  const own = applyByFor(eventStartsOn, req.leadTimeDays, {
    startMd: req.submissionWindowStartMd,
    endMd: req.submissionWindowEndMd,
  });
  if (!permitCoversSeveralEvents(req.cadence) || today >= seasonStartOf(eventSeason)) return own;
  const season = seasonPermitApplyBy(req, eventSeason);
  return eventStartsOn < seasonStartOf(eventSeason) && own < season ? own : season;
}

/** The "… beantragen" task's due instant for an apply-by day: the end of that day in the company's time zone. */
export function permitApplyDueAt(applyBy: string, timeZone?: string): Date {
  return resolveRelativeDue(applyBy, 0, PERMIT_DEADLINE_TIME, timeZone);
}

/** The title of a permit's own apply task (task text is data in German, like the template items). */
export function permitApplyTaskTitle(requirementTitle: string): string {
  return `${requirementTitle} beantragen`;
}
