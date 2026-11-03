import "server-only";
import { auditLog, document, event, staffMember, task, user } from "@marktwerk/db/schema";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";

export type HistoryEntry = {
  id: string;
  action: string;
  diff: unknown;
  at: Date;
  /** The name the person goes by in the app (staff name, else the login name). */
  actorName: string | null;
  /** What the entry is about besides the event itself: the task title of a tick, the file name of an upload. */
  subject: string | null;
};

/** Task changes worth a line in the event's Verlauf (ticks, snoozes and their undo), not every check item or comment. */
const TASK_ACTIONS = ["task.status", "task.snooze", "task.unsnooze", "task.undo"];
/** Document changes of the event's Dokumente tab. */
const DOCUMENT_ACTIONS = ["document.upload", "document.archive", "document.restore"];

/**
 * The Verlauf of one event, newest first: changes to the event itself plus the ticks and snoozes of its tasks
 * and the uploads to its Dokumente. Empty if the event is not visible to the actor.
 */
export async function listEventHistory(
  actor: Actor,
  eventId: string,
  limit = 200,
): Promise<HistoryEntry[]> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return [];
  const [visible] = await db
    .select({ id: event.id })
    .from(event)
    .where(and(eq(event.id, eventId), visibleEvents(actor)));
  if (!visible) return [];

  const taskIds = db.select({ id: task.id }).from(task).where(eq(task.eventId, eventId));
  const documentIds = db
    .select({ id: document.id })
    .from(document)
    .where(eq(document.eventId, eventId));
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      diff: auditLog.diff,
      at: auditLog.at,
      // Same name as the sidebar shows: the staff record first, the login name as fallback.
      actorName: sql<string | null>`coalesce(${staffMember.displayName}, ${user.name})`,
      taskTitle: task.title,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .leftJoin(staffMember, eq(staffMember.userId, auditLog.actorId))
    .leftJoin(task, and(eq(auditLog.entityType, "task"), eq(task.id, auditLog.entityId)))
    .where(
      or(
        and(eq(auditLog.entityType, "event"), eq(auditLog.entityId, eventId)),
        and(
          eq(auditLog.entityType, "task"),
          inArray(auditLog.action, TASK_ACTIONS),
          inArray(auditLog.entityId, taskIds),
        ),
        and(
          eq(auditLog.entityType, "document"),
          inArray(auditLog.action, DOCUMENT_ACTIONS),
          inArray(auditLog.entityId, documentIds),
        ),
      ),
    )
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(limit);

  return rows.map(({ taskTitle, ...row }) => {
    const diff = (row.diff && typeof row.diff === "object" ? row.diff : {}) as {
      fileName?: unknown;
    };
    return {
      ...row,
      subject: taskTitle ?? (typeof diff.fileName === "string" ? diff.fileName : null),
    };
  });
}
