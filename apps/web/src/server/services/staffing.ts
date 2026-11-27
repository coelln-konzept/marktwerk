import "server-only";
import {
  addDays,
  needsFromStaffing,
  parseStaffing,
  type Schedule,
  type StaffingRow,
} from "@marktwerk/core";
import { dutyRole, event, shift, shiftNeed, shiftRevision } from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "../actor";
import type { db } from "../db";
import { audit } from "./audit";
import { assertMonthOpen } from "./payroll";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Needs of events from their staffing × days × Zeitplan (spec §5). Inside the caller's transaction: called by
 * `instantiateEvents` (the one instantiation path) and by "Personalbedarf aus Vorlage übernehmen". Existing needs
 * stay as they are (idempotent); roles that no longer exist are skipped.
 */
export async function createNeedsTx(
  tx: Tx,
  events: readonly {
    id: string;
    startsOn: string;
    durationDays: number;
    staffing: readonly StaffingRow[];
    schedule: Schedule;
  }[],
): Promise<number> {
  if (events.every((e) => e.staffing.length === 0)) return 0;
  const roles = await tx.select({ id: dutyRole.id, key: dutyRole.key }).from(dutyRole);
  const roleId = new Map(roles.map((r) => [r.key, r.id]));
  const values = events.flatMap((e) =>
    needsFromStaffing(e.staffing, e.schedule, e.startsOn, e.durationDays).flatMap((n) => {
      const id = roleId.get(n.dutyRoleKey);
      return id
        ? [
            {
              eventId: e.id,
              workDate: n.workDate,
              dutyRoleId: id,
              scheduleKind: n.scheduleKind,
              headcount: n.headcount,
              plannedStart: n.plannedStart,
              plannedEnd: n.plannedEnd,
            },
          ]
        : [];
    }),
  );
  if (values.length === 0) return 0;
  const inserted = await tx
    .insert(shiftNeed)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: shiftNeed.id });
  return inserted.length;
}

type ShiftRow = typeof shift.$inferSelect;

/**
 * One planning-side change of a shift record (§17 MiLoG: never silent): the previous state as a shift_revision,
 * version + 1 and an audit entry. The months the shift is in before and after must still be open
 * (`PayrollInputError("period_locked")` otherwise). Shared by the needs paths and the event cancel.
 */
export async function reviseShiftTx(
  tx: Tx,
  actor: Actor,
  current: ShiftRow,
  set: Partial<Pick<ShiftRow, "workDate" | "status" | "needId">>,
  reason: string,
  cause: string,
): Promise<void> {
  await assertMonthOpen(tx, current.workDate);
  if (set.workDate && set.workDate.slice(0, 7) !== current.workDate.slice(0, 7))
    await assertMonthOpen(tx, set.workDate);
  await tx.insert(shiftRevision).values({
    shiftId: current.id,
    version: current.version,
    reason,
    before: JSON.parse(JSON.stringify(current)) as Record<string, unknown>,
    changedByStaffMemberId: actor.staffMemberId,
  });
  await tx
    .update(shift)
    .set({ ...set, version: current.version + 1 })
    .where(eq(shift.id, current.id));
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(set) as (keyof typeof set)[]) before[key] = current[key];
  await audit(tx, actor.id, [
    {
      action: "shift.update",
      entityType: "shift",
      entityId: current.id,
      diff: { reason: cause, version: current.version + 1, before, after: set },
    },
  ]);
}

/**
 * Part of the one anchor-shift path (`applySchedule`): the event's needs and their linked planned shifts move by
 * the same number of days. Moved "bestätigt" shifts go back to "angefragt" (the person agreed to the old date), with
 * a shift_revision each; their ids come back as `reset`. The undo of a move passes them as `restoreConfirmed`: those
 * that are still "angefragt" become "bestätigt" again ("Verschieben rückgängig"). Linked shifts with any other status
 * (abgesagt, entfernt, …) stay on their day and are unlinked. Refused (`period_locked`) when a changed shift lies in
 * a locked payroll month. A move never changes the length; `rebuildNeedsTx` handles that.
 */
