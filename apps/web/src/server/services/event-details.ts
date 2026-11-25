import "server-only";
import {
  type AnchorKey,
  addDays,
  berlinDay,
  type CandidateCheck,
  CLOSED_TASK_STATUSES,
  can,
  canMoveEvent,
  checkCandidates,
  daysBetween,
  defaultAnchors,
  isAnnounced,
  isEventDateInRange,
  isIsoDate,
  MAX_PRICE_CENTS,
  parseSchedule,
  type Schedule,
  sameSchedule,
  validateSchedule,
} from "@marktwerk/core";
import type { EventStatus } from "@marktwerk/core/events/lifecycle";
import {
  event,
  eventAnchor,
  eventPermit,
  eventType,
  permit,
  staffMember,
  task,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "../../lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { scheduledEventsBetween } from "./events";
import { ensureSeasonsTx, planSeasonShiftForMove, syncSeasonsTx } from "./seasons";
import {
  notifyDatesShifted,
  planTaskShift,
  retractDatesShifted,
  type ShiftedTask,
  shiftedTaskRecipients,
  shiftTasks,
} from "./task-schedule";

export type EventDetailsError =
  | "not_found"
  /** The Zeitplan has an issue (the dialog shows the row issues from validateSchedule). */
  | "invalid_schedule"
  | "invalid_price"
  | "invalid_flag"
  | "invalid_date"
  /** A new first day outside last year … five years ahead (`eventDateRange`, UX-041). */
  | "out_of_range"
  | "invalid_duration"
  | "invalid_name"
  | "invalid_venue"
  | "invalid_type"
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
// Eckdaten: Zeitplan and prices

export type EventFacts = {
  /** The event's Zeitplan (ADR 0022). */
  schedule: Schedule;
  pricePerMCents: number;
  bookingFeeCents: number;
};

const validPrice = (cents: number) =>
  Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_PRICE_CENTS;

/**
 * "Eckdaten bearbeiten": the Zeitplan and prices, for this event only (the market stays). The Zeitplan
 * is checked with validateSchedule for the event's length. `expected` (undo toast) applies the change
 * only while the event still has those values.
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
  const schedule = parseSchedule(next.schedule);
  if (!schedule) throw new EventDetailsInputError("invalid_schedule");
  const expectedSchedule = expected ? parseSchedule(expected.schedule) : null;
  if (expected && !expectedSchedule) throw new EventDetailsInputError("conflict");

  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    const durationDays = daysBetween(current.startsOn, current.endsOn) + 1;
    if (validateSchedule(schedule, durationDays).length > 0)
      throw new EventDetailsInputError("invalid_schedule");
    const previous: EventFacts = {
      schedule: current.schedule,
      pricePerMCents: current.pricePerMCents,
      bookingFeeCents: current.bookingFeeCents,
    };
    if (
      expected &&
      !(
        sameSchedule(previous.schedule, expectedSchedule ?? []) &&
        previous.pricePerMCents === expected.pricePerMCents &&
        previous.bookingFeeCents === expected.bookingFeeCents
      )
    )
      throw new EventDetailsInputError("conflict");

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (!sameSchedule(previous.schedule, schedule))
      changes.schedule = { from: previous.schedule, to: schedule };
    if (previous.pricePerMCents !== next.pricePerMCents)
      changes.pricePerMCents = { from: previous.pricePerMCents, to: next.pricePerMCents };
    if (previous.bookingFeeCents !== next.bookingFeeCents)
      changes.bookingFeeCents = { from: previous.bookingFeeCents, to: next.bookingFeeCents };
    if (Object.keys(changes).length === 0) return { changed: false, previous };

    await tx
      .update(event)
      .set({
        schedule,
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
  /** Those tasks with their due day before and after (new day first), for the preview list. */
  shifting: { id: string; title: string; from: string | null; to: string; overdue: boolean }[];
  /** How many of them would be overdue after the change (new due day before today). */
  tasksOverdueAfter: number;
  /**
   * Season tasks (research 13 §6.2) whose due date moves because the season's first or last date changes, same
   * shape as `shifting`; not part of `tasksShifting`.
   */
  seasonShifting: {
    id: string;
    title: string;
    from: string | null;
    to: string;
    overdue: boolean;
  }[];
  /**
   * Open tasks with a due date that stay where they are (UX-046): set by hand (`manual`) or without a rule
   * (`noRule`); `afterEnd` of them fall after the new last day.
   */
  kept: { manual: number; noRule: number; afterEnd: number };
  /** Names of the people told in-app about their moved tasks (never the person who moves). */
  notified: string[];
  /**
   * Permits of this event still to apply for: their "Antrag bis" stays as it is (UX-D3 is open), so the
   * preview names them instead of letting the deadline stay silently.
   */
  permitsKept: { id: string; title: string; applyBy: string }[];
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
  const endsOn = addDays(startsOn, durationDays - 1);
  // An old event near the end of year 9999 must not overflow into an invalid date (UX-041).
  if (!isIsoDate(endsOn)) throw new EventDetailsInputError("invalid_date");
  return { startsOn, endsOn, durationDays, venueId: change.venueId ?? current.venueId };
}

