import { REFERENCE_DATE, SEASONS } from "../constants";
import { BOOKING_COMMENTS } from "../dictionaries/texts";
import { addDays, berlinInstant, daysBetween, mondayBefore } from "../lib/dates";
import type { Rng } from "../lib/rng";
import type {
  BookingDate,
  BookingRequest,
  BookingRequestStatus,
  BookingSource,
  Event,
  EventType,
  PaymentStatus,
  Row,
  Vendor,
  Venue,
} from "../types";

export interface BookingContext {
  events: Event[];
  eventTypes: EventType[];
  venues: Venue[];
  vendors: Vendor[];
}

export interface BookingsBundle {
  bookingRequests: BookingRequest[];
  bookingDates: BookingDate[];
  /** Event id → flags derived from the placement run. */
  flagsByEventId: Map<string, { fullyBooked: boolean; carSpacesFull: boolean }>;
}

/** Events that take online bookings in the 2026 season: completed, closed or confirmed flea and antique. */
function bookableEvents(events: Event[], eventTypes: EventType[]): Event[] {
  const keyById = new Map(eventTypes.map((type) => [type.id, type.key]));
  return events
    .filter(
      (event) =>
        event.season === SEASONS[0] &&
        ["completed", "closed", "confirmed"].includes(event.status) &&
        ["flea", "antique"].includes(keyById.get(event.eventTypeId) ?? ""),
    )
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));
}

interface Slot {
  row: Row;
  cursorCm: number;
  carSlotsUsed: number;
}

interface Planned {
  index: number;
  vendor: Vendor;
  request: BookingRequest;
  status: BookingRequestStatus;
}

function pickSource(rng: Rng): BookingSource {
  return rng.pickWeighted([
    { value: "legacy_web" as const, weight: 75 },
    { value: "email" as const, weight: 15 },
    { value: "phone" as const, weight: 10 },
  ]);
}

function paymentFor(
  rng: Rng,
  dueOn: string,
  priceCents: number,
): { status: PaymentStatus; paidOn: string | null; paidAmountCents: number | null } {
  if (dueOn >= REFERENCE_DATE) {
    // Not yet due: a few are already paid, the rest are not due.
    return rng.chance(0.2)
      ? { status: "paid", paidOn: addDays(dueOn, -rng.int(1, 5)), paidAmountCents: priceCents }
      : { status: "not_due", paidOn: null, paidAmountCents: null };
  }
  const overdueDays = daysBetween(dueOn, REFERENCE_DATE);
  // Most vendors pay before the event. Unpaid ones show "open" for a week, then "overdue".
  const unpaidShare = overdueDays <= 14 ? 0.25 : 0.03;
  if (rng.chance(unpaidShare)) {
    return { status: overdueDays <= 7 ? "open" : "overdue", paidOn: null, paidAmountCents: null };
  }
  return { status: "paid", paidOn: addDays(dueOn, -rng.int(0, 5)), paidAmountCents: priceCents };
}

/**
 * Booking requests and booking dates for the bookable events. Each event gets 40–150 requests.
 *
 * Placement is first-fit along the venue's rows, so placements never overlap. Requests that do not fit are
 * waitlisted. Car requests are placed first, so car spaces go to people who asked for them. A car is granted
 * only if it fits the stall (car length ≤ booked length) and the row still has a free car slot.
 */