export async function moveNeedsTx(
  tx: Tx,
  actor: Actor,
  eventId: string,
  offsetDays: number,
  opts: { restoreConfirmed?: readonly string[] } = {},
): Promise<{ reset: string[]; restored: string[]; unlinked: string[] }> {
  const reset: string[] = [];
  const restored: string[] = [];
  const unlinked: string[] = [];
  if (offsetDays === 0) return { reset, restored, unlinked };
  const needs = await tx.select().from(shiftNeed).where(eq(shiftNeed.eventId, eventId));
  if (needs.length === 0) return { reset, restored, unlinked };
  // Two steps so the unique key never collides while dates move past each other.
  for (const need of needs)
    await tx
      .update(shiftNeed)
      .set({ workDate: addDays(need.workDate, offsetDays + 10_000) })
      .where(eq(shiftNeed.id, need.id));
  for (const need of needs)
    await tx
      .update(shiftNeed)
      .set({ workDate: addDays(need.workDate, offsetDays) })
      .where(eq(shiftNeed.id, need.id));

  const restore = new Set(opts.restoreConfirmed ?? []);
  const linked = await tx
    .select()
    .from(shift)
    .where(
      inArray(
        shift.needId,
        needs.map((n) => n.id),
      ),
    )
    .orderBy(asc(shift.createdAt))
    .for("update");
  for (const current of linked) {
    if (current.status !== "requested" && current.status !== "confirmed") {
      unlinked.push(current.id);
      await reviseShiftTx(
        tx,
        actor,
        current,
        { needId: null },
        "Veranstaltung verschoben",
        "event_move",
      );
      continue;
    }
    const workDate = addDays(current.workDate, offsetDays);
    if (current.status === "requested" && restore.has(current.id)) {
      restored.push(current.id);
      await reviseShiftTx(
        tx,
        actor,
        current,
        { workDate, status: "confirmed" },
        "Verschieben rückgängig",
        "event_move_undo",
      );
      continue;
    }
    if (current.status === "confirmed") reset.push(current.id);
    await reviseShiftTx(
      tx,
      actor,
      current,
      { workDate, status: "requested" },
      "Veranstaltung verschoben",
      "event_move",
    );
  }
  return { reset, restored, unlinked };
}

/**
 * Part of the one anchor-shift path (`applySchedule`), after the move, and of a Zeitplan edit (`updateEventFacts`):
 * recalculates the needs for the event's length from its Personalbedarf and Zeitplan. A need that still fits (same
 * day, role and Zeitplan part) is left alone and keeps its id, people and per-day edits. Missing needs are added. Needs that no longer fit are deleted;
 * their shifts (any status) stay, unlinked, under "Weitere Schichten", with a revision and an audit entry each.
 * A need that comes back (the undo of a shorter length) takes its angefragt/bestätigt shifts back ("Bedarf wieder
 * da"). Refused (`period_locked`) when a changed shift lies in a locked payroll month.
 */