/** A new first day picked in "Verschieben" must lie in the plausible range (UX-041; the undo may go back). */
function checkNewFirstDay(startsOn: string) {
  if (!isIsoDate(startsOn)) throw new EventDetailsInputError("invalid_date");
  if (!isEventDateInRange(startsOn, todayIn())) throw new EventDetailsInputError("out_of_range");
}

/** Open, dated tasks of the event that a change of dates leaves where they are (not in `shifted`). */
async function keptTasks(eventId: string, shifted: ShiftedTask[], endsOn: string) {
  const moving = shifted.map((s) => s.id);
  const rows = await db
    .select({
      dueAt: task.dueAt,
      dueOverridden: task.dueOverridden,
      anchorKey: task.anchorKey,
      offsetDays: task.offsetDays,
    })
    .from(task)
    .where(
      and(
        eq(task.eventId, eventId),
        isNotNull(task.dueAt),
        notInArray(task.status, [...CLOSED_TASK_STATUSES]),
        moving.length > 0 ? notInArray(task.id, moving) : undefined,
      ),
    );
  const kept = { manual: 0, noRule: 0, afterEnd: 0 };
  for (const r of rows) {
    if (r.dueOverridden) kept.manual++;
    else if (r.anchorKey === null || r.offsetDays === null) kept.noRule++;
    else continue; // follows its anchor, the date just stays the same
    if (r.dueAt && berlinDay(r.dueAt) > endsOn) kept.afterEnd++;
  }
  return kept;
}

/** Permits of the event not applied for yet, with their "Antrag bis" (which a move leaves as it is). */
async function permitsToApply(eventId: string) {
  const rows = await db
    .select({ id: permit.id, title: permit.title, applyBy: permit.applyBy })
    .from(eventPermit)
    .innerJoin(permit, eq(permit.id, eventPermit.permitId))
    .where(
      and(
        eq(eventPermit.eventId, eventId),
        isNull(permit.archivedAt),
        isNotNull(permit.applyBy),
        inArray(permit.status, ["not_started", "preparing"]),
      ),
    )
    .orderBy(asc(permit.applyBy), asc(permit.title));
  return rows.flatMap((r) => (r.applyBy ? [{ id: r.id, title: r.title, applyBy: r.applyBy }] : []));
}

