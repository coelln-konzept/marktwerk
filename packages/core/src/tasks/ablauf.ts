import { daysBetween } from "../dates/calendar";
import type { TaskStatusKey } from "./board";
import { isFinishedStatus } from "./board";

/**
 * "Ablauf" view of one event's board: every task in one list, grouped by its phase relative to the market
 * day (UX decision 2026-10-24). Open work that is due today or earlier comes first, then the weeks before
 * the market, the market day(s), the follow-up work and tasks without a date. It is the event's
 * Checkliste (user test 2026-11): finished tasks stay in their phase, in place, instead of moving away.
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
  /** Berlin day a finished task was finished, `YYYY-MM-DD`. */
  completedOn?: string | null;
  /** Position in the template (`board_sort`): breaks ties on the same day so Aufbau comes before Abbau. */
  boardSort?: number;
};

/**
 * Which phase a task belongs to. Open tasks due today or earlier are always "now", whatever the phase.
 * Finished ones are not overdue, so they sit where their due date puts them; one ticked off today stays
 * in "now" until tomorrow, so ticking never moves the row away under the cursor.
 */
export function ablaufPhase(task: AblaufTaskInput, ctx: AblaufContext): AblaufPhase {
  if (task.dueOn === null) return "undated";
  const finished = isFinishedStatus(task.status);
  if (task.dueOn <= ctx.today && (!finished || task.completedOn === ctx.today)) return "now";
  if (task.dueOn > ctx.endsOn) return "after";
  if (task.dueOn >= ctx.startsOn) return "event";
  const before = daysBetween(task.dueOn, ctx.startsOn);
  if (before > 28) return "early";
  if (before > 14) return "weeks_4";
  if (before > 7) return "weeks_2";
  return "week";
}

/**
 * Within a phase: earliest due first (oldest overdue on top), Kernaufgaben before others on the same day,
 * then the template order (Aufbau → Veranstaltung → Abbau), the title only as the last tie-break.
 */
export function compareAblauf(a: AblaufTaskInput, b: AblaufTaskInput): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  if (a.isKey !== b.isKey) return a.isKey ? -1 : 1;
  const bySort = (a.boardSort ?? 0) - (b.boardSort ?? 0);
  if (bySort !== 0) return bySort;
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
