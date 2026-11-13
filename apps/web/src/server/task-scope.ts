import "server-only";
import { pastEventCutoff, resolveRelativeDue } from "@marktwerk/core";
import { isOwnWorkItem, isTopLevel } from "@marktwerk/db";
import { event, task } from "@marktwerk/db/schema";
import { and, eq, exists, gte, isNull, or, type SQL, sql } from "drizzle-orm";
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

/**
 * Leftovers of past markets stay out of every cross-market list and KPI (Übersicht, Board, Kalender): tasks
 * without an event, tasks of an event whose last day is at most 7 days ago (`pastEventCutoff`), and tasks
 * due today or later (follow-up work of a past market, `isPastMarketLeftover`) stay.
 * Do not apply this to an event's own board or Überblick; the event page shows all of its tasks.
 */
export function notOfPastEvent(today: string): SQL {
  return or(
    isNull(task.eventId),
    exists(
      db
        .select({ one: event.id })
        .from(event)
        .where(and(eq(event.id, task.eventId), gte(event.endsOn, pastEventCutoff(today)))),
    ),
    gte(task.dueAt, resolveRelativeDue(today, 0, "00:00")),
  ) as SQL;
}

/**
 * Whose tasks the Übersicht and the Kalender show: owners and managers see all visible top-level tasks (subtasks
 * count through their parent, ADR 0021), everybody else their own list: their top-level tasks plus the subtasks
 * assigned to them whose parent is somebody else's (`isOwnWorkItem`). The Kalender narrows to the own list with
 * "Nur meine Zuständigkeit".
 */
export function deadlineScope(actor: Actor, mineOnly = false): SQL {
  if (!mineOnly && (actor.role === "owner" || actor.role === "manager"))
    return and(visibleTasks(actor), isTopLevel()) as SQL;
  if (!actor.staffMemberId) return sql`false`;
  return and(visibleTasks(actor), eq(task.assigneeId, actor.staffMemberId), isOwnWorkItem()) as SQL;
}