async function staffNames(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ name: staffMember.displayName })
    .from(staffMember)
    .where(inArray(staffMember.id, ids));
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b, "de"));
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

  const shifted = unchanged
    ? []
    : await planTaskShift(db, { eventId: id }, new Map([...old, ...Object.entries(anchors)]));
  const seasonShifted = unchanged
    ? []
    : await planSeasonShiftForMove(db, current, { startsOn: next.startsOn, endsOn: next.endsOn });
  const today = todayIn();
  const toRows = (list: ShiftedTask[]) =>
    list
      .map((s) => {
        const to = berlinDay(s.to);
        return {
          id: s.id,
          title: s.title,
          from: s.from ? berlinDay(s.from) : null,
          to,
          overdue: to < today,
        };
      })
      .sort((a, b) => a.to.localeCompare(b.to) || a.title.localeCompare(b.title, "de"));
  const shifting = toRows(shifted);
  const datesChange = next.startsOn !== current.startsOn || next.endsOn !== current.endsOn;
  const [kept, notified, permitsKept] = datesChange
    ? await Promise.all([
        keptTasks(id, shifted, next.endsOn),
        staffNames(shiftedTaskRecipients(actor, shifted)),
        next.startsOn !== current.startsOn ? permitsToApply(id) : [],
      ])
    : [{ manual: 0, noRule: 0, afterEnd: 0 }, [], []];

  return {
    status: current.status,
    movable: canMoveEvent(current.status),
    announced: isAnnounced(current.status),
    from: { startsOn: current.startsOn, endsOn: current.endsOn },
    to: { startsOn: next.startsOn, endsOn: next.endsOn },
    anchors: MOVED_ANCHORS.map((key) => ({ key, from: old.get(key) ?? null, to: anchors[key] })),
    check: check ?? null,
    tasksShifting: shifting.length,
    shifting,
    tasksOverdueAfter: shifting.filter((s) => s.overdue).length,
    seasonShifting: toRows(seasonShifted),
    kept,
    notified,
    permitsKept,
  };
}

/** "Verschieben": the preview for a new first day. */
export async function previewEventMove(actor: Actor, id: string, startsOn: string) {
  checkNewFirstDay(startsOn);
  return previewEventSchedule(actor, id, { startsOn });
}

/**
 * The one place that changes the days of an event (CLAUDE.md: anchor shifts): first/last day, season and
 * the four named dates (booking cut-off = Monday before). Other anchors (custom ones, later the permit
 * decision) stay. Open tasks that follow their anchor (not done, due date not set by hand) get their
 * new due date here too (M2), and so do the season tasks when the season's first or last date changes (R10;
 * moving into another year makes sure that year's Saison record exists). Returns the anchor diff for the audit
 * entry and the tasks that moved.
 */
async function applySchedule(
  tx: Tx,
  actor: Actor,
  current: EventRow,
  next: { startsOn: string; endsOn: string; durationDays: number },
  cause: "event_move" | "event_update",
): Promise<{
  anchors: Record<string, { from: string | null; to: string }>;
  shifted: ShiftedTask[];
  seasonShifted: number;
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
  const shifted = await shiftTasks(
    tx,
    { eventId: current.id },
    new Map([...old, ...Object.entries(anchors)]),
  );
  let seasonShifted = 0;
  if (current.presetId) {
    const nextSeason = Number(next.startsOn.slice(0, 4));
    if (nextSeason !== current.season)
      await ensureSeasonsTx(
        tx,
        actor,
        [{ presetId: current.presetId, season: nextSeason }],
        "event_move",
      );
    const synced = await syncSeasonsTx(
      tx,
      actor,
      [
        { presetId: current.presetId, season: current.season },
        { presetId: current.presetId, season: nextSeason },
      ],
      cause,
    );
    seasonShifted = synced.reduce((n, s) => n + s.shifted.length, 0);
  }
  return { anchors: diff, shifted, seasonShifted };
}

/**
 * "Verschieben": new first day, duration kept. Only until the event runs. `expectedStartsOn` guards
 * against a concurrent move (and makes the undo toast safe). Warnings never block. The undo takes back the
 * move's notices that are still unread instead of sending a second one (UX-046); people who already read
 * theirs are told about the way back.
 */
