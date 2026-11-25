/*
 * Subtasks (ADR 0021): a subtask is a task with `parent_task_id` set, one level deep. These are the pure rules;
 * the services and queries apply them (the SQL counterparts live in @marktwerk/db `task-tree`).
 *
 * - Nesting: a task can't be its own parent, a subtask can't have subtasks, a task with subtasks can't become
 *   a subtask, and parent and subtask belong to the same event (or both to none).
 * - Lists and counts work on top-level tasks; each carries the progress of its subtasks and whether one is
 *   overdue (shown on the parent: an overdue subtask counts once, through its parent).
 * - A person's own list also holds the subtasks assigned to them, unless the parent is theirs too (then the
 *   parent stands for it): see {@link isOwnWorkItem}.
 */
import { isOpenStatus, type TaskStatusKey } from "./board";
import { isOverdueTask } from "./waiting";

export type NestingProblem =
  /** The task would be its own parent. */
  | "self"
  /** The chosen parent is a subtask itself (one level only). */
  | "parent_is_subtask"
  /** The task has subtasks of its own, so it can't become one. */
  | "has_subtasks"
  /** Parent and subtask belong to different events. */
  | "other_event"
  /** The parent is deleted (cancelled). */
  | "parent_cancelled"
  /** The parent is finished (done or skipped) and the task is still open: the parent could not be done. */
  | "parent_closed";

export type NestingInput = {
  taskId: string;
  taskEventId: string | null;
  /** Whether the task has subtasks (in any status). */
  taskHasSubtasks: boolean;
  /** Whether the task is still open (todo, in progress, waiting, blocked). */
  taskOpen: boolean;
  parent: {
    id: string;
    eventId: string | null;
    parentTaskId: string | null;
    status: TaskStatusKey;
  };
};

/** Why `taskId` can't become a subtask of `parent`, or null when it can. */
export function nestingProblem(input: NestingInput): NestingProblem | null {
  if (input.parent.id === input.taskId) return "self";
  if (input.parent.parentTaskId !== null) return "parent_is_subtask";
  if (input.taskHasSubtasks) return "has_subtasks";
  if (input.parent.eventId !== input.taskEventId) return "other_event";
  if (input.parent.status === "cancelled") return "parent_cancelled";
  if (input.taskOpen && !isOpenStatus(input.parent.status)) return "parent_closed";
  return null;
}

export type SubtaskState = {
  status: TaskStatusKey;
  /** `YYYY-MM-DD` (Berlin) or null. */
  dueOn: string | null;
  /** `YYYY-MM-DD` the subtask is snoozed until, or null. */
  snoozedUntil?: string | null;
};

export type SubtaskProgress = {
  /** Subtasks that are not deleted (cancelled). */
  total: number;
  /** Of those, finished (done or skipped). */
  done: number;
  /** Open subtasks that are overdue (not waiting for somebody else, not snoozed). */
  overdue: number;
};

/** Overdue in the sense of every list: open, due before today, not waiting, not snoozed. */
export function isSubtaskOverdue(subtask: SubtaskState, today: string): boolean {
  if (subtask.snoozedUntil && subtask.snoozedUntil > today) return false;
  return isOverdueTask(subtask, today);
}

/** "3/5" and the overdue flag of a parent (same rules as the SQL aggregates in @marktwerk/db). */
export function subtaskProgress(subtasks: readonly SubtaskState[], today: string): SubtaskProgress {
  let total = 0;
  let done = 0;
  let overdue = 0;
  for (const s of subtasks) {
    if (s.status === "cancelled") continue;
    total += 1;
    if (s.status === "done" || s.status === "skipped") done += 1;
    else if (isSubtaskOverdue(s, today)) overdue += 1;
  }
  return { total, done, overdue };
}

/** Open subtasks block the parent's "done" (the done gate, see `missingEvidence`). */
export function openSubtaskCount(subtasks: readonly Pick<SubtaskState, "status">[]): number {
  return subtasks.filter((s) => isOpenStatus(s.status)).length;
}

