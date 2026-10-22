/*
 * "Auf Veranstaltungen anwenden…" (data model, "Template propagation"): the merge rules for bringing the
 * tasks of one checklist in line with a newer template version. Pure; the service reads the rows,
 * calls `planPropagation` and writes the result, so the preview and the real run can never differ.
 *
 *  - an item without a task          → add a task
 *  - an item with an open task        → update the task's fields (unless the task was customised)
 *  - a task whose item is gone        → mark it `removed_from_template` (unless done or customised)
 *  - done / skipped / cancelled tasks → never touched (comments, evidence and history stay as they are)
 *  - customised tasks                 → never touched
 */

export const CLOSED_TASK_STATUSES = ["done", "skipped", "cancelled"] as const;

/** Open = still has to be done: anything that is not done, skipped or cancelled. */
export function isOpenTask(status: string): boolean {
  return !(CLOSED_TASK_STATUSES as readonly string[]).includes(status);
}

/** The fields of an item that end up on its task (with the due instant and assignee already worked out). */
export type PropagatedFields = {
  title: string;
  description: string | null;
  phase: string;
  category: string;
  priority: string;
  estimateMinutes: number;
  requiresPhoto: boolean;
  requiresNote: boolean;
  requiresAttachment: boolean;
  dutyRoleId: string | null;
  /** Due instant in ms since epoch, null = no due date (anchor missing). */
  dueAt: number | null;
};

export type PlanItem = PropagatedFields & { stableKey: string };

export type PlanTask = PropagatedFields & {
  id: string;
  templateStableKey: string | null;
  status: string;
  customized: boolean;
  removedFromTemplate: boolean;
  /** Due date edited by hand: the schedule of the item does not apply. */
  dueOverridden: boolean;
};

export type PropagationChange =
  | "title"
  | "description"
  | "phase"
  | "category"
  | "priority"
  | "estimate"
  | "evidence"
  | "duty"
  | "due"
  | "restored";

export type KeepReason = "customized" | "closed";

export type PropagationPlan<I extends PlanItem = PlanItem, T extends PlanTask = PlanTask> = {
  /** Items that get a new task. */
  add: I[];
  /** Open, untouched tasks whose item changed. */
  update: { task: T; item: I; changes: PropagationChange[] }[];
  /** Open, untouched tasks whose item no longer exists (marked, not deleted). */
  remove: T[];
  /** Tasks that stay exactly as they are because someone worked on them. */
  keep: { task: T; reason: KeepReason }[];
  /** Tasks that already match their item. */
  same: number;
};

/** Which fields of the task differ from what the item would produce. */
export function propagationChanges(item: PlanItem, task: PlanTask): PropagationChange[] {
  const changes: PropagationChange[] = [];
  if (task.removedFromTemplate) changes.push("restored");
  if (task.title !== item.title) changes.push("title");
  if ((task.description ?? null) !== (item.description ?? null)) changes.push("description");
  if (task.phase !== item.phase) changes.push("phase");
  if (task.category !== item.category) changes.push("category");
  if (task.priority !== item.priority) changes.push("priority");
  if (task.estimateMinutes !== item.estimateMinutes) changes.push("estimate");
  if (
    task.requiresPhoto !== item.requiresPhoto ||
    task.requiresNote !== item.requiresNote ||
    task.requiresAttachment !== item.requiresAttachment
  )
    changes.push("evidence");
  if (task.dutyRoleId !== item.dutyRoleId) changes.push("duty");
  if (!task.dueOverridden && task.dueAt !== item.dueAt) changes.push("due");
  return changes;
}

/** Applies the merge rules above to the items of the new version and the existing tasks of a checklist. */
export function planPropagation<I extends PlanItem, T extends PlanTask>(
  items: readonly I[],
  tasks: readonly T[],
): PropagationPlan<I, T> {
  const plan: PropagationPlan<I, T> = { add: [], update: [], remove: [], keep: [], same: 0 };
  const byKey = new Map<string, T>();
  for (const task of tasks) if (task.templateStableKey) byKey.set(task.templateStableKey, task);
  const itemKeys = new Set(items.map((i) => i.stableKey));

  for (const item of items) {
    const task = byKey.get(item.stableKey);
    if (!task) {
      plan.add.push(item);
      continue;
    }
    if (!isOpenTask(task.status)) plan.keep.push({ task, reason: "closed" });
    else if (task.customized) plan.keep.push({ task, reason: "customized" });
    else {
      const changes = propagationChanges(item, task);
      if (changes.length > 0) plan.update.push({ task, item, changes });
      else plan.same += 1;
    }
  }

  for (const task of tasks) {
    if (!task.templateStableKey || itemKeys.has(task.templateStableKey)) continue;
    if (!isOpenTask(task.status)) plan.keep.push({ task, reason: "closed" });
    else if (task.customized) plan.keep.push({ task, reason: "customized" });
    else if (!task.removedFromTemplate) plan.remove.push(task);
    else plan.same += 1;
  }
  return plan;
}

/** Number of changes a plan makes (what the preview calls "Änderungen"). */
export function planSize(plan: PropagationPlan): number {
  return plan.add.length + plan.update.length + plan.remove.length;
}
