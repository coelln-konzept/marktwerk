// apps/web/src/server/services/shift-planning.ts
import "server-only";
import {
  type CandidateFlag,
  can,
  daysBetween,
  eachDay,
  isClockTime,
  isIsoDate,
  shortNotice as isShortNotice,
  MAX_HEADCOUNT,
  needsConfirmation,
  parseStaffing,
  rankCandidates,
  type ShiftStatus,
  slotMinutes,
} from "@marktwerk/core";
import {
  event,
  eventPreset,
  settings,
  shift,
  shiftNeed,
  staffMember,
  staffUnavailability,
} from "@marktwerk/db/schema";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { loadLegalRows, workingTimeLimitsAt } from "../legal-params";
import { loadCandidateInputs } from "../queries/planning-candidates";
import { audit } from "./audit";
import { createShift, updateShift } from "./shifts";
import { createNeedsTx } from "./staffing";

export type PlanningError = "not_found" | "invalid_input" | "needs_confirmation";

export class PlanningInputError extends Error {
  constructor(
    readonly code: PlanningError,
    readonly flags: CandidateFlag[] = [],
  ) {
    super(code);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;
const berlinToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
const MAX_UNAVAILABLE_DAYS = 62;
const STATUS_REASON: Record<string, string> = {
  requested: "Status: angefragt",
  confirmed: "Status: bestätigt",
  declined: "Status: abgesagt",
  cancelled: "Entfernt",
};

function assertManage(actor: Actor) {
  if (!can(actor.role, "team", "manage")) forbidden();
}

/** A need of a live event: archived and cancelled (abgesagt) events are not planned any more. */
async function loadNeed(needId: string) {
  if (!UUID.test(needId)) throw new PlanningInputError("not_found");
  const [row] = await db
    .select({ need: shiftNeed })
    .from(shiftNeed)
    .innerJoin(event, eq(event.id, shiftNeed.eventId))
    .where(and(eq(shiftNeed.id, needId), isNull(event.archivedAt), ne(event.status, "cancelled")));
  if (!row) throw new PlanningInputError("not_found");
  return row.need;
}

const PLANNING_STATUSES = new Set<ShiftStatus>(["requested", "confirmed", "declined", "cancelled"]);

/**
 * "Einplanen" (spec §5): a new shift for this need, angefragt, with the need's times and the statutory break.
 * Warnings (nicht verfügbar, über Budget, ArbZG, overlap) are checked here too: without `confirm` they come back as
 * `needs_confirmation` with the flags, nothing saved. Goes through `createShift` (one path, audited).
 */
export async function assignToNeed(
  actor: Actor,
  needId: string,
  staffMemberId: string,
  opts: { confirm?: boolean; today?: string } = {},
): Promise<{ shiftId: string; shortNotice: boolean }> {
  assertManage(actor);
  if (!UUID.test(staffMemberId)) throw new PlanningInputError("not_found");
  const need = await loadNeed(needId);
  if (!need.plannedStart || !need.plannedEnd) throw new PlanningInputError("invalid_input");
  const limits = workingTimeLimitsAt(await loadLegalRows(db), need.workDate);
  const slot = {
    workDate: need.workDate,
    plannedStart: need.plannedStart.slice(0, 5),
    plannedEnd: need.plannedEnd.slice(0, 5),
  };
  const inputs = await loadCandidateInputs(
    { ...slot, eventId: need.eventId, dutyRoleId: need.dutyRoleId },
    [staffMemberId],
  );
  const [candidate] = rankCandidates(slot, inputs, limits);
  if (!candidate) throw new PlanningInputError("not_found");
  if (needsConfirmation(candidate.flags) && !opts.confirm)
    throw new PlanningInputError("needs_confirmation", candidate.flags);

  const created = await createShift(
    actor,
    {
      eventId: need.eventId,
      staffMemberId,
      dutyRoleId: need.dutyRoleId,
      needId: need.id,
      workDate: need.workDate,
      plannedStart: slot.plannedStart,
      plannedEnd: slot.plannedEnd,
      actualStart: null,
      actualEnd: null,
      breakMinutes: slotMinutes(slot, limits).breakMinutes,
      status: "requested",
    },
    { today: opts.today },
  );
  return {
    shiftId: created.id,
    shortNotice: isShortNotice(need.workDate, opts.today ?? berlinToday()),
  };
}

/** angefragt ↔ bestätigt, abgesagt, Entfernen (= cancelled, never deleted). Undo passes the previous status back. */
export async function setShiftStatus(
  actor: Actor,
  shiftId: string,
  status: "requested" | "confirmed" | "declined" | "cancelled",
  expectedVersion: number,
): Promise<{ previous: ShiftStatus; version: number }> {
  assertManage(actor);
  if (!UUID.test(shiftId)) throw new PlanningInputError("not_found");
  if (!PLANNING_STATUSES.has(status)) throw new PlanningInputError("invalid_input");
  const [current] = await db
    .select({ status: shift.status })
    .from(shift)
    .where(eq(shift.id, shiftId));
  if (!current) throw new PlanningInputError("not_found");
  // Recorded shifts (gearbeitet, nicht erschienen) are changed in Stunden with a reason, not here.
  if (!PLANNING_STATUSES.has(current.status)) throw new PlanningInputError("invalid_input");
  const result = await updateShift(
    actor,
    shiftId,
    { status },
    STATUS_REASON[status] ?? "Status",
    expectedVersion,
  );
  return { previous: current.status, version: result.version };
}

/** Headcount and times of one day's need ("only this day": the preset and the other days stay). */
export async function updateNeed(
  actor: Actor,
  needId: string,
  patch: { headcount?: number; plannedStart?: string | null; plannedEnd?: string | null },
): Promise<void> {
  assertManage(actor);
  const need = await loadNeed(needId);
  const next = {
    headcount: patch.headcount ?? need.headcount,
    plannedStart:
      patch.plannedStart === undefined
        ? (need.plannedStart?.slice(0, 5) ?? null)
        : patch.plannedStart,
    plannedEnd:
      patch.plannedEnd === undefined ? (need.plannedEnd?.slice(0, 5) ?? null) : patch.plannedEnd,
  };
  if (!Number.isInteger(next.headcount) || next.headcount < 0 || next.headcount > MAX_HEADCOUNT)
    throw new PlanningInputError("invalid_input");
  if ((next.plannedStart === null) !== (next.plannedEnd === null))
    throw new PlanningInputError("invalid_input");
  if (
    next.plannedStart !== null &&
    (!isClockTime(next.plannedStart) || !isClockTime(next.plannedEnd ?? ""))
  )
    throw new PlanningInputError("invalid_input");
  await db.transaction(async (tx) => {
    await tx.update(shiftNeed).set(next).where(eq(shiftNeed.id, needId));
    await audit(tx, actor.id, [
      {
        action: "shift_need.update",
        entityType: "shift_need",
        entityId: needId,
        diff: {
          before: {
            headcount: need.headcount,
            plannedStart: need.plannedStart,
            plannedEnd: need.plannedEnd,
          },
          after: next,
        },
      },
    ]);
  });
}

/** "Nicht verfügbar" from–to: one row per day; a repeat replaces the note. */
export async function setUnavailability(
  actor: Actor,
  staffMemberId: string,
  from: string,
  to: string,
  note: string | null,
): Promise<{ dates: string[] }> {
  assertManage(actor);
  if (!UUID.test(staffMemberId) || !isIsoDate(from) || !isIsoDate(to) || to < from)
    throw new PlanningInputError("invalid_input");
  const dates = eachDay(from, to);
  if (dates.length > MAX_UNAVAILABLE_DAYS) throw new PlanningInputError("invalid_input");
  const clean = note?.trim() ? note.trim().slice(0, 200) : null;
  return db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: staffMember.id })
      .from(staffMember)
      .where(and(eq(staffMember.id, staffMemberId), isNull(staffMember.archivedAt)));
    if (!person) throw new PlanningInputError("not_found");
    await tx
      .insert(staffUnavailability)
      .values(
        dates.map((date) => ({
          staffMemberId,
          date,
          note: clean,
          createdByStaffMemberId: actor.staffMemberId,
        })),
      )
      .onConflictDoUpdate({
        target: [staffUnavailability.staffMemberId, staffUnavailability.date],
        set: { note: clean },
      });
    await audit(tx, actor.id, [
      {
        action: "staff_unavailability.set",
        entityType: "staff_member",
        entityId: staffMemberId,
        diff: { from, to, note: clean },
      },
    ]);
    return { dates };
  });
}