/**
 * Whether a task is an item of its assignee's own list ("Meine Aufgaben", digest, own reminders): every
 * top-level task, and a subtask that is assigned to somebody other than whoever has the parent (else the
 * parent already stands for it, so nothing is counted twice).
 */
export function isOwnWorkItem(t: {
  parentTaskId: string | null;
  assigneeId: string | null;
  parentAssigneeId: string | null;
}): boolean {
  if (t.parentTaskId === null) return true;
  return t.assigneeId !== null && t.assigneeId !== t.parentAssigneeId;
}

/**
 * The due instant a reminder job uses for a top-level task: its own, unless an open subtask is already overdue
 * and earlier (an overdue subtask flags its parent). `fromSubtask` tells the caller to say so.
 */
export function flaggedDueAt(
  ownDueAt: Date | null,
  openSubtaskDues: readonly (Date | null)[],
  now: Date,
): { dueAt: Date | null; fromSubtask: boolean } {
  let earliest: Date | null = null;
  for (const due of openSubtaskDues) {
    if (due === null || due.getTime() >= now.getTime()) continue;
    if (earliest === null || due.getTime() < earliest.getTime()) earliest = due;
  }
  if (earliest !== null && (ownDueAt === null || earliest.getTime() < ownDueAt.getTime()))
    return { dueAt: earliest, fromSubtask: true };
  return { dueAt: ownDueAt, fromSubtask: false };
}

// ---------------------------------------------------------------------------------------------------------
// Templates: child items (`template_item.parent_key`)

export type TreeIssue = {
  key: string;
  code: "unknown_parent" | "self_parent" | "nested_child";
};

/**
 * Child items must point at another item of the same version that is not a child itself (one level).
 */
export function checkItemTree(
  items: readonly { stableKey: string; parentKey: string | null }[],
): TreeIssue[] {
  const parentOf = new Map(items.map((i) => [i.stableKey, i.parentKey]));
  const issues: TreeIssue[] = [];
  for (const item of items) {
    if (item.parentKey === null) continue;
    if (item.parentKey === item.stableKey)
      issues.push({ key: item.stableKey, code: "self_parent" });
    else if (!parentOf.has(item.parentKey))
      issues.push({ key: item.stableKey, code: "unknown_parent" });
    else if (parentOf.get(item.parentKey) !== null)
      issues.push({ key: item.stableKey, code: "nested_child" });
  }
  return issues;
}

/** The schedule and role fields a child item can take over from its parent. */
export type InheritableItem = {
  anchorKey: string;
  offsetDays: number;
  dayMode: "calendar" | "business";
  dueTime: string | null;
  dutyRoleId: string | null;
};

/**
 * What a child item's task is scheduled and assigned by: the parent's anchor, offset, day mode and time unless
 * the child has `ownDue`, and the parent's duty role unless the child names one.
 */
export function inheritedItem<T extends InheritableItem & { ownDue: boolean }>(
  child: T,
  parent: InheritableItem | null,
): T {
  if (!parent) return child;
  const due = child.ownDue
    ? {}
    : {
        anchorKey: parent.anchorKey,
        offsetDays: parent.offsetDays,
        dayMode: parent.dayMode,
        dueTime: parent.dueTime,
      };
  return { ...child, ...due, dutyRoleId: child.dutyRoleId ?? parent.dutyRoleId };
}

/**
 * Items in instantiation order: every top-level item before the children, so a child's parent task exists
 * when the child's task is written. Children whose parent is not in the list are dropped (the parent does
 * not apply to the event, so neither do they).
 */
export function parentsFirst<T extends { stableKey: string; parentKey: string | null }>(
  items: readonly T[],
): T[] {
  const keys = new Set(items.filter((i) => i.parentKey === null).map((i) => i.stableKey));
  return [
    ...items.filter((i) => i.parentKey === null),
    ...items.filter((i) => i.parentKey !== null && keys.has(i.parentKey)),
  ];
}
