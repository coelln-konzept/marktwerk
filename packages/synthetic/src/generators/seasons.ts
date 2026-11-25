import {
  expectedStartFromLastSeason,
  initialSeasonStatus,
  type SeasonEventDates,
  seasonAnchors,
  seasonStart,
} from "@marktwerk/core";
import type { Clock } from "../lib/clock";
import type { Rng } from "../lib/rng";
import type { Event, EventPreset, EventSeason, EventSeasonAnchor } from "../types";

export interface SeasonBundle {
  eventSeasons: EventSeason[];
  eventSeasonAnchors: EventSeasonAnchor[];
  /** The Saison record of a market and year (every market has one for both seasons). */
  seasonIdOf: (presetId: string, season: number) => string;
}

/**
 * One Saison record per market and season (research 13 §6), as the nightly `event-seasons` job and
 * `ensureEventSeasonTx` would have made them, by the same rules from @marktwerk/core:
 * - `expectedStart`: the previous season's first non-cancelled date moved to the same weekday and ISO week, or
 *   1 January when the dataset has no previous season (`expectedStartFromLastSeason`);
 * - anchors `seasonStart` (first non-cancelled date, else `expectedStart`) and `seasonEnd` (last day of the last
 *   non-cancelled event; no row without one) (`seasonAnchors`);
 * - `status` from the dates as of the reference date: `closed` once the last date has passed, else `dates_set`, or
 *   `planning` without dates (`initialSeasonStatus`).
 * Every market gets a record for the current and the next season, so the job finds both and creates nothing.
 */
export function buildSeasons(
  rng: Rng,
  presets: readonly EventPreset[],
  events: readonly Event[],
  clock: Clock,
): SeasonBundle {
  const datesOf = (presetId: string, season: number): SeasonEventDates[] =>
    events
      .filter((e) => e.presetId === presetId && e.season === season)
      .map((e) => ({ startsOn: e.startsOn, endsOn: e.endsOn, status: e.status }));

  const eventSeasons: EventSeason[] = [];
  const eventSeasonAnchors: EventSeasonAnchor[] = [];
  const idByKey = new Map<string, string>();
  for (const preset of presets) {
    for (const season of [clock.season, clock.nextSeason]) {
      const dates = datesOf(preset.id, season);
      const previous = datesOf(preset.id, season - 1);
      // seasonStart without an expected start: the first non-cancelled date, or null without one.
      const lastSeasonFirst = previous.some((e) => e.status !== "cancelled")
        ? seasonStart(previous, "")
        : null;
      const expectedStart = expectedStartFromLastSeason(lastSeasonFirst, season);
      const record: EventSeason = {
        id: rng.uuid(),
        presetId: preset.id,
        season,
        expectedStart,
        status: initialSeasonStatus(dates, clock.today),
        notes: null,
      };
      eventSeasons.push(record);
      idByKey.set(`${preset.id}|${season}`, record.id);
      const anchors = seasonAnchors(dates, expectedStart);
      eventSeasonAnchors.push({
        id: rng.uuid(),
        seasonId: record.id,
        key: "seasonStart",
        date: anchors.season_start,
      });
      if (anchors.season_end !== null)
        eventSeasonAnchors.push({
          id: rng.uuid(),
          seasonId: record.id,
          key: "seasonEnd",
          date: anchors.season_end,
        });
    }
  }
  return {
    eventSeasons,
    eventSeasonAnchors,
    seasonIdOf: (presetId, season) => {
      const id = idByKey.get(`${presetId}|${season}`);
      if (id === undefined) throw new Error(`No Saison record for ${presetId} ${season}`);
      return id;
    },
  };
}