export async function moveEvent(
  actor: Actor,
  id: string,
  startsOn: string,
  expectedStartsOn: string,
  options: { undo?: boolean } = {},
): Promise<{
  changed: boolean;
  from: string;
  to: string;
  tasksShifted: number;
  seasonTasksShifted: number;
}> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (options.undo) {
    if (!isIsoDate(startsOn)) throw new EventDetailsInputError("invalid_date");
  } else checkNewFirstDay(startsOn);

  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    if (current.startsOn !== expectedStartsOn) throw new EventDetailsInputError("conflict");
    if (!canMoveEvent(current.status)) throw new EventDetailsInputError("not_movable");
    if (startsOn === current.startsOn)
      return {
        changed: false,
        from: current.startsOn,
        to: startsOn,
        tasksShifted: 0,
        seasonTasksShifted: 0,
      };

    const next = target(current, { startsOn });
    const { anchors, shifted, seasonShifted } = await applySchedule(
      tx,
      actor,
      current,
      next,
      "event_move",
    );
    const retracted = options.undo
      ? await retractDatesShifted(tx, { id, from: next.startsOn, to: current.startsOn })
      : new Set<string>();
    await notifyDatesShifted(tx, actor, current, next, shifted, retracted);
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
          ...(seasonShifted > 0 ? { seasonTasksShifted: seasonShifted } : {}),
          ...(options.undo ? { undo: true } : {}),
        },
      },
    ]);
    return {
      changed: true,
      from: current.startsOn,
      to: next.startsOn,
      tasksShifted: shifted.length,
      seasonTasksShifted: seasonShifted,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Grunddaten: name, length, venue (always confirmed in the UI, decided 2026-10-21)

export const MAX_NAME_LENGTH = 120;

export type EventBasics = {
  name: string;
  durationDays: number;
  venueId: string;
  /** The type is a label: changing it keeps the event's tasks and permits (decision 2026-11-03). */
  eventTypeId: string;
};

/**
 * "Name, Dauer, Ort, Art" of this event only (the preset stays). A new type relabels the event and keeps
 * its tasks and permits as they are (templates never propagate automatically). A new length keeps the first day and
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
  if (!UUID.test(next.eventTypeId)) throw new EventDetailsInputError("invalid_type");

  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    const previous: EventBasics = {
      name: current.name,
      durationDays: durationOf(current),
      venueId: current.venueId,
      eventTypeId: current.eventTypeId,
    };
    if (
      expected &&
      (expected.name !== previous.name ||
        expected.durationDays !== previous.durationDays ||
        expected.venueId !== previous.venueId ||
        expected.eventTypeId !== previous.eventTypeId)
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
    if (next.eventTypeId !== current.eventTypeId) {
      const types = await tx
        .select({ id: eventType.id, nameDe: eventType.nameDe, archivedAt: eventType.archivedAt })
        .from(eventType)
        .where(inArray(eventType.id, [current.eventTypeId, next.eventTypeId]));
      const newType = types.find((x) => x.id === next.eventTypeId);
      if (!newType || newType.archivedAt) throw new EventDetailsInputError("invalid_type");
      changes.eventTypeId = {
        from: current.eventTypeId,
        to: next.eventTypeId,
        fromName: types.find((x) => x.id === current.eventTypeId)?.nameDe ?? null,
        toName: newType.nameDe,
      };
    }
    if (Object.keys(changes).length === 0) return { changed: false, previous, tasksShifted: 0 };

    await tx
      .update(event)
      .set({ name, venueId: schedule.venueId, eventTypeId: next.eventTypeId })
      .where(eq(event.id, id));
    const applied = changes.durationDays
      ? await applySchedule(tx, actor, current, schedule, "event_update")
      : undefined;
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
          ...(applied && applied.seasonShifted > 0
            ? { seasonTasksShifted: applied.seasonShifted }
            : {}),
          ...(expected ? { undo: true } : {}),
        },
      },
    ]);
    return { changed: true, previous, tasksShifted: shifted.length };
  });
}
