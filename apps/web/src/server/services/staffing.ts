import "server-only";
import {
  addDays,
  needsFromStaffing,
  parseStaffing,
  type Schedule,
  type StaffingRow,
} from "@marktwerk/core";
import { dutyRole, event, shift, shiftNeed, shiftRevision } from "@marktwerk/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Actor } from "../actor";
import type { db } from "../db";
import { audit } from "./audit";

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

/**
 * Part of the one anchor-shift path (`applySchedule`): the event's needs and their linked planned shifts move by
 * the same number of days. Moved "bestätigt" shifts go back to "angefragt" (the person agreed to the old date), with
 * a shift_revision each. A move never changes the length; `rebuildNeedsTx` handles that.
 */
export async function moveNeedsTx(
  tx: Tx,
  actor: Actor,
  eventId: string,
  offsetDays: number,
): Promise<{ reset: string[] }> {
  const needs = await tx.select().from(shiftNeed).where(eq(shiftNeed.eventId, eventId));
  if (needs.length === 0) return { reset: [] };
  const reset: string[] = [];
  if (offsetDays !== 0) {
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

    const linked = await tx
      .select()
      .from(shift)
      .where(
        and(
          inArray(
            shift.needId,
            needs.map((n) => n.id),
          ),
          inArray(shift.status, ["requested", "confirmed"]),
        ),
      )
      .for("update");
    for (const current of linked) {
      const workDate = addDays(current.workDate, offsetDays);
      const status = current.status === "confirmed" ? "requested" : current.status;
      if (current.status === "confirmed") reset.push(current.id);
      await tx.insert(shiftRevision).values({
        shiftId: current.id,
        version: current.version,
        reason: "Veranstaltung verschoben",
        before: JSON.parse(JSON.stringify(current)) as Record<string, unknown>,
        changedByStaffMemberId: actor.staffMemberId,
      });
      await tx
        .update(shift)
        .set({ workDate, status, version: current.version + 1 })
        .where(eq(shift.id, current.id));
      await audit(tx, actor.id, [
        {
          action: "shift.update",
          entityType: "shift",
          entityId: current.id,
          diff: {
            reason: "event_move",
            before: { workDate: current.workDate, status: current.status },
            after: { workDate, status },
          },
        },
      ]);
    }
  }
  return { reset };
}

/**
 * Part of the one anchor-shift path (`applySchedule`), after the move: recalculates the needs for the event's new
 * length from its Personalbedarf and Zeitplan. A need that still fits (same day, role and Zeitplan part) is left
 * alone and keeps its id, people and per-day edits. Missing needs are added. Needs that no longer fit are deleted;
 * their shifts (any status) stay, unlinked, under "Weitere Schichten", with a revision and an audit entry each.
 */
export async function rebuildNeedsTx(
  tx: Tx,
  actor: Actor,
  eventId: string,
  next: { startsOn: string; durationDays: number },
): Promise<{ added: number; removed: number; unlinked: string[] }> {
  const [row] = await tx
    .select({ staffing: event.staffing, schedule: event.schedule })
    .from(event)
    .where(eq(event.id, eventId));
  if (!row) return { added: 0, removed: 0, unlinked: [] };
  const existing = await tx.select().from(shiftNeed).where(eq(shiftNeed.eventId, eventId));
  const staffing = parseStaffing(row.staffing) ?? [];
  if (staffing.length === 0 && existing.length === 0) return { added: 0, removed: 0, unlinked: [] };

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
      .returning({ id: shiftNeed.id });
    added = inserted.length;
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
      await tx.insert(shiftRevision).values({
        shiftId: current.id,
        version: current.version,
        reason: "Bedarf entfällt (Dauer geändert)",
        before: JSON.parse(JSON.stringify(current)) as Record<string, unknown>,
        changedByStaffMemberId: actor.staffMemberId,
      });
      await tx
        .update(shift)
        .set({ needId: null, version: current.version + 1 })
        .where(eq(shift.id, current.id));
      await audit(tx, actor.id, [
        {
          action: "shift.update",
          entityType: "shift",
          entityId: current.id,
          diff: {
            reason: "event_length",
            version: current.version + 1,
            before: { needId: current.needId },
            after: { needId: null },
          },
        },
      ]);
    }
    await tx.delete(shiftNeed).where(
      inArray(
        shiftNeed.id,
        gone.map((n) => n.id),
      ),
    );
  }
  return { added, removed: gone.length, unlinked };
}
