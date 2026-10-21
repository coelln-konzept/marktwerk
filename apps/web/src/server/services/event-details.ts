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
import { event, eventAnchor, venue } from "@marktwerk/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { scheduledEventsBetween } from "./events";
import { notifyDatesShifted, planTaskShift, type ShiftedTask, shiftTasks } from "./task-schedule";

export type EventDetailsError =
  | "not_found"
  | "invalid_time"
  | "open_after_close"
  | "close_after_teardown"
  | "setup_after_open"
  | "invalid_price"
  | "invalid_flag"
  | "invalid_date"
  | "invalid_duration"
  | "invalid_name"
  | "invalid_venue"
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
// Schedule: days and venue of an event (decided 2026-10-21: moving recomputes the named dates with a
// preview; name, length and venue are editable with a confirmation)

const MOVED_ANCHORS = ["event_day", "setup_day", "teardown_day", "booking_cutoff"] as const;

/** At most this many days (same limit as presets, db check event_preset_duration). */
export const MAX_DURATION_DAYS = 14;

export type ScheduleChange = { startsOn?: string; durationDays?: number; venueId?: string };

export type EventSchedulePreview = {
  status: EventStatus;
  movable: boolean;
  announced: boolean;
  from: { startsOn: string; endsOn: string };
  to: { startsOn: string; endsOn: string };
  /** Named dates old → new (old is null if the event didn't have it yet). */
  anchors: { key: AnchorKey; from: string | null; to: string }[];
  /** Holidays, venue already booked, weekend cap, for the new days/venue (the event itself excluded). */
  check: CandidateCheck | null;
  /** Open tasks (not done, due date not set by hand) whose due date moves with the named dates. */
  tasksShifting: number;
};

type EventRow = typeof event.$inferSelect;

const durationOf = (e: { startsOn: string; endsOn: string }) =>
  daysBetween(e.startsOn, e.endsOn) + 1;

function target(current: EventRow, change: ScheduleChange) {
  const startsOn = change.startsOn ?? current.startsOn;
  const durationDays = change.durationDays ?? durationOf(current);
  if (!isIsoDate(startsOn)) throw new EventDetailsInputError("invalid_date");
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > MAX_DURATION_DAYS)
    throw new EventDetailsInputError("invalid_duration");
  return {
    startsOn,
    endsOn: addDays(startsOn, durationDays - 1),
    durationDays,
    venueId: change.venueId ?? current.venueId,
  };
}

/** Old anchors by key; older data may lack the teardown anchor (= last event day then, like DatesPanel). */
function oldAnchors(rows: { key: string; date: string }[], current: EventRow) {
  const byKey = new Map(rows.map((a) => [a.key, a.date]));
  if (!byKey.has("teardown_day")) byKey.set("teardown_day", current.endsOn);
  return byKey;
}

/** What a change of days and/or venue would do; nothing is written. */
export async function previewEventSchedule(
  actor: Actor,
  id: string,
  change: ScheduleChange,
): Promise<EventSchedulePreview> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!UUID.test(id)) throw new EventDetailsInputError("not_found");
  if (change.venueId !== undefined && !UUID.test(change.venueId))
    throw new EventDetailsInputError("invalid_venue");
  const current = await db.query.event.findFirst({
    where: and(eq(event.id, id), isNull(event.archivedAt)),
  });
  if (!current) throw new EventDetailsInputError("not_found");
  const next = target(current, change);
  const rows = await db
    .select({ key: eventAnchor.key, date: eventAnchor.date })
    .from(eventAnchor)
    .where(eq(eventAnchor.eventId, id));
  const old = oldAnchors(rows, current);
  const anchors = defaultAnchors(next.startsOn, next.durationDays);
  const unchanged =
    next.startsOn === current.startsOn &&
    next.endsOn === current.endsOn &&
    next.venueId === current.venueId;

  // Weekend load counts the neighbours of the whole weekend, so fetch a little around the dates.
  const existing = unchanged
    ? []
    : (await scheduledEventsBetween(addDays(next.startsOn, -7), addDays(next.endsOn, 7))).filter(
        (e) => e.id !== id,
      );
  const [check] = unchanged
    ? []
    : checkCandidates(
        [{ startsOn: next.startsOn, endsOn: next.endsOn, venueId: next.venueId }],
        existing,
      );

  return {
    status: current.status,
    movable: canMoveEvent(current.status),
    announced: isAnnounced(current.status),
    from: { startsOn: current.startsOn, endsOn: current.endsOn },
    to: { startsOn: next.startsOn, endsOn: next.endsOn },
    anchors: MOVED_ANCHORS.map((key) => ({ key, from: old.get(key) ?? null, to: anchors[key] })),
    check: check ?? null,
    tasksShifting: unchanged
      ? 0
      : (await planTaskShift(db, id, new Map([...old, ...Object.entries(anchors)]))).length,
  };
}

