import { addDays } from "../dates/calendar";
import type { HealthLevel } from "./health";

/*
 * The weekend verdict of the Übersicht ("Zwei Fragen", decision 2026-10-29): one line per market that
 * answers "is it on track?" with Im Plan ● · Achtung ▲ · Nicht startklar ■ and says why
 * ("4 überfällig · 1 Genehmigung fehlt"). Only what can hold a market up counts: overdue tasks, tasks
 * due today, blocked tasks and permits that are missing. A task dated in the future never blocks.
 * Overdue is critical, as on Board > Bereitschaft. Pure; the Übersicht query feeds in the counts.
 */

/** The verdict level; `none` = nothing is tracked for the market yet. */
export type VerdictLevel = HealthLevel | "none";

export type VerdictReasonKey =
  | "tasksOverdue"
  | "tasksToday"
  | "tasksBlocked"
  | "tasksRollover"
  | "permitsMissing"
  | "permitsEnding"
  | "permitsOk";

/** What the verdict is made of; `count` feeds the plural message. */
export type VerdictReason = { key: VerdictReasonKey; count?: number };

export type WeekendVerdict = { level: VerdictLevel; reasons: VerdictReason[] };

export type VerdictInput = {
  /** Permit dimension of the event's health (`null` = no permit tracked). */
  permits: HealthLevel | null;
  /** Required permits that are not held (health counts, or the overdue permit deadlines if more). */
  permitsMissing: number;
  /** Task dimension of the event's health (`null` = no open task). */
  tasks: HealthLevel | null;
  /** Open tasks of the market whose due date has passed (waiting-for-others excluded). */
  tasksOverdue: number;
  /** Open tasks of the market due today. */
  tasksDueToday: number;
  tasksBlocked: number;
};

const RANK: Record<HealthLevel, number> = { ok: 0, warn: 1, critical: 2 };

function worst(levels: (HealthLevel | null)[]): HealthLevel | null {
  let out: HealthLevel | null = null;
  for (const level of levels) {
    if (level && (out === null || RANK[level] > RANK[out])) out = level;
  }
  return out;
}

/** The verdict of one market. Overdue tasks make it critical, anything due today or blocked a warning. */
export function weekendVerdict(input: VerdictInput): WeekendVerdict {
  const { permits, permitsMissing, tasks, tasksOverdue, tasksDueToday, tasksBlocked } = input;

  const taskLevel: HealthLevel | null =
    tasksOverdue > 0 || tasks === "critical"
      ? "critical"
      : tasksDueToday > 0 || tasksBlocked > 0 || tasks === "warn"
        ? "warn"
        : tasks;
  const permitLevel: HealthLevel | null = permitsMissing > 0 ? (permits ?? "warn") : permits;
  const level = worst([taskLevel, permitLevel]);
  if (level === null) return { level: "none", reasons: [] };
  if (level === "ok") return { level: "ok", reasons: [] };

  const reasons: VerdictReason[] = [];
  if (tasksOverdue > 0) reasons.push({ key: "tasksOverdue", count: tasksOverdue });
  if (permitLevel === "critical" || permitLevel === "warn") {
    reasons.push(
      permitsMissing > 0
        ? { key: "permitsMissing", count: permitsMissing }
        : { key: "permitsEnding" },
    );
  }
  if (tasksBlocked > 0) reasons.push({ key: "tasksBlocked", count: tasksBlocked });
  if (tasksDueToday > 0) reasons.push({ key: "tasksToday", count: tasksDueToday });
  // Critical for no counted reason: the carry-over rule (a task pushed back three times).
  if (tasks === "critical" && tasksOverdue === 0 && tasksBlocked === 0) {
    reasons.push({ key: "tasksRollover" });
  }
  // Say what is fine, too: "Nicht startklar · 4 überfällig · Genehmigungen ok".
  if (permitLevel === "ok") reasons.push({ key: "permitsOk" });
  return { level, reasons };
}

/**
 * Whether a due item holds a market up: an overdue or due-today task, or a permit whose deadline has
 * passed. Items due later this week, "waiting" tasks and anything of another kind do not.
 */
export function holdsUpWeekend(item: { kind: string; urgency: string }): boolean {
  return (
    (item.kind === "task" || item.kind === "permit") &&
    (item.urgency === "overdue" || item.urgency === "today")
  );
}

/** Saturday and Sunday of the weekend after the one that starts on `saturday`. */
export function followingWeekend(saturday: string): { saturday: string; sunday: string } {
  const next = addDays(saturday, 7);
  return { saturday: next, sunday: addDays(next, 1) };
}
