import "server-only";
import { can, isClockTime, isIsoDate, type ShiftStatus, shiftLength } from "@marktwerk/core";
import { dutyRole, event, shift, shiftRevision, staffMember } from "@marktwerk/db/schema";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { assertMonthOpen, PayrollInputError } from "./payroll";

export type ShiftError =
  | "not_found"
  | "invalid_person"
  | "invalid_event"
  | "invalid_role"
  | "invalid_date"
  | "invalid_time"
  | "times_incomplete"
  | "no_times"
  | "invalid_break"
  | "break_too_long"
  | "too_long"
  | "future_actual"
  | "status_conflict"
  | "duplicate"
  | "reason_required"
  | "conflict"
  | "period_locked";

export class ShiftInputError extends Error {
  constructor(readonly code: ShiftError) {
    super(code);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;

/** All times "HH:mm" (Europe/Berlin wall clock); a pair is both set or both empty. */
export type ShiftInput = {
  eventId: string | null;
  staffMemberId: string;
  dutyRoleId: string | null;
  workDate: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  breakMinutes: number;
  /** Default: "worked" with actual times, otherwise "confirmed" (the office plans it). */
  status?: ShiftStatus;
  notes?: string | null;
};

type Fields = Omit<ShiftInput, "status"> & { status: ShiftStatus };

/** Longest shift accepted (typo guard: 08:00-07:00 is not a 23 hour shift). */
const MAX_SHIFT_MINUTES = 16 * 60;
const MAX_BREAK_MINUTES = 12 * 60;

const berlinToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());

function derivedStatus(f: Pick<ShiftInput, "actualStart" | "actualEnd">): ShiftStatus {
  return f.actualStart && f.actualEnd ? "worked" : "confirmed";
}

/** Pure checks of one shift's own fields. */
function validate(fields: Fields, today: string) {
  if (!isIsoDate(fields.workDate)) throw new ShiftInputError("invalid_date");
  const times = [fields.plannedStart, fields.plannedEnd, fields.actualStart, fields.actualEnd];
  if (times.some((t) => t !== null && !isClockTime(t))) throw new ShiftInputError("invalid_time");
  if ((fields.plannedStart === null) !== (fields.plannedEnd === null))
    throw new ShiftInputError("times_incomplete");
  if ((fields.actualStart === null) !== (fields.actualEnd === null))
    throw new ShiftInputError("times_incomplete");
  const hasTimes = fields.plannedStart !== null || fields.actualStart !== null;
  if (!hasTimes && ["requested", "confirmed", "worked"].includes(fields.status))
    throw new ShiftInputError("no_times");
  if (
    !Number.isInteger(fields.breakMinutes) ||
    fields.breakMinutes < 0 ||
    fields.breakMinutes > MAX_BREAK_MINUTES
  )
    throw new ShiftInputError("invalid_break");
  if (fields.actualStart !== null && fields.workDate > today)
    throw new ShiftInputError("future_actual");
  if (fields.status === "worked" && fields.actualStart === null)
    throw new ShiftInputError("status_conflict");
  if (
    (fields.status === "requested" || fields.status === "confirmed") &&
    fields.actualStart !== null
  )
    throw new ShiftInputError("status_conflict");

  for (const [start, end] of [
    [fields.plannedStart, fields.plannedEnd],
    [fields.actualStart, fields.actualEnd],
  ] as const) {
    if (start === null || end === null) continue;
    const length = shiftLength({
      workDate: fields.workDate,
      start,
      end,
      breakMinutes: 0,
    });
    if (!length || length.grossMinutes > MAX_SHIFT_MINUTES) throw new ShiftInputError("too_long");
    if (fields.breakMinutes > 0 && fields.breakMinutes >= length.grossMinutes)
      throw new ShiftInputError("break_too_long");
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function checkReferences(tx: Tx, fields: Fields) {
  const [person] = await tx
    .select({ id: staffMember.id })
    .from(staffMember)
    .where(and(eq(staffMember.id, fields.staffMemberId), isNull(staffMember.archivedAt)));
  if (!person) throw new ShiftInputError("invalid_person");
  if (fields.eventId !== null) {
    const [found] = await tx
      .select({ id: event.id })
      .from(event)
      .where(and(eq(event.id, fields.eventId), isNull(event.archivedAt)));
    if (!found) throw new ShiftInputError("invalid_event");
  }
  if (fields.dutyRoleId !== null) {
    const [found] = await tx
      .select({ id: dutyRole.id })
      .from(dutyRole)
      .where(eq(dutyRole.id, fields.dutyRoleId));
    if (!found) throw new ShiftInputError("invalid_role");
  }
}

function checkIds(fields: Fields) {
  if (!UUID.test(fields.staffMemberId)) throw new ShiftInputError("invalid_person");
  if (fields.eventId !== null && !UUID.test(fields.eventId))
    throw new ShiftInputError("invalid_event");
  if (fields.dutyRoleId !== null && !UUID.test(fields.dutyRoleId))
    throw new ShiftInputError("invalid_role");
}

/** Wraps `period_locked` from the payroll service in the shift error type. */
async function inOpenMonth(tx: Tx, date: string) {
  try {
    await assertMonthOpen(tx, date);
  } catch (error) {
    if (error instanceof PayrollInputError && error.code === "period_locked")
      throw new ShiftInputError("period_locked");
    throw error;
  }
}

const fieldsOf = (row: typeof shift.$inferSelect): Fields => ({
  eventId: row.eventId,
  staffMemberId: row.staffMemberId,
  dutyRoleId: row.dutyRoleId,
  workDate: row.workDate,
  plannedStart: row.plannedStart?.slice(0, 5) ?? null,
  plannedEnd: row.plannedEnd?.slice(0, 5) ?? null,
  actualStart: row.actualStart?.slice(0, 5) ?? null,
  actualEnd: row.actualEnd?.slice(0, 5) ?? null,
  breakMinutes: row.breakMinutes,
  status: row.status,
  notes: row.notes,
});

/** Which fields changed, for the audit diff. */
function changes(from: Fields, to: Fields) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(to) as (keyof Fields)[]) {
    if ((from[key] ?? null) !== (to[key] ?? null)) {
      before[key] = from[key] ?? null;
      after[key] = to[key] ?? null;
    }
  }
  return { before, after };
}

const toDbValues = (f: Fields) => ({
  eventId: f.eventId,
  staffMemberId: f.staffMemberId,
  dutyRoleId: f.dutyRoleId,
  workDate: f.workDate,
  plannedStart: f.plannedStart,
  plannedEnd: f.plannedEnd,
  actualStart: f.actualStart,
  actualEnd: f.actualEnd,
  breakMinutes: f.breakMinutes,
  status: f.status,
  notes: f.notes ?? null,
});

function assertManage(actor: Actor) {
  if (!can(actor.role, "team", "manage")) forbidden();
}

/**
 * A new shift record entered by the office (with or without event). Actual times may only be given
 * for days up to today. The month must still be open. Audited as "shift.create".
 */
export async function createShift(
  actor: Actor,
  input: ShiftInput,
  opts: { today?: string } = {},
): Promise<{ id: string; version: number }> {
  assertManage(actor);
  const fields: Fields = {
    ...input,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    status: input.status ?? derivedStatus(input),
  };
  checkIds(fields);
  validate(fields, opts.today ?? berlinToday());

  return db.transaction(async (tx) => {
    await inOpenMonth(tx, fields.workDate);
    await checkReferences(tx, fields);

    // Same person, day, event and start twice = a double submit.
    const start = fields.plannedStart ?? fields.actualStart;
    const [duplicate] = await tx
      .select({ id: shift.id })
      .from(shift)
      .where(
        and(
          eq(shift.staffMemberId, fields.staffMemberId),
          eq(shift.workDate, fields.workDate),
          fields.eventId === null ? isNull(shift.eventId) : eq(shift.eventId, fields.eventId),
          ne(shift.status, "cancelled"),
          sql`coalesce(${shift.plannedStart}, ${shift.actualStart}) = ${start}::time`,
        ),
      )
      .limit(1);
    if (duplicate) throw new ShiftInputError("duplicate");

    const recorded = fields.actualStart !== null;
    const [created] = await tx
      .insert(shift)
      .values({
        ...toDbValues(fields),
        recordedByStaffMemberId: recorded ? actor.staffMemberId : null,
        recordedAt: recorded ? new Date() : null,
      })
      .returning({ id: shift.id, version: shift.version });
    if (!created) throw new Error("shift insert failed");

    await audit(tx, actor.id, [
      {
        action: "shift.create",
        entityType: "shift",
        entityId: created.id,
        diff: { ...toDbValues(fields) },
      },
    ]);
    return created;
  });
}

async function loadForUpdate(tx: Tx, shiftId: string, expectedVersion: number) {
  const [current] = await tx.select().from(shift).where(eq(shift.id, shiftId)).for("update");
  if (!current) throw new ShiftInputError("not_found");
  if (current.version !== expectedVersion) throw new ShiftInputError("conflict");
  return current;
}

/**
 * Changes a shift after it was created. Always needs a reason: the previous state is kept as a
 * `shift_revision` and the version goes up (§17 MiLoG: records are never changed silently). `patch`
 * fields that are `undefined` stay as they are. Refused once the month is locked.
 */
export async function updateShift(
  actor: Actor,
  shiftId: string,
  patch: Partial<ShiftInput>,
  reason: string,
  expectedVersion: number,
  opts: { today?: string } = {},
): Promise<{ id: string; version: number; changed: boolean }> {
  assertManage(actor);
  if (!UUID.test(shiftId)) throw new ShiftInputError("not_found");
  const why = reason.trim();
  if (why.length < 3) throw new ShiftInputError("reason_required");
  const today = opts.today ?? berlinToday();

  return db.transaction(async (tx) => {
    const current = await loadForUpdate(tx, shiftId, expectedVersion);
    const from = fieldsOf(current);
    const merged: Fields = { ...from };
    for (const key of Object.keys(patch) as (keyof ShiftInput)[]) {
      const value = patch[key];
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
    if (merged.notes !== undefined && merged.notes !== null)
      merged.notes = merged.notes.trim() || null;
    // Clearing the actual times of a worked shift goes back to "confirmed" unless a status is given.
    if (patch.status === undefined && merged.status === "worked" && merged.actualStart === null)
      merged.status = "confirmed";
    if (
      patch.status === undefined &&
      (merged.status === "confirmed" || merged.status === "requested") &&
      merged.actualStart !== null
    )
      merged.status = "worked";
    checkIds(merged);
    validate(merged, today);

    const diff = changes(from, merged);
    if (Object.keys(diff.after).length === 0)
      return { id: shiftId, version: current.version, changed: false };

    await inOpenMonth(tx, from.workDate);
    if (merged.workDate.slice(0, 7) !== from.workDate.slice(0, 7))
      await inOpenMonth(tx, merged.workDate);
    await checkReferences(tx, merged);

    await tx.insert(shiftRevision).values({
      shiftId,
      version: current.version,
      reason: why,
      before: JSON.parse(JSON.stringify(current)) as Record<string, unknown>,
      changedByStaffMemberId: actor.staffMemberId,
    });
    const recordedNow = from.actualStart === null && merged.actualStart !== null;
    const [updated] = await tx
      .update(shift)
      .set({
        ...toDbValues(merged),
        version: current.version + 1,
        ...(recordedNow
          ? { recordedByStaffMemberId: actor.staffMemberId, recordedAt: new Date() }
          : {}),
      })
      .where(eq(shift.id, shiftId))
      .returning({ version: shift.version });
    if (!updated) throw new Error("shift update failed");

    await audit(tx, actor.id, [
      {
        action: "shift.update",
        entityType: "shift",
        entityId: shiftId,
        diff: { reason: why, version: updated.version, before: diff.before, after: diff.after },
      },
    ]);
    return { id: shiftId, version: updated.version, changed: true };
  });
}

/**
 * Enters the actual times of a shift. The first time (nothing recorded yet) needs no reason and does
 * not create a revision: nothing is overwritten, `recorded_by/at` document who entered it. Any later
 * correction goes through `updateShift` and needs a reason.
 */
export async function recordShiftTimes(
  actor: Actor,
  shiftId: string,
  times: { actualStart: string; actualEnd: string; breakMinutes: number },
  expectedVersion: number,
  reason?: string,
  opts: { today?: string } = {},
): Promise<{ id: string; version: number; changed: boolean }> {
  assertManage(actor);
  if (!UUID.test(shiftId)) throw new ShiftInputError("not_found");
  const today = opts.today ?? berlinToday();

  const first = await db.transaction(async (tx) => {
    const current = await loadForUpdate(tx, shiftId, expectedVersion);
    const from = fieldsOf(current);
    const firstRecording =
      from.actualStart === null &&
      (current.status === "requested" || current.status === "confirmed");
    if (!firstRecording) return null;

    const merged: Fields = {
      ...from,
      actualStart: times.actualStart,
      actualEnd: times.actualEnd,
      breakMinutes: times.breakMinutes,
      status: "worked",
    };
    validate(merged, today);
    await inOpenMonth(tx, from.workDate);
    await tx
      .update(shift)
      .set({
        actualStart: merged.actualStart,
        actualEnd: merged.actualEnd,
        breakMinutes: merged.breakMinutes,
        status: "worked",
        recordedByStaffMemberId: actor.staffMemberId,
        recordedAt: new Date(),
      })
      .where(eq(shift.id, shiftId));
    await audit(tx, actor.id, [
      {
        action: "shift.record",
        entityType: "shift",
        entityId: shiftId,
        diff: {
          actualStart: merged.actualStart,
          actualEnd: merged.actualEnd,
          breakMinutes: merged.breakMinutes,
        },
      },
    ]);
    return { id: shiftId, version: current.version, changed: true };
  });
  if (first) return first;

  // Already recorded (or no/cancelled shift): a correction with a reason.
  return updateShift(
    actor,
    shiftId,
    {
      actualStart: times.actualStart,
      actualEnd: times.actualEnd,
      breakMinutes: times.breakMinutes,
      status: "worked",
    },
    reason ?? "",
    expectedVersion,
    opts,
  );
}

/** The revision history of one shift, newest first (for the "Verlauf" of a record). */
export async function listShiftRevisions(shiftId: string) {
  return db
    .select({
      version: shiftRevision.version,
      reason: shiftRevision.reason,
      before: shiftRevision.before,
      changedAt: shiftRevision.changedAt,
      changedBy: staffMember.displayName,
    })
    .from(shiftRevision)
    .leftJoin(staffMember, eq(staffMember.id, shiftRevision.changedByStaffMemberId))
    .where(eq(shiftRevision.shiftId, shiftId))
    .orderBy(sql`${shiftRevision.version} desc`);
}
