/**
 * Reminder rules for the deadline sweep (see docs/architecture/data-model.md,
 * "Deadline sweep"). Everything here is pure, so the worker can run the sweep
 * repeatedly and idempotently.
 */

export type Priority = "low" | "normal" | "high" | "critical";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before the due date at which a "due soon" reminder fires. */
export const DEFAULT_TASK_REMINDER_DAYS: Record<Priority, readonly number[]> = {
  low: [1],
  normal: [3, 1],
  high: [3, 1],
  critical: [7, 3, 1],
};

export const DEFAULT_PERMIT_APPLY_REMINDER_DAYS = [30, 14, 7] as const;
export const DEFAULT_PERMIT_EXPIRY_REMINDER_DAYS = [60, 30] as const;

export type DueState =
  | { kind: "none" }
  | { kind: "due_soon"; daysBefore: number }
  | { kind: "overdue" };

/**
 * Which reminder (if any) applies right now. Returns the *closest* threshold
 * already crossed, so a task created 2 days before its deadline gets the
 * "3 days" reminder immediately rather than nothing.
 */
export function dueState(dueAt: Date, now: Date, reminderDays: readonly number[]): DueState {
  const msLeft = dueAt.getTime() - now.getTime();
  if (msLeft < 0) return { kind: "overdue" };
  const crossed = [...reminderDays].sort((a, b) => a - b).find((days) => msLeft <= days * DAY_MS);
  return crossed === undefined ? { kind: "none" } : { kind: "due_soon", daysBefore: crossed };
}

/**
 * Deterministic key, unique per (user, entity, reminder, deadline). Including
 * the deadline means moving a due date re-arms its reminders automatically.
 */
export function reminderDedupeKey(
  entity: "task" | "permit",
  entityId: string,
  state: Exclude<DueState, { kind: "none" }>,
  dueAt: Date,
): string {
  const stage = state.kind === "overdue" ? "overdue" : `due-${state.daysBefore}d`;
  return `${entity}:${entityId}:${stage}:${dueAt.toISOString()}`;
}
