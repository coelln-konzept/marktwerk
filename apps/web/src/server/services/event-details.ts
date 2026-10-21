import "server-only";
import {
  type AnchorKey,
  addDays,
  type CandidateCheck,
  can,
  canMoveEvent,
  checkCandidates,
  checkEventTimes,
  daysBetween,
  defaultAnchors,
  type EventTimesInput,
  isAnnounced,
  isIsoDate,
  MAX_PRICE_CENTS,
} from "@marktwerk/core";
import type { EventStatus } from "@marktwerk/core/events/lifecycle";
import { event, eventAnchor } from "@marktwerk/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { scheduledEventsBetween } from "./events";

export type EventDetailsError =
  | "not_found"
  | "invalid_time"
  | "open_after_close"
  | "close_after_teardown"
  | "setup_after_open"
  | "invalid_price"
  | "invalid_flag"
  | "invalid_date"
  | "not_movable"
  | "conflict";

export class EventDetailsInputError extends Error {
  constructor(readonly code: EventDetailsError) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;

async function lockEvent(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new EventDetailsInputError("not_found");
  const [row] = await tx
    .select()
    .from(event)
    .where(and(eq(event.id, id), isNull(event.archivedAt)))
    .for("update");
  if (!row) throw new EventDetailsInputError("not_found");
  return row;
}

// ---------------------------------------------------------------------------------------------
// Eckdaten: times and prices

export type EventFacts = {
  times: EventTimesInput;
  pricePerMCents: number;
  bookingFeeCents: number;
};

const sameTimes = (a: EventTimesInput, b: EventTimesInput) =>
  a.setup === b.setup && a.open === b.open && a.close === b.close && a.teardown === b.teardown;

const validPrice = (cents: number) =>
  Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_PRICE_CENTS;

/**
 * "Eckdaten bearbeiten": times of the event day and prices, for this event only (the preset stays).
 * `expected` (undo toast) applies the change only while the event still has those values.
 * Audited as "event.update" with {field: {from, to}} for the fields that changed.
 */
export async function updateEventFacts(
  actor: Actor,
  id: string,
  next: EventFacts,
  expected?: EventFacts,
): Promise<{ changed: boolean; previous: EventFacts }> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!validPrice(next.pricePerMCents) || !validPrice(next.bookingFeeCents))
    throw new EventDetailsInputError("invalid_price");
  const times: EventTimesInput = {
    setup: next.times.setup,
    open: next.times.open,
    close: next.times.close,
    teardown: next.times.teardown,
  };

  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    const timesError = checkEventTimes(times, current.endsOn !== current.startsOn);
    if (timesError) throw new EventDetailsInputError(timesError);
    const previous: EventFacts = {
      times: current.times,
      pricePerMCents: current.pricePerMCents,
      bookingFeeCents: current.bookingFeeCents,
    };
    if (
      expected &&
      !(
        sameTimes(previous.times, expected.times) &&
        previous.pricePerMCents === expected.pricePerMCents &&
        previous.bookingFeeCents === expected.bookingFeeCents
      )
    )
      throw new EventDetailsInputError("conflict");

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (!sameTimes(previous.times, times)) changes.times = { from: previous.times, to: times };
    if (previous.pricePerMCents !== next.pricePerMCents)
      changes.pricePerMCents = { from: previous.pricePerMCents, to: next.pricePerMCents };
    if (previous.bookingFeeCents !== next.bookingFeeCents)
      changes.bookingFeeCents = { from: previous.bookingFeeCents, to: next.bookingFeeCents };
    if (Object.keys(changes).length === 0) return { changed: false, previous };

    await tx
      .update(event)
      .set({
        times,
        pricePerMCents: next.pricePerMCents,
        bookingFeeCents: next.bookingFeeCents,
      })
      .where(eq(event.id, id));
    await audit(tx, actor.id, [
      {
        action: "event.update",
        entityType: "event",
        entityId: id,
        diff: { changes, ...(expected ? { undo: true } : {}) },
      },
    ]);
    return { changed: true, previous };
  });
}

// ---------------------------------------------------------------------------------------------
// Booking flags

export const BOOKING_FLAGS = ["bookingOpen", "fullyBooked", "carSpacesFull"] as const;
export type BookingFlag = (typeof BOOKING_FLAGS)[number];

const isBookingFlag = (value: string): value is BookingFlag =>
  (BOOKING_FLAGS as readonly string[]).includes(value);

/** One booking flag (buchbar / ausgebucht / Autoplätze voll). Audited as "event.booking". */
export async function setEventBookingFlag(
  actor: Actor,
  id: string,
  flag: string,
  value: boolean,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!isBookingFlag(flag) || typeof value !== "boolean")
    throw new EventDetailsInputError("invalid_flag");
  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    if (current[flag] === value) return { changed: false };
    const patch =
      flag === "bookingOpen"
        ? { bookingOpen: value }
        : flag === "fullyBooked"
          ? { fullyBooked: value }
          : { carSpacesFull: value };
    await tx.update(event).set(patch).where(eq(event.id, id));
    await audit(tx, actor.id, [
      {
        action: "event.booking",
        entityType: "event",
        entityId: id,
        diff: { flag, from: current[flag], to: value },
      },
    ]);
    return { changed: true };
  });
}

// ---------------------------------------------------------------------------------------------
// Moving an event to another date (decided 2026-10-21: recompute the named dates, with a preview)

