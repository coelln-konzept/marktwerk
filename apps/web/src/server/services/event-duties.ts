import "server-only";
import { can } from "@marktwerk/core";
import { dutyRole, event, eventDuty, staffMember } from "@marktwerk/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

export type EventDutyError = "not_found" | "invalid_role" | "invalid_staff" | "conflict";

export class EventDutyInputError extends Error {
  constructor(readonly code: EventDutyError) {
    super(code);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Who fills a duty role at one event (Team tab). `staffMemberId = null` leaves the role unassigned.
 * Only this event changes; the preset's default team stays as it is (templates never propagate).
 * `expected` (undo toast) makes the change apply only while the role still has that person, so a newer
 * change by someone else is not overwritten. Audited as "event.duty" with role and names as they were.
 */
export async function setEventDuty(
  actor: Actor,
  eventId: string,
  dutyRoleId: string,
  staffMemberId: string | null,
  expected?: string | null,
): Promise<{ changed: boolean; from: string | null; to: string | null }> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!UUID.test(eventId)) throw new EventDutyInputError("not_found");
  if (!UUID.test(dutyRoleId)) throw new EventDutyInputError("invalid_role");
  if (staffMemberId !== null && !UUID.test(staffMemberId))
    throw new EventDutyInputError("invalid_staff");

  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: event.id })
      .from(event)
      .where(and(eq(event.id, eventId), isNull(event.archivedAt)))
      .for("update");
    if (!found) throw new EventDutyInputError("not_found");

    const [role] = await tx
      .select({
        id: dutyRole.id,
        key: dutyRole.key,
        nameDe: dutyRole.nameDe,
        nameEn: dutyRole.nameEn,
      })
      .from(dutyRole)
      .where(eq(dutyRole.id, dutyRoleId));
    if (!role) throw new EventDutyInputError("invalid_role");

    let toName: string | null = null;
    if (staffMemberId !== null) {
      const [person] = await tx
        .select({ name: staffMember.displayName })
        .from(staffMember)
        .where(
          and(
            eq(staffMember.id, staffMemberId),
            eq(staffMember.active, true),
            isNull(staffMember.archivedAt),
          ),
        );
      if (!person) throw new EventDutyInputError("invalid_staff");
      toName = person.name;
    }

    const [current] = await tx
      .select({ staffMemberId: eventDuty.staffMemberId, name: staffMember.displayName })
      .from(eventDuty)
      .innerJoin(staffMember, eq(staffMember.id, eventDuty.staffMemberId))
      .where(and(eq(eventDuty.eventId, eventId), eq(eventDuty.dutyRoleId, dutyRoleId)));
    const from = current?.staffMemberId ?? null;
    if (expected !== undefined && from !== expected) throw new EventDutyInputError("conflict");
    if (from === staffMemberId) return { changed: false, from, to: staffMemberId };

    const where = and(eq(eventDuty.eventId, eventId), eq(eventDuty.dutyRoleId, dutyRoleId));
    if (staffMemberId === null) await tx.delete(eventDuty).where(where);
    else if (from === null)
      await tx.insert(eventDuty).values({ eventId, dutyRoleId, staffMemberId });
    else await tx.update(eventDuty).set({ staffMemberId }).where(where);

    await audit(tx, actor.id, [
      {
        action: "event.duty",
        entityType: "event",
        entityId: eventId,
        diff: {
          role: role.key,
          roleDe: role.nameDe,
          roleEn: role.nameEn,
          from,
          fromName: current?.name ?? null,
          to: staffMemberId,
          toName,
          ...(expected !== undefined ? { undo: true } : {}),
        },
      },
    ]);
    return { changed: true, from, to: staffMemberId };
  });
}
