import { daysBetween } from "../dates/calendar";
import type { TaskStatusKey } from "./board";
import { isFinishedStatus } from "./board";

/**
 * "Ablauf" view of one event's board: every task in one list, grouped by its phase relative to the market
 * day (UX decision 2026-10-24). Open work that is due today or earlier comes first, then the weeks before
 * the market, the market day(s), the follow-up work, tasks without a date, and finished tasks last.
 */
export const ABLAUF_PHASES = [
  "now",
  "early",
  "weeks_4",
  "weeks_2",
  "week",
  "event",
  "after",
  "undated",
  "done",
] as const;

export type AblaufPhase = (typeof ABLAUF_PHASES)[number];

export type AblaufContext = {
  /** Berlin calendar day, `YYYY-MM-DD`. */
  today: string;
  /** First and last day of the event. */
  startsOn: string;
  endsOn: string;
};

export type AblaufTaskInput = {
  status: TaskStatusKey;
  /** Berlin day the task is due, null = no due date. */
  dueOn: string | null;
  title: string;
  isKey: boolean;
};

/** Which phase a task belongs to. Open tasks due today or earlier are always "now", whatever the phase. */
export function ablaufPhase(task: AblaufTaskInput, ctx: AblaufContext): AblaufPhase {
  if (isFinishedStatus(task.status)) return "done";
  if (task.dueOn === null) return "undated";
  if (task.dueOn <= ctx.today) return "now";
  if (task.dueOn > ctx.endsOn) return "after";
  if (task.dueOn >= ctx.startsOn) return "event";
  const before = daysBetween(task.dueOn, ctx.startsOn);
  if (before > 28) return "early";
  if (before > 14) return "weeks_4";
  if (before > 7) return "weeks_2";
  return "week";
}

/** Within a phase: earliest due first (oldest overdue on top), Kernaufgaben before others on the same day. */
export function compareAblauf(a: AblaufTaskInput, b: AblaufTaskInput): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  if (a.isKey !== b.isKey) return a.isKey ? -1 : 1;
  return a.title.localeCompare(b.title, "de");
}

/** The non-empty phases in display order, each sorted with `compareAblauf`. */
export function groupAblauf<T extends AblaufTaskInput>(
  tasks: readonly T[],
  ctx: AblaufContext,
): { phase: AblaufPhase; tasks: T[] }[] {
  const byPhase = new Map<AblaufPhase, T[]>();
  for (const task of tasks) {
    const phase = ablaufPhase(task, ctx);
    const list = byPhase.get(phase);
    if (list) list.push(task);
    else byPhase.set(phase, [task]);
  }
  return ABLAUF_PHASES.flatMap((phase) => {
    const list = byPhase.get(phase);
    return list ? [{ phase, tasks: list.sort(compareAblauf) }] : [];
  });
}
