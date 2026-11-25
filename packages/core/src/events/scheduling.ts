import { addDays, eachDay } from "../dates/calendar";
import {
  type Bundesland,
  type Holiday,
  type HolidayWeekend,
  holidaysBetween,
  holidayWeekendsBetween,
} from "../dates/holidays";

/**
 * Business rule from the client meeting: a weekend with this many events is full (the Kalender marks it ⚑).
 * Planning no longer warns about it (user test 2, UT2-11).
 */
export const MAX_EVENTS_PER_WEEKEND = 4;

export type ScheduledEvent = {
  id: string;
  name: string;
  venueId: string;
  startsOn: string;
  endsOn: string;
};

export type Candidate = { startsOn: string; endsOn: string; venueId: string };

export type CandidateCheck = Candidate & {
  /** Holidays on any day of the candidate, including the stille Tage that are no holiday (`observance`). */
  holidays: Holiday[];
  /** Easter or Whitsun weekend (Sa–Mo) the candidate touches; a quiet hint, not a warning. */
  holidayWeekends: HolidayWeekend[];
  /** Existing events at the same venue overlapping any day of the candidate. */
  venueConflicts: Pick<ScheduledEvent, "id" | "name" | "startsOn">[];
  /** Start date of an earlier candidate in the same batch at the same venue that overlaps, if any. */
  overlapsCandidate: string | null;
};

/** Last day of a candidate from its first day and the preset's duration. */
export function endsOnFor(startsOn: string, durationDays: number): string {
  if (!Number.isInteger(durationDays) || durationDays < 1)
    throw new Error(`Invalid duration: ${durationDays}`);
  return addDays(startsOn, durationDays - 1);
}

/**
 * "Tage zusammenfassen" in "Markt planen" (handwritten notes HN-12): picked days that follow each other become one
 * event (Saturday + Sunday → one two-day event). An event is never shorter than the preset (`minDays`), so a
 * picked day inside a preset-length event joins it instead of starting an overlapping one; a run longer than
 * `maxDays` is split. Dates are ISO days; order and duplicates don't matter.
 */
export function groupConsecutiveDates(
  dates: readonly string[],
  minDays: number,
  maxDays = 14,
): { startsOn: string; durationDays: number }[] {
  const days = [...new Set(dates)].sort();
  const runs: { startsOn: string; durationDays: number }[] = [];
  const span = (from: string, to: string) => {
    let n = 1;
    for (let d = from; d < to; d = addDays(d, 1)) n += 1;
    return n;
  };
  let start: string | null = null;
  let last = "";
  const close = () => {
    if (start) runs.push({ startsOn: start, durationDays: Math.max(span(start, last), minDays) });
  };
  for (const day of days) {
    const covered = start ? endsOnFor(start, Math.max(span(start, last), minDays)) : "";
    if (start && day <= addDays(covered, 1) && span(start, day) <= maxDays) {
      last = day;
      continue;
    }
    close();
    start = day;
    last = day;
  }
  close();
  return runs;
}

function overlaps(
  a: { startsOn: string; endsOn: string },
  b: { startsOn: string; endsOn: string },
) {
  return a.startsOn <= b.endsOn && b.startsOn <= a.endsOn;
}

/**
 * Checks dates picked in "Aus Vorlage erzeugen" against existing events: NRW holidays (stille Feiertage
 * included: markets are mostly not allowed there, FeiertG NW §6), holiday weekends and the same venue already
 * booked (also by an earlier candidate of the same batch). No weekend count: the office plans
 * markets of the same weekend on purpose (user test 2, UT2-11). Warnings never block: the office decides.
 */
export function checkCandidates(
  candidates: Candidate[],
  existing: ScheduledEvent[],
  options: { bundesland?: Bundesland } = {},
): CandidateCheck[] {
  if (candidates.length === 0) return [];
  const sorted = [...candidates].sort((a, b) =>
    a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0,
  );
  const from = sorted[0]?.startsOn as string;
  const to = sorted.reduce((max, c) => (c.endsOn > max ? c.endsOn : max), from);
  const holidays = holidaysBetween(from, to, options.bundesland, { observances: true });
  const weekends = holidayWeekendsBetween(from, to);

  const accepted: Candidate[] = [];
  return sorted.map((candidate) => {
    const venueConflicts = existing
      .filter((e) => e.venueId === candidate.venueId && overlaps(e, candidate))
      .map(({ id, name, startsOn }) => ({ id, name, startsOn }));
    const earlier = accepted.find((c) => c.venueId === candidate.venueId && overlaps(c, candidate));
    accepted.push(candidate);
    const days = eachDay(candidate.startsOn, candidate.endsOn);
    return {
      ...candidate,
      holidays: days.flatMap((day) => {
        const holiday = holidays.get(day);
        return holiday ? [holiday] : [];
      }),
      holidayWeekends: [...new Set(days.flatMap((day) => weekends.get(day) ?? []))],
      venueConflicts,
      overlapsCandidate: earlier?.startsOn ?? null,
    };
  });
}
