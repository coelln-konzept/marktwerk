import { addDays, eachDay, weekendsTouched } from "../dates/calendar";
import { type Bundesland, type Holiday, holidaysBetween } from "../dates/holidays";

/** Business rule from the client meeting: at most this many events on one weekend. */
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
  /** Holidays on any day of the candidate. */
  holidays: Holiday[];
  /** Existing events at the same venue overlapping any day of the candidate. */
  venueConflicts: Pick<ScheduledEvent, "id" | "name" | "startsOn">[];
  /** Start date of an earlier candidate in the same batch at the same venue that overlaps, if any. */
  overlapsCandidate: string | null;
  /** For each weekend touched (keyed by Saturday): how many events it has including this candidate. */
  weekendLoad: { saturday: string; count: number }[];
  /** True if any touched weekend would exceed the cap. */
  overWeekendCap: boolean;
};

/** Last day of a candidate from its first day and the preset's duration. */
export function endsOnFor(startsOn: string, durationDays: number): string {
  if (!Number.isInteger(durationDays) || durationDays < 1)
    throw new Error(`Invalid duration: ${durationDays}`);
  return addDays(startsOn, durationDays - 1);
}

function overlaps(
  a: { startsOn: string; endsOn: string },
  b: { startsOn: string; endsOn: string },
) {
  return a.startsOn <= b.endsOn && b.startsOn <= a.endsOn;
}

/**
 * Checks dates picked in "Aus Vorlage erzeugen" against existing events: NRW holidays, the same venue
 * already booked, and the weekend cap. Candidates are checked in date order and count against each
 * other, so picking five Sundays in one weekend flags the fifth. Warnings never block: the office decides.
 */
export function checkCandidates(
  candidates: Candidate[],
  existing: ScheduledEvent[],
  options: { maxPerWeekend?: number; bundesland?: Bundesland } = {},
): CandidateCheck[] {
  const cap = options.maxPerWeekend ?? MAX_EVENTS_PER_WEEKEND;
  if (candidates.length === 0) return [];
  const sorted = [...candidates].sort((a, b) =>
    a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0,
  );
  const from = sorted[0]?.startsOn as string;
  const to = sorted.reduce((max, c) => (c.endsOn > max ? c.endsOn : max), from);
  const holidays = holidaysBetween(from, to, options.bundesland);

  const weekendCount = new Map<string, number>();
  for (const event of existing) {
    for (const saturday of weekendsTouched(event.startsOn, event.endsOn)) {
      weekendCount.set(saturday, (weekendCount.get(saturday) ?? 0) + 1);
    }
  }

  const accepted: Candidate[] = [];
  return sorted.map((candidate) => {
    const weekendLoad = weekendsTouched(candidate.startsOn, candidate.endsOn).map((saturday) => {
      const count = (weekendCount.get(saturday) ?? 0) + 1;
      weekendCount.set(saturday, count);
      return { saturday, count };
    });
    const venueConflicts = existing
      .filter((e) => e.venueId === candidate.venueId && overlaps(e, candidate))
      .map(({ id, name, startsOn }) => ({ id, name, startsOn }));
    const earlier = accepted.find((c) => c.venueId === candidate.venueId && overlaps(c, candidate));
    accepted.push(candidate);
    return {
      ...candidate,
      holidays: eachDay(candidate.startsOn, candidate.endsOn).flatMap((day) => {
        const holiday = holidays.get(day);
        return holiday ? [holiday] : [];
      }),
      venueConflicts,
      overlapsCandidate: earlier?.startsOn ?? null,
      weekendLoad,
      overWeekendCap: weekendLoad.some((w) => w.count > cap),
    };
  });
}