/** "Verschieben": the preview for a new first day. */
export async function previewEventMove(actor: Actor, id: string, startsOn: string) {
  if (!isIsoDate(startsOn)) throw new EventDetailsInputError("invalid_date");
  return previewEventSchedule(actor, id, { startsOn });
}

/**
 * The one place that changes the days of an event (CLAUDE.md: anchor shifts): first/last day, season and
 * the four named dates (booking cut-off = Monday before). Other anchors (custom ones, later the permit
 * decision) stay. Open tasks that follow their anchor (not done, due date not set by hand) get their
 * new due date here too (M2). Returns the anchor diff for the audit entry and the tasks that moved.
 */
async function applySchedule(
  tx: Tx,
  current: EventRow,
  next: { startsOn: string; endsOn: string; durationDays: number },
): Promise<{
  anchors: Record<string, { from: string | null; to: string }>;
  shifted: ShiftedTask[];
}> {
  await tx
    .update(event)
    .set({
      startsOn: next.startsOn,
      endsOn: next.endsOn,
      season: Number(next.startsOn.slice(0, 4)),
    })
    .where(eq(event.id, current.id));
  const rows = await tx
    .select({ key: eventAnchor.key, date: eventAnchor.date })
    .from(eventAnchor)
    .where(eq(eventAnchor.eventId, current.id));
  const old = oldAnchors(rows, current);
  const anchors = defaultAnchors(next.startsOn, next.durationDays);
  const diff: Record<string, { from: string | null; to: string }> = {};
  for (const key of MOVED_ANCHORS) {
    diff[key] = { from: old.get(key) ?? null, to: anchors[key] };
    await tx
      .insert(eventAnchor)
      .values({ eventId: current.id, key, date: anchors[key] })
      .onConflictDoUpdate({
        target: [eventAnchor.eventId, eventAnchor.key],
        set: { date: anchors[key] },
      });
  }
  const shifted = await shiftTasks(tx, current.id, new Map([...old, ...Object.entries(anchors)]));
  return { anchors: diff, shifted };
}

/**
 * "Verschieben": new first day, duration kept. Only until the event runs. `expectedStartsOn` guards
 * against a concurrent move (and makes the undo toast safe). Warnings never block.
 */
