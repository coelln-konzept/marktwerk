import type { PermitCadence } from "./status";

/**
 * One apply task per permit (research 10, Fahrplan 18). A permit that covers several events (season, year,
 * multi-year, standing) is applied for once, so it gets one "beantragen" task, not one per covered market.
 * Single-event permits keep one per event. A permit without a requirement (cadence unknown) counts as a
 * single-event one. Pure.
 */
export function permitCoversSeveralEvents(cadence: PermitCadence | null | undefined): boolean {
  return cadence != null && cadence !== "per_event";
}

export type ApplyTaskCandidate = {
  id: string;
  status: string;
  /** The event the task belongs to; null for a task without an event. */
  eventId: string | null;
  /** First day of that event; null for a task without an event. */
  startsOn: string | null;
};

/** Only a task nobody has touched yet (`todo`) can be a duplicate; worked-on and finished ones always stay. */
const untouched = (t: { status: string }) => t.status === "todo";

/**
 * Splits the template apply tasks that are about to be linked to a permit covering several events into the
 * ones that are linked as they are and the duplicates (which the service removes, the app's "Löschen").
 * The apply work belongs to one "carrier" event; its tasks stay (a template may split applying into several
 * items), the untouched ones of every other event are duplicates.
 *
 * - The carriers are the events of the permit's existing apply tasks (`existingEventIds`; null = its own
 *   task without an event) and of candidates somebody has worked on (in progress, waiting, blocked) or
 *   finished (done / skipped): those always stay, work and history are never thrown away.
 * - Without any, the earliest event is the carrier (the "first covered event" carries the task). Since the Saison
 *   record (Fahrplan R11) this is the fallback for markets without season items; see {@link seasonApplyDuplicates}.
 */
export function splitApplyTasks<T extends ApplyTaskCandidate>(
  candidates: readonly T[],
  existingEventIds: readonly (string | null)[],
): { keep: T[]; duplicates: T[] } {
  const fresh = candidates
    .filter(untouched)
    .sort(
      (a, b) =>
        (a.startsOn ?? "9999-12-31").localeCompare(b.startsOn ?? "9999-12-31") ||
        a.id.localeCompare(b.id),
    );
  const carriers = new Set<string | null>([
    ...existingEventIds,
    ...candidates.filter((t) => !untouched(t)).map((t) => t.eventId),
  ]);
  if (carriers.size === 0 && fresh[0]) carriers.add(fresh[0].eventId);
  const keep = candidates.filter((t) => !untouched(t) || carriers.has(t.eventId));
  return { keep, duplicates: fresh.filter((t) => !carriers.has(t.eventId)) };
}

export type SeasonApplyCandidate = {
  id: string;
  status: string;
  /** The Saison record the task belongs to; null for event tasks and the permit's own task. */
  seasonId: string | null;
};

/**
 * One apply task per season permit, the season task (research 13 §6.1, Fahrplan R11). A permit that covers several
 * events and belongs to a Saison record (`permit.season_id`) is applied for by that season's task ("Genehmigung
 * beantragen", a season item with a `permit_type`). `tasks` are all apply tasks of the permit that are not deleted:
 * season tasks, template tasks of its events and its own "beantragen" task.
 *
 * - When a task of the permit's own season is among them, that season carries the work: every untouched (`todo`)
 *   task of anyone else is a duplicate (event tasks, the own task, the season task of a later year that a
 *   multi-year permit covers). Tasks somebody has worked on or finished always stay.
 * - Otherwise (a permit without a record, a market without season items) the result is null and the interim
 *   rule applies ({@link splitApplyTasks}: the first covered event carries it).
 * Pure.
 */
export function seasonApplyDuplicates<T extends SeasonApplyCandidate>(
  tasks: readonly T[],
  permitSeasonId: string | null | undefined,
): T[] | null {
  if (!permitSeasonId || !tasks.some((t) => t.seasonId === permitSeasonId)) return null;
  return tasks.filter((t) => untouched(t) && t.seasonId !== permitSeasonId);
}
