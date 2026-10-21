import "server-only";
import { auditLog, event, user } from "@marktwerk/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";

export type HistoryEntry = {
  id: string;
  action: string;
  diff: unknown;
  at: Date;
  actorName: string | null;
};

/** Audit entries of one event, newest first. Empty if the event is not visible to the actor. */
export async function listEventHistory(
  actor: Actor,
  eventId: string,
  limit = 200,
): Promise<HistoryEntry[]> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return [];
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      diff: auditLog.diff,
      at: auditLog.at,
      actorName: user.name,
    })
    .from(auditLog)
    .innerJoin(event, eq(event.id, auditLog.entityId))
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(
      and(eq(auditLog.entityType, "event"), eq(auditLog.entityId, eventId), visibleEvents(actor)),
    )
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(limit);
}
