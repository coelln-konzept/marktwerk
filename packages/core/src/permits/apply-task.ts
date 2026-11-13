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
const untouched = (t: ApplyTaskCandidate) => t.status === "todo";

/**
 * Splits the template apply tasks that are about to be linked to a permit covering several events into the
 * ones that are linked as they are and the duplicates (which the service removes, the app's "Löschen").
 * The apply work belongs to one "carrier" event; its tasks stay (a template may split applying into several
 * items), the untouched ones of every other event are duplicates.
 *
 * - The carriers are the events of the permit's existing apply tasks (`existingEventIds`; null = its own
 *   task without an event) and of candidates somebody has worked on (in progress, waiting, blocked) or
 *   finished (done / skipped): those always stay, work and history are never thrown away.
 * - Without any, the earliest event is the carrier (the "first covered event" carries the task until the
 *   Saison record exists, research 13 §6).
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
