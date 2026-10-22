import { type Dueness, dueness, isOpenStatus, type TaskStatusKey } from "./board";

/*
 * "Wartet" tasks (status `waiting_external`, "Wartet · Amt"): somebody else has to act. Past their due
 * date they are not overdue (nothing for the user to do), they show a neutral "wartet seit <Datum>".
 * Pure; callers pass Berlin dates.
 */

export type DueInput = { status: TaskStatusKey; dueOn: string | null };

/** Open, due before today and not waiting for somebody else. */
export function isOverdueTask(task: DueInput, today: string): boolean {
  return (
    isOpenStatus(task.status) &&
    task.status !== "waiting_external" &&
    task.dueOn !== null &&
    task.dueOn < today
  );
}

/** Waiting for somebody else and past the due date: shown as "wartet seit …". */
export function isWaitingPastDue(task: DueInput, today: string): boolean {
  return task.status === "waiting_external" && task.dueOn !== null && task.dueOn < today;
}

export type TaskDueness = Dueness | { kind: "waiting_since"; since: string };

/** `dueness` that knows about waiting tasks (the due date is shown as the day the wait began). */
export function taskDueness(task: DueInput, today: string): TaskDueness {
  if (isWaitingPastDue(task, today)) return { kind: "waiting_since", since: task.dueOn as string };
  return dueness(task.dueOn, today);
}
