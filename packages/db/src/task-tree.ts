import { and, isNull, or, type SQL, sql } from "drizzle-orm";
import { task } from "./schema";

/*
 * Shared SQL for subtasks (ADR 0021), used by the web queries and the jobs so every list and count treats
 * them alike. The pure counterparts (and their tests) are in @marktwerk/core `tasks/subtasks`.
 *
 * - Company-wide lists and counts (board, Übersicht, Kalender, event summaries, company notifications):
 *   top-level tasks only ({@link isTopLevel}), each with {@link subtaskAggregates}; an overdue subtask flags its
 *   parent ({@link hasOverdueSubtask}), so it is counted once, through the parent.
 * - A person's own list (their Übersicht/Kalender, digest, their reminders, workload per person): work items
 *   ({@link isOwnWorkItem}): top-level tasks plus subtasks assigned to somebody other than the parent's assignee.
 *
 * The subqueries use the table name `app.task` with their own alias and refer to the outer row as `task`, so
 * they fit any query whose `task` table is not aliased.
 */

/** Open = still to be done (same list as `OPEN_STATUSES` in @marktwerk/core). */
const OPEN = sql.raw(`('todo', 'in_progress', 'waiting_external', 'blocked')`);

/** Top-level tasks only (`parent_task_id is null`). */
export function isTopLevel(): SQL {
  return isNull(task.parentTaskId);
}

/**
 * A work item of its assignee: a top-level task, or a subtask with an assignee other than the parent's (else the
 * parent stands for it). Combine with `assignee_id = me` for one person's list.
 */
export function isOwnWorkItem(): SQL {
  return or(
    isNull(task.parentTaskId),
    and(
      sql`${task.assigneeId} is not null`,
      sql`not exists (select 1 from "app"."task" own_parent where own_parent."id" = ${task.parentTaskId}
        and own_parent."assignee_id" is not distinct from ${task.assigneeId})`,
    ),
  ) as SQL;
}

/**
 * The open subtasks of the outer task that are overdue on `today`: due before the start of today (`todayStart`,
 * Berlin midnight), not waiting for somebody else, not snoozed. Same rule as `isSubtaskOverdue`.
 */
function overdueSubtaskWhere(today: string, todayStart: Date): SQL {
  return sql`st."parent_task_id" = ${task.id} and st."status" in ${OPEN}
    and st."status" <> 'waiting_external' and st."due_at" < ${todayStart}
    and (st."snoozed_until" is null or st."snoozed_until" <= ${today})`;
}

/** True when an open subtask of the outer task is overdue (the parent shows the flag). */
export function hasOverdueSubtask(today: string, todayStart: Date): SQL<boolean> {
  return sql<boolean>`exists (select 1 from "app"."task" st where ${overdueSubtaskWhere(today, todayStart)})`;
}

/**
 * Overdue as every count means it, through the parent: the task itself is overdue (open, due before today, not
 * waiting) or one of its open subtasks is. Callers filter open and not snoozed tasks themselves.
 */
export function isOverdueWithSubtasks(today: string, todayStart: Date): SQL<boolean> {
  return sql<boolean>`((${task.dueAt} < ${todayStart} and ${task.status} <> 'waiting_external') or ${hasOverdueSubtask(today, todayStart)})`;
}

/**
 * Subtask progress of the outer task for a list row: `subtasksTotal` (not deleted), `subtasksDone` (done or
 * skipped), `subtasksOpen`, `subtasksOverdue` (see {@link hasOverdueSubtask}). All zero for a task without
 * subtasks.
 */
export function subtaskAggregates(today: string, todayStart: Date) {
  return {
    subtasksTotal: sql<number>`(select count(*)::int from "app"."task" st where st."parent_task_id" = ${task.id} and st."status" <> 'cancelled')`,
    subtasksDone: sql<number>`(select count(*)::int from "app"."task" st where st."parent_task_id" = ${task.id} and st."status" in ('done', 'skipped'))`,
    subtasksOpen: sql<number>`(select count(*)::int from "app"."task" st where st."parent_task_id" = ${task.id} and st."status" in ${OPEN})`,
    subtasksOverdue: sql<number>`(select count(*)::int from "app"."task" st where ${overdueSubtaskWhere(today, todayStart)})`,
  };
}

/** The outer subtask's parent is still open (jobs leave subtasks of finished or deleted parents alone). */
export function parentIsOpen(): SQL {
  return or(
    isNull(task.parentTaskId),
    sql`exists (select 1 from "app"."task" open_parent where open_parent."id" = ${task.parentTaskId}
      and open_parent."status" in ${OPEN})`,
  ) as SQL;
}
