import "server-only";
import { event, task } from "@marktwerk/db/schema";
import { and, eq, exists, isNull, or, type SQL, sql } from "drizzle-orm";
import { type Actor, visibleEvents } from "./actor";
import { db } from "./db";

/**
 * Row-level scope for tasks (decision 2026-10-21: field users only for their events).
 * - Office users and managers: every task of a visible (not archived) event, plus tasks without an event.
 * - Field users: tasks of events they work at, plus event-less tasks assigned to them.
 */
export function visibleTasks(actor: Actor): SQL {
  const eventVisible = exists(
    db
      .select({ one: event.id })
      .from(event)
      .where(and(eq(event.id, task.eventId), visibleEvents(actor))),
  );
  if (actor.role !== "field") return or(isNull(task.eventId), eventVisible) as SQL;
  if (!actor.staffMemberId) return sql`false`;
  return or(
    eventVisible,
    and(isNull(task.eventId), eq(task.assigneeId, actor.staffMemberId)),
  ) as SQL;
}
