import { checkFit, type Placement } from "@marktwerk/core";
import type { FixedSpot, StoredPlacement } from "./store";
import type { BookingItem, PlanEvent, PlanRow } from "./types";

/**
 * Festplatzbuchung (spec 2026-11-04, manual/Festplatz): a Festplatz covers every event with the same name
 * and venue in its year. Its placement on each date is derived here when the plan is shown (never copied
 * into the date), so changing or deleting the Festplatz applies everywhere at once.
 */

export const festplatzItemId = (spotId: string, eventId: string) => `fp:${spotId}:${eventId}`;
export const isFestplatzItem = (itemId: string) => itemId.startsWith("fp:");

/** The dates a Festplatz covers: same market name and venue, same calendar year. */
export function seriesEvents(events: PlanEvent[], spot: FixedSpot): PlanEvent[] {
  return events.filter(
    (e) =>
      e.name === spot.seriesName &&
      e.venueId === spot.venueId &&
      e.startsOn.startsWith(`${spot.year}-`),
  );
}

export function spotMatches(ev: PlanEvent, spot: FixedSpot) {
  return (
    ev.name === spot.seriesName &&
    ev.venueId === spot.venueId &&
    ev.startsOn.startsWith(`${spot.year}-`)
  );
}

const asPlacement = (p: StoredPlacement): Placement => ({
  id: p.itemId,
  rowId: p.rowId,
  startCm: p.startCm,
  endCm: p.endCm,
  car: p.car,
});

export type FestplatzState = "placed" | "source" | "optedOut" | "conflict";

/**
 * The Festplatz placements for one event on top of its stored placements. A spot is skipped on the date
 * it was created from (that date keeps its own booking), on opted-out dates, and where the spot is taken
 * (conflict: never double-booked).
 */
export function festplatzOverlay(
  ev: PlanEvent,
  spots: FixedSpot[],
  stored: StoredPlacement[],
  rowsById: Map<string, PlanRow>,
): {
  placements: StoredPlacement[];
  items: BookingItem[];
  states: Map<string, FestplatzState>;
} {
  const placements: StoredPlacement[] = [];
  const items: BookingItem[] = [];
  const states = new Map<string, FestplatzState>();
  for (const spot of spots) {
    if (!spotMatches(ev, spot)) continue;
    if (stored.some((p) => p.itemId === spot.sourceItemId)) {
      states.set(spot.id, "source");
      continue;
    }
    if (spot.optedOut.includes(ev.id)) {
      states.set(spot.id, "optedOut");
      continue;
    }
    const row = rowsById.get(spot.rowId);
    const id = festplatzItemId(spot.id, ev.id);
    const taken =
      !row ||
      checkFit(
        row,
        [...stored, ...placements].map(asPlacement),
        { startCm: spot.startCm, lengthCm: spot.lengthCm, car: spot.car, power: spot.power },
        id,
        null,
      ) !== null;
    if (taken) {
      states.set(spot.id, "conflict");
      continue;
    }
    states.set(spot.id, "placed");
    placements.push({
      itemId: id,
      rowId: spot.rowId,
      startCm: spot.startCm,
      endCm: spot.startCm + spot.lengthCm,
      car: spot.car,
      status: "fixed",
      festplatzId: spot.id,
    });
    items.push({
      id,
      mailId: null,
      eventId: ev.id,
      vendorName: spot.vendorName,
      companyName: spot.companyName,
      email: spot.email,
      phone: spot.phone,
      kind: spot.kind,
      lengthCm: spot.lengthCm,
      carRequested: spot.car,
      carLengthCm: null,
      power: spot.power,
      categories: [],
      preferredRowLabel: null,
      preferredOffsetCm: null,
      preferredRaw: null,
      note: null,
      receivedAt: spot.createdOn,
      requestRef: `Festplatz ${spot.year}`,
      knownVendor: true,
    });
  }
  return { placements, items, states };
}
