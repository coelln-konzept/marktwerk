import "server-only";
import { event, eventDuty, staffMember } from "@marktwerk/db/schema";
import { and, eq, exists, isNull, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "./db";
import { type CurrentUser, requireUser } from "./session";

export type Actor = CurrentUser & {
  staffMemberId: string | null;
  /** First name for greetings; the login name if there's no staff record. */
  firstName: string;
  displayName: string;
};

/** The signed-in user plus their staff record (ADR 0012). Deduplicated per request. */
export const getActor = cache(async (): Promise<Actor> => {
  const user = await requireUser();
  const member = await db.query.staffMember.findFirst({
    where: eq(staffMember.userId, user.id),
    columns: { id: true, firstName: true, displayName: true },
  });
  return {
    ...user,
    staffMemberId: member?.id ?? null,
    firstName: member?.firstName ?? user.name.split(" ")[0] ?? user.name,
    displayName: member?.displayName ?? user.name,
  };
});

/**
 * Row-level scope for events: field users only see events they work at (decision 2026-10-21).
 * In M1 that means an event duty; shifts join in with M4. Archived events are always hidden.
 */
export function visibleEvents(actor: Actor): SQL {
  const notArchived = isNull(event.archivedAt);
  if (actor.role !== "field") return notArchived;
  if (!actor.staffMemberId) return sql`false`;
  return and(
    notArchived,
    exists(
      db
        .select({ one: eventDuty.eventId })
        .from(eventDuty)
        .where(
          and(eq(eventDuty.eventId, event.id), eq(eventDuty.staffMemberId, actor.staffMemberId)),
        ),
    ),
  ) as SQL;
}
