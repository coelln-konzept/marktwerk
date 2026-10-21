import { berlinDay, isOpenStatus, type TaskStatusKey } from "./board";

/*
 * Carry-over ("Übertrag", data model "Carry-over"): an unfinished task whose due date has passed is
 * carried into the next day. The nightly job counts it, tells the assignee, and after the third
 * carry-over tells the manager. All rules here are pure so the job can run any number of times.
 */

/** The manager is told when a task has been carried over this many times (decision: 3). */
export const ESCALATION_ROLLOVERS = 3;

export type RolloverCandidate = {
  status: TaskStatusKey;
  dueAt: Date | null;
  lastRolledAt: Date | null;
};

/**
 * Overdue and unfinished (todo, in progress, waiting, blocked) and not yet counted today. Counting
 * once per Berlin calendar day makes the job idempotent: a second run on the same day does nothing,
 * and a day the job missed is counted once, not twice.
 */
export function isRolloverCandidate(task: RolloverCandidate, today: string): boolean {
  if (!isOpenStatus(task.status) || !task.dueAt) return false;
  if (berlinDay(task.dueAt) >= today) return false;
  return !task.lastRolledAt || berlinDay(task.lastRolledAt) < today;
}

/** The manager is told exactly when the count reaches the threshold (not every night after that). */
export function shouldEscalate(newCount: number): boolean {
  return newCount === ESCALATION_ROLLOVERS;
}

export function rolloverDedupeKey(taskId: string, count: number): string {
  return `task:${taskId}:rolled-over:${count}`;
}

export function escalationDedupeKey(taskId: string, count: number): string {
  return `task:${taskId}:escalated:${count}`;
}
