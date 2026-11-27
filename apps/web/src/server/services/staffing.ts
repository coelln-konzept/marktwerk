import "server-only";
import { addDays, needsFromStaffing, type Schedule, type StaffingRow } from "@marktwerk/core";
import { dutyRole, shift, shiftNeed, shiftRevision } from "@marktwerk/db/schema";
import { and, eq, gt, inArray, lt, or } from "drizzle-orm";
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
 * a shift_revision each. Needs that fall outside the new days (a shorter event) are deleted; their shifts stay,
 * unlinked, under "Weitere Schichten".
 */
export async function moveNeedsTx(
  tx: Tx,
  actor: Actor,
  eventId: string,
  offsetDays: number,
  next: { startsOn: string; endsOn: string },
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
  // Day before = startsOn − 1 is still part of the event's days for needs.
  const first = addDays(next.startsOn, -1);
  await tx
    .delete(shiftNeed)
    .where(
      and(
        eq(shiftNeed.eventId, eventId),
        or(lt(shiftNeed.workDate, first), gt(shiftNeed.workDate, next.endsOn)),
      ),
    );
  return { reset };
}