export async function clearUnavailability(
  actor: Actor,
  staffMemberId: string,
  dates: string[],
): Promise<void> {
  assertManage(actor);
  if (!UUID.test(staffMemberId) || dates.length === 0 || !dates.every(isIsoDate))
    throw new PlanningInputError("invalid_input");
  await db.transaction(async (tx) => {
    await tx
      .delete(staffUnavailability)
      .where(
        and(
          eq(staffUnavailability.staffMemberId, staffMemberId),
          inArray(staffUnavailability.date, dates),
        ),
      );
    await audit(tx, actor.id, [
      {
        action: "staff_unavailability.clear",
        entityType: "staff_member",
        entityId: staffMemberId,
        diff: { dates },
      },
    ]);
  });
}

/**
 * "Personalbedarf aus Vorlage übernehmen" (decision 2026-11-26: no backfill): copies the market's current staffing
 * into this event and creates the missing needs. A deliberate action; existing needs stay.
 */
export async function applyPresetStaffing(
  actor: Actor,
  eventId: string,
): Promise<{ created: number }> {
  assertManage(actor);
  if (!UUID.test(eventId)) throw new PlanningInputError("not_found");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: event.id,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        schedule: event.schedule,
        presetStaffing: eventPreset.staffing,
      })
      .from(event)
      .innerJoin(eventPreset, eq(eventPreset.id, event.presetId))
      .where(and(eq(event.id, eventId), isNull(event.archivedAt), ne(event.status, "cancelled")));
    if (!row) throw new PlanningInputError("not_found");
    const staffing = parseStaffing(row.presetStaffing) ?? [];
    await tx.update(event).set({ staffing }).where(eq(event.id, eventId));
    const durationDays = daysBetween(row.startsOn, row.endsOn) + 1;
    const created = await createNeedsTx(tx, [
      { id: row.id, startsOn: row.startsOn, durationDays, staffing, schedule: row.schedule },
    ]);
    await audit(tx, actor.id, [
      {
        action: "event.staffing_apply",
        entityType: "event",
        entityId: eventId,
        diff: { staffing, created },
      },
    ]);
    return { created };
  });
}

/** Einstellungen → Rechtliches → Planung: the default hour budget (company policy). */
export async function setDefaultHourBudget(actor: Actor, hours: number): Promise<void> {
  if (!can(actor.role, "settings", "manage")) forbidden();
  if (
    typeof hours !== "number" ||
    !Number.isFinite(hours) ||
    hours < 0 ||
    hours > 200 ||
    Math.round(hours * 2) !== hours * 2
  )
    throw new PlanningInputError("invalid_input");
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ hours: settings.defaultMonthlyHourBudget }).from(settings);
    await tx.update(settings).set({ defaultMonthlyHourBudget: hours }).where(eq(settings.id, 1));
    await audit(tx, actor.id, [
      {
        action: "settings.update",
        entityType: "settings",
        entityId: null,
        diff: { defaultMonthlyHourBudget: { from: before?.hours ?? null, to: hours } },
      },
    ]);
  });
}