export async function rebuildNeedsTx(
  tx: Tx,
  actor: Actor,
  eventId: string,
  next: { startsOn: string; durationDays: number },
  why: "length" | "schedule" = "length",
): Promise<{ added: number; removed: number; unlinked: string[]; relinked: string[] }> {
  const [row] = await tx
    .select({ staffing: event.staffing, schedule: event.schedule })
    .from(event)
    .where(eq(event.id, eventId));
  if (!row) return { added: 0, removed: 0, unlinked: [], relinked: [] };
  const existing = await tx.select().from(shiftNeed).where(eq(shiftNeed.eventId, eventId));
  const staffing = parseStaffing(row.staffing) ?? [];
  if (staffing.length === 0 && existing.length === 0)
    return { added: 0, removed: 0, unlinked: [], relinked: [] };

  const roles = await tx.select({ id: dutyRole.id, key: dutyRole.key }).from(dutyRole);
  const roleId = new Map(roles.map((r) => [r.key, r.id]));
  const drafts = needsFromStaffing(
    staffing,
    row.schedule,
    next.startsOn,
    next.durationDays,
  ).flatMap((n) => {
    const id = roleId.get(n.dutyRoleKey);
    return id ? [{ ...n, dutyRoleId: id }] : [];
  });
  const keyOf = (n: { workDate: string; dutyRoleId: string; scheduleKind: string }) =>
    `${n.workDate}|${n.dutyRoleId}|${n.scheduleKind}`;
  const have = new Set(existing.map(keyOf));
  const wanted = new Set(drafts.map(keyOf));

  const missing = drafts.filter((d) => !have.has(keyOf(d)));
  let added = 0;
  let relinked: string[] = [];
  if (missing.length > 0) {
    const inserted = await tx
      .insert(shiftNeed)
      .values(
        missing.map((n) => ({
          eventId,
          workDate: n.workDate,
          dutyRoleId: n.dutyRoleId,
          scheduleKind: n.scheduleKind,
          headcount: n.headcount,
          plannedStart: n.plannedStart,
          plannedEnd: n.plannedEnd,
        })),
      )
      .onConflictDoNothing()
      .returning({
        id: shiftNeed.id,
        workDate: shiftNeed.workDate,
        dutyRoleId: shiftNeed.dutyRoleId,
        plannedStart: shiftNeed.plannedStart,
      });
    added = inserted.length;
    relinked = await relinkTx(tx, actor, eventId, inserted, why);
  }

  const gone = existing.filter((n) => !wanted.has(keyOf(n)));
  const unlinked: string[] = [];
  if (gone.length > 0) {
    const linked = await tx
      .select()
      .from(shift)
      .where(
        inArray(
          shift.needId,
          gone.map((n) => n.id),
        ),
      )
      .for("update");
    for (const current of linked) {
      unlinked.push(current.id);
      await reviseShiftTx(
        tx,
        actor,
        current,
        { needId: null },
        why === "length"
          ? "Bedarf entfällt (Dauer geändert)"
          : "Bedarf entfällt (Zeitplan geändert)",
        why === "length" ? "event_length" : "event_schedule",
      );
    }
    await tx.delete(shiftNeed).where(
      inArray(
        shiftNeed.id,
        gone.map((n) => n.id),
      ),
    );
  }
  return { added, removed: gone.length, unlinked, relinked };
}

/**
 * Unlinked angefragt/bestätigt shifts of the event go back onto a newly added need of the same day and role: the
 * one with the same start time, or the only one of that day and role. Revision "Bedarf wieder da" each.
 */
async function relinkTx(
  tx: Tx,
  actor: Actor,
  eventId: string,
  added: readonly {
    id: string;
    workDate: string;
    dutyRoleId: string;
    plannedStart: string | null;
  }[],
  why: "length" | "schedule",
): Promise<string[]> {
  if (added.length === 0) return [];
  const loose = await tx
    .select()
    .from(shift)
    .where(
      and(
        eq(shift.eventId, eventId),
        isNull(shift.needId),
        inArray(shift.status, ["requested", "confirmed"]),
        inArray(
          shift.workDate,
          added.map((n) => n.workDate),
        ),
      ),
    )
    .orderBy(asc(shift.createdAt))
    .for("update");
  const relinked: string[] = [];
  for (const current of loose) {
    const same = added.filter(
      (n) => n.workDate === current.workDate && n.dutyRoleId === current.dutyRoleId,
    );
    const need =
      same.find((n) => n.plannedStart !== null && n.plannedStart === current.plannedStart) ??
      (same.length === 1 ? same[0] : undefined);
    if (!need) continue;
    relinked.push(current.id);
    await reviseShiftTx(
      tx,
      actor,
      current,
      { needId: need.id },
      "Bedarf wieder da",
      why === "length" ? "event_length" : "event_schedule",
    );
  }
  return relinked;
}