export function buildBookings(rng: Rng, ctx: BookingContext): BookingsBundle {
  const venueById = new Map(ctx.venues.map((venue) => [venue.id, venue]));
  const keyById = new Map(ctx.eventTypes.map((type) => [type.id, type.key]));
  const fleaPool = ctx.vendors.filter((vendor) =>
    vendor.categories.some((category) => category !== "food"),
  );
  const antiquePool = ctx.vendors.filter((vendor) => vendor.categories.includes("antik"));
  const multiDateDecision = new Map<string, boolean>();
  const multiDateGroupId = new Map<string, string>();
  let legacyCounter = 1;

  /** Vendors who book several dates in a season share one requestGroupId ("Mehrfachbuchung"). */
  const requestGroupFor = (vendorId: string, season: number): string => {
    const key = `${vendorId}|${season}`;
    let multi = multiDateDecision.get(key);
    if (multi === undefined) {
      multi = rng.chance(0.35);
      multiDateDecision.set(key, multi);
    }
    if (!multi) return rng.uuid();
    let group = multiDateGroupId.get(key);
    if (group === undefined) {
      group = rng.uuid();
      multiDateGroupId.set(key, group);
    }
    return group;
  };

  const bookingRequests: BookingRequest[] = [];
  const bookingDates: BookingDate[] = [];
  const flagsByEventId = new Map<string, { fullyBooked: boolean; carSpacesFull: boolean }>();

  for (const event of bookableEvents(ctx.events, ctx.eventTypes)) {
    const venue = venueById.get(event.venueId);
    if (!venue) throw new Error(`Event ${event.id} references an unknown venue`);
    const pool = keyById.get(event.eventTypeId) === "antique" ? antiquePool : fleaPool;
    const regulars = rng.shuffle(pool.filter((vendor) => vendor.isRegular));
    const others = rng.shuffle(pool.filter((vendor) => !vendor.isRegular));
    const requestCount = rng.int(40, 150);

    // Regulars come first about 70 % of the time, the rest is a random mix of other vendors.
    const chosen: Vendor[] = [];
    while (chosen.length < requestCount && (regulars.length > 0 || others.length > 0)) {
      const useRegular = regulars.length > 0 && (rng.chance(0.7) || others.length === 0);
      const next = useRegular ? regulars.pop() : others.pop();
      if (next) chosen.push(next);
    }

    // Phase 1: decide each request's outcome before placement.
    const planned: Planned[] = chosen.map((vendor, index) => {
      const lengthCm = rng.chance(0.85)
        ? vendor.defaultLengthCm
        : Math.min(800, Math.max(200, vendor.defaultLengthCm + rng.pick([-100, -50, 50, 100])));
      const carRequested = vendor.hasCar && rng.chance(0.8);
      const regularNote =
        vendor.isRegular && vendor.regularSpot !== null && rng.chance(0.3)
          ? `Stammplatz: ${vendor.regularSpot}`
          : null;
      const source = pickSource(rng);
      const legacyRef =
        source === "legacy_web"
          ? `WEB-${event.season}-${String(legacyCounter++).padStart(6, "0")}`
          : null;
      const messageId = source === "email" ? `<${rng.uuid()}@example.org>` : null;
      const upcoming = event.startsOn >= REFERENCE_DATE;
      let status: BookingRequestStatus = "accepted";
      if (rng.chance(0.04)) status = "withdrawn";
      else if (upcoming && rng.chance(0.1)) status = "new";
      return {
        index,
        vendor,
        status,
        request: {
          id: rng.uuid(),
          requestGroupId: requestGroupFor(vendor.id, event.season),
          eventId: event.id,
          vendorId: vendor.id,
          source,
          legacyRef,
          messageId,
          status,
          submittedAt: berlinInstant(addDays(event.startsOn, -rng.int(20, 120)), "10:00"),
          lengthCm,
          carRequested,
          comment: regularNote ?? (rng.chance(0.12) ? rng.pick(BOOKING_COMMENTS) : null),
        },
      };
    });

    // Phase 2: first-fit placement, car requests first.
    const rows = venue.zones.flatMap((zone) => zone.rows);
    const slots = rows.map((row): Slot => ({ row, cursorCm: 0, carSlotsUsed: 0 }));
    const placeOrder = planned
      .filter((entry) => entry.status === "accepted")
      .sort(
        (a, b) =>
          Number(b.request.carRequested) - Number(a.request.carRequested) || a.index - b.index,
      );
    const finalStatus = new Map<number, BookingRequestStatus>();
    const placedDate = new Map<number, BookingDate>();
    let waitlisted = 0;
    let carSoldOut = 0;

    for (const entry of placeOrder) {
      const { request, vendor } = entry;
      const lengthCm = request.lengthCm;
      const carLength = vendor.carLengthCm;
      const carFits = (slot: Slot): boolean =>
        request.carRequested &&
        slot.row.carAllowed &&
        slot.carSlotsUsed < slot.row.carSlots &&
        carLength !== null &&
        carLength <= lengthCm;
      const fits = (slot: Slot): boolean => slot.cursorCm + lengthCm <= slot.row.lengthCm;

      const chosenSlot = slots.find((slot) => fits(slot) && carFits(slot)) ?? slots.find(fits);
      if (!chosenSlot) {
        waitlisted += 1;
        finalStatus.set(entry.index, "waitlisted");
        continue;
      }

      const startCm = chosenSlot.cursorCm;
      const endCm = startCm + lengthCm;
      chosenSlot.cursorCm = endCm;
      const carGranted = carFits(chosenSlot);
      if (carGranted) chosenSlot.carSlotsUsed += 1;
      // "Car spaces sold out" only when a car would have fitted but no slot was left.
      if (request.carRequested && !carGranted && carLength !== null && carLength <= lengthCm)
        carSoldOut += 1;

      const priceCents =
        Math.round((lengthCm * event.pricePerMCents) / 100) + event.bookingFeeCents;
      const dueOn = mondayBefore(event.startsOn);
      const payment = paymentFor(rng, dueOn, priceCents);
      placedDate.set(entry.index, {
        id: rng.uuid(),
        bookingRequestId: request.id,
        eventId: event.id,
        vendorId: vendor.id,
        lengthCm,
        carRequested: request.carRequested,
        carGranted,
        carLengthCm: request.carRequested ? carLength : null,
        pricePerMCents: event.pricePerMCents,
        bookingFeeCents: event.bookingFeeCents,
        priceCents,
        placementStatus: "assigned",
        rowId: chosenSlot.row.id,
        startCm,
        endCm,
        paymentStatus: payment.status,
        paymentDueOn: dueOn,
        paidOn: payment.paidOn,
        paidAmountCents: payment.paidAmountCents,
        attendance:
          event.startsOn < REFERENCE_DATE ? (rng.chance(0.03) ? "no_show" : "checked_in") : null,
      });
    }

    // Phase 3: write requests and dates in their original order.
    for (const entry of planned) {
      const status = finalStatus.get(entry.index) ?? entry.status;
      bookingRequests.push({ ...entry.request, status });
      const date = placedDate.get(entry.index);
      if (date) bookingDates.push(date);
    }

    flagsByEventId.set(event.id, { fullyBooked: waitlisted > 0, carSpacesFull: carSoldOut > 0 });
  }

  return { bookingRequests, bookingDates, flagsByEventId };
}