const MOVED_ANCHORS = ["event_day", "setup_day", "teardown_day", "booking_cutoff"] as const;

export type EventMovePreview = {
  status: EventStatus;
  movable: boolean;
  announced: boolean;
  from: { startsOn: string; endsOn: string };
  to: { startsOn: string; endsOn: string };
  /** Named dates old → new (old is null if the event didn't have it yet). */
  anchors: { key: AnchorKey; from: string | null; to: string }[];
  /** Holidays, venue already booked, weekend cap, for the new dates (the event itself excluded). */
  check: CandidateCheck | null;
};

function moveTarget(current: { startsOn: string; endsOn: string }, startsOn: string) {
  const durationDays = daysBetween(current.startsOn, current.endsOn) + 1;
  return { startsOn, endsOn: addDays(startsOn, durationDays - 1), durationDays };
}

/** What "Verschieben" would do; nothing is written. */
export async function previewEventMove(
  actor: Actor,
  id: string,
  startsOn: string,
): Promise<EventMovePreview> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!isIsoDate(startsOn)) throw new EventDetailsInputError("invalid_date");
  if (!UUID.test(id)) throw new EventDetailsInputError("not_found");
  const current = await db.query.event.findFirst({
    where: and(eq(event.id, id), isNull(event.archivedAt)),
  });
  if (!current) throw new EventDetailsInputError("not_found");
  const target = moveTarget(current, startsOn);
  const anchors = await db
    .select({ key: eventAnchor.key, date: eventAnchor.date })
    .from(eventAnchor)
    .where(eq(eventAnchor.eventId, id));
  const old = new Map(anchors.map((a) => [a.key, a.date]));
  // Older data may lack the teardown anchor: the last event day is the teardown day then (DatesPanel).
  if (!old.has("teardown_day")) old.set("teardown_day", current.endsOn);
  const next = defaultAnchors(target.startsOn, target.durationDays);
  const unchanged = target.startsOn === current.startsOn;

  // Weekend load counts the neighbours of the whole weekend, so fetch a little around the dates.
  const existing = unchanged
    ? []
    : (
        await scheduledEventsBetween(addDays(target.startsOn, -7), addDays(target.endsOn, 7))
      ).filter((e) => e.id !== id);
  const [check] = unchanged
    ? []
    : checkCandidates(
        [{ startsOn: target.startsOn, endsOn: target.endsOn, venueId: current.venueId }],
        existing,
      );

  return {
    status: current.status,
    movable: canMoveEvent(current.status),
    announced: isAnnounced(current.status),
    from: { startsOn: current.startsOn, endsOn: current.endsOn },
    to: { startsOn: target.startsOn, endsOn: target.endsOn },
    anchors: MOVED_ANCHORS.map((key) => ({ key, from: old.get(key) ?? null, to: next[key] })),
    check: check ?? null,
  };
}

/**
 * The one service path for moving an event (CLAUDE.md: anchor shifts). Keeps the duration, recomputes the
 * four named dates (booking cut-off = Monday before again) and the season. Only until the event runs.
 * `expectedStartsOn` guards against a concurrent move (and makes the undo toast safe). Other anchors
 * (custom ones, later the permit decision) stay. Warnings never block. M2 extends this: open,
 * non-overridden tasks follow their anchors, with a preview (roadmap).
 */
export async function moveEvent(
  actor: Actor,
  id: string,
  startsOn: string,
  expectedStartsOn: string,
  options: { undo?: boolean } = {},
): Promise<{ changed: boolean; from: string; to: string }> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!isIsoDate(startsOn)) throw new EventDetailsInputError("invalid_date");

  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    if (current.startsOn !== expectedStartsOn) throw new EventDetailsInputError("conflict");
    if (!canMoveEvent(current.status)) throw new EventDetailsInputError("not_movable");
    if (startsOn === current.startsOn)
      return { changed: false, from: current.startsOn, to: startsOn };

    const target = moveTarget(current, startsOn);
    await tx
      .update(event)
      .set({
        startsOn: target.startsOn,
        endsOn: target.endsOn,
        season: Number(target.startsOn.slice(0, 4)),
      })
      .where(eq(event.id, id));

    const old = await tx
      .select({ key: eventAnchor.key, date: eventAnchor.date })
      .from(eventAnchor)
      .where(eq(eventAnchor.eventId, id));
    const oldByKey = new Map(old.map((a) => [a.key, a.date]));
    if (!oldByKey.has("teardown_day")) oldByKey.set("teardown_day", current.endsOn);
    const next = defaultAnchors(target.startsOn, target.durationDays);
    const anchorDiff: Record<string, { from: string | null; to: string }> = {};
    for (const key of MOVED_ANCHORS) {
      const from = oldByKey.get(key) ?? null;
      anchorDiff[key] = { from, to: next[key] };
      await tx
        .insert(eventAnchor)
        .values({ eventId: id, key, date: next[key] })
        .onConflictDoUpdate({
          target: [eventAnchor.eventId, eventAnchor.key],
          set: { date: next[key] },
        });
    }

    await audit(tx, actor.id, [
      {
        action: "event.move",
        entityType: "event",
        entityId: id,
        diff: {
          from: { startsOn: current.startsOn, endsOn: current.endsOn },
          to: { startsOn: target.startsOn, endsOn: target.endsOn },
          anchors: anchorDiff,
          ...(options.undo ? { undo: true } : {}),
        },
      },
    ]);
    return { changed: true, from: current.startsOn, to: target.startsOn };
  });
}