export async function moveEvent(
  actor: Actor,
  id: string,
  startsOn: string,
  expectedStartsOn: string,
  options: { undo?: boolean } = {},
): Promise<{ changed: boolean; from: string; to: string; tasksShifted: number }> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!isIsoDate(startsOn)) throw new EventDetailsInputError("invalid_date");

  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    if (current.startsOn !== expectedStartsOn) throw new EventDetailsInputError("conflict");
    if (!canMoveEvent(current.status)) throw new EventDetailsInputError("not_movable");
    if (startsOn === current.startsOn)
      return { changed: false, from: current.startsOn, to: startsOn, tasksShifted: 0 };

    const next = target(current, { startsOn });
    const { anchors, shifted } = await applySchedule(tx, current, next);
    await notifyDatesShifted(tx, actor, current, next, shifted);
    await audit(tx, actor.id, [
      {
        action: "event.move",
        entityType: "event",
        entityId: id,
        diff: {
          from: { startsOn: current.startsOn, endsOn: current.endsOn },
          to: { startsOn: next.startsOn, endsOn: next.endsOn },
          anchors,
          ...(shifted.length > 0 ? { tasksShifted: shifted.length } : {}),
          ...(options.undo ? { undo: true } : {}),
        },
      },
    ]);
    return {
      changed: true,
      from: current.startsOn,
      to: next.startsOn,
      tasksShifted: shifted.length,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Grunddaten: name, length, venue (always confirmed in the UI, decided 2026-10-21)

export const MAX_NAME_LENGTH = 120;

export type EventBasics = { name: string; durationDays: number; venueId: string };

/**
 * "Name, Dauer, Ort" of this event only (the preset stays). A new length keeps the first day and
 * recomputes the named dates through the same path as "Verschieben". `expected` (undo toast) applies the
 * change only while the event still has those values. Audited as "event.update"; the venue change keeps
 * both names so the Verlauf stays readable after a venue is renamed.
 */
export async function updateEventBasics(
  actor: Actor,
  id: string,
  next: EventBasics,
  expected?: EventBasics,
): Promise<{ changed: boolean; previous: EventBasics; tasksShifted: number }> {
  if (!can(actor.role, "event", "write")) forbidden();
  const name = next.name.trim().replace(/\s+/g, " ");
  if (name === "" || name.length > MAX_NAME_LENGTH)
    throw new EventDetailsInputError("invalid_name");
  if (!UUID.test(next.venueId)) throw new EventDetailsInputError("invalid_venue");

  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    const previous: EventBasics = {
      name: current.name,
      durationDays: durationOf(current),
      venueId: current.venueId,
    };
    if (
      expected &&
      (expected.name !== previous.name ||
        expected.durationDays !== previous.durationDays ||
        expected.venueId !== previous.venueId)
    )
      throw new EventDetailsInputError("conflict");

    const schedule = target(current, { durationDays: next.durationDays, venueId: next.venueId });
    const venues = await tx
      .select({ id: venue.id, name: venue.name, archivedAt: venue.archivedAt })
      .from(venue)
      .where(inArray(venue.id, [current.venueId, schedule.venueId]));
    const newVenue = venues.find((v) => v.id === schedule.venueId);
    // An archived venue can't be picked, but an event already there may keep it.
    if (!newVenue || (newVenue.archivedAt && newVenue.id !== current.venueId))
      throw new EventDetailsInputError("invalid_venue");

    const changes: Record<string, Record<string, unknown>> = {};
    if (name !== current.name) changes.name = { from: current.name, to: name };
    if (schedule.durationDays !== previous.durationDays)
      changes.durationDays = { from: previous.durationDays, to: schedule.durationDays };
    if (schedule.venueId !== current.venueId)
      changes.venueId = {
        from: current.venueId,
        to: schedule.venueId,
        fromName: venues.find((v) => v.id === current.venueId)?.name ?? null,
        toName: newVenue.name,
      };
    if (Object.keys(changes).length === 0) return { changed: false, previous, tasksShifted: 0 };

    await tx.update(event).set({ name, venueId: schedule.venueId }).where(eq(event.id, id));
    const applied = changes.durationDays ? await applySchedule(tx, current, schedule) : undefined;
    const anchors = applied?.anchors;
    const shifted = applied?.shifted ?? [];
    if (applied) await notifyDatesShifted(tx, actor, current, schedule, shifted);
    await audit(tx, actor.id, [
      {
        action: "event.update",
        entityType: "event",
        entityId: id,
        diff: {
          changes,
          ...(anchors ? { anchors } : {}),
          ...(shifted.length > 0 ? { tasksShifted: shifted.length } : {}),
          ...(expected ? { undo: true } : {}),
        },
      },
    ]);
    return { changed: true, previous, tasksShifted: shifted.length };
  });
}
