import { addDays, daysBetween } from "../dates/calendar";
import { type EventPermitInput, isHeld, permitStateForEvent } from "../permits/status";
import { isFinishedStatus, isOpenStatus, type TaskStatusKey } from "./board";
import { isSnoozed } from "./snooze";
import { isOverdueTask, isWaitingPastDue } from "./waiting";

/*
 * Board views across events: "Bereitschaftsliste" (one row per upcoming market) and the
 * "Kernaufgaben-Matrix" (markets x key tasks). Pure: callers pass Berlin business dates (`YYYY-MM-DD`)
 * and `today`, so nothing here depends on the machine's clock or time zone.
 */

/** A task due within this many days (today included) is "bald fällig" in the matrix. */
export const MATRIX_SOON_DAYS = 7;
/** A missing permit within this many days of the first event day is critical (matches the health rule). */
export const PERMIT_CLOSE_DAYS = 14;
/** The matrix shows at most this many key-task columns. */
export const MATRIX_MAX_COLUMNS = 10;

export type ReadinessTask = {
  id: string;
  title: string;
  status: TaskStatusKey;
  category: string;
  isKey: boolean;
  /** Berlin due date. */
  dueOn: string | null;
  snoozedUntil: string | null;
};

/** The next open task by due date. */
export type NextDeadline = { id: string; title: string; dueOn: string };

export type Readiness = {
  /** Tasks that count (everything except cancelled). */
  total: number;
  /** Finished (done or skipped). */
  done: number;
  /** Open, not snoozed, due before today; tasks waiting for somebody else do not count. */
  overdue: number;
  /** Required permits that are not held for the event's first day. */
  missingPermits: number;
  /** Open key tasks (Kernaufgaben), snoozed ones included. */
  openKey: number;
  next: NextDeadline | null;
};

/** Required permits not held for the event: not granted (or granted but ending before the first day). */
export function countMissingPermits(
  permits: readonly EventPermitInput[],
  eventStartsOn: string,
  today: string,
  eventEndsOn: string = eventStartsOn,
): number {
  let missing = 0;
  for (const p of permits) {
    if (!p.required || p.status === "not_required" || p.status === "superseded") continue;
    const state = permitStateForEvent(p, { endsOn: eventEndsOn }, today);
    if (isHeld(state) && !(p.validUntil !== null && p.validUntil < eventStartsOn)) continue;
    missing += 1;
  }
  return missing;
}

/** One row of the Bereitschaftsliste. Cancelled tasks are ignored; a snoozed task is neither overdue nor next. */
export function summarizeReadiness(
  tasks: readonly ReadinessTask[],
  permits: readonly EventPermitInput[],
  eventStartsOn: string,
  today: string,
  eventEndsOn: string = eventStartsOn,
): Readiness {
  let total = 0;
  let done = 0;
  let overdue = 0;
  let openKey = 0;
  let next: ReadinessTask | null = null;
  for (const t of tasks) {
    if (t.status === "cancelled") continue;
    total += 1;
    if (isFinishedStatus(t.status)) {
      done += 1;
      continue;
    }
    if (!isOpenStatus(t.status)) continue;
    if (t.isKey) openKey += 1;
    if (isSnoozed(t, today) || t.dueOn === null) continue;
    if (isOverdueTask(t, today)) overdue += 1;
    // Waiting for somebody else past the date: nothing to do, so not "the next deadline" either.
    if (isWaitingPastDue(t, today)) continue;
    if (
      next === null ||
      t.dueOn < (next.dueOn as string) ||
      (t.dueOn === next.dueOn && Number(t.isKey) > Number(next.isKey))
    )
      next = t;
  }
  return {
    total,
    done,
    overdue,
    missingPermits: countMissingPermits(permits, eventStartsOn, today, eventEndsOn),
    openKey,
    next: next ? { id: next.id, title: next.title, dueOn: next.dueOn as string } : null,
  };
}

export type ReadinessAttention = "ok" | "warn" | "critical";

/** Worst first: overdue tasks or a missing permit close to the date are critical, any missing permit warns. */
export function readinessAttention(
  r: Readiness,
  eventStartsOn: string,
  today: string,
): ReadinessAttention {
  const close = daysBetween(today, eventStartsOn) <= PERMIT_CLOSE_DAYS;
  if (r.overdue > 0 || (r.missingPermits > 0 && close)) return "critical";
  if (r.missingPermits > 0) return "warn";
  return "ok";
}

// ---------------------------------------------------------------------------------------------
// Matrix

export type MatrixCellState =
  | "done"
  | "open"
  | "soon"
  | "overdue"
  | "waiting"
  | "snoozed"
  | "absent";

/** State of one matrix cell. `null` = the market has no such task ("–"). */
export function matrixCellState(
  task: Pick<ReadinessTask, "status" | "dueOn" | "snoozedUntil"> | null,
  today: string,
): MatrixCellState {
  if (task === null || task.status === "cancelled") return "absent";
  if (isFinishedStatus(task.status)) return "done";
  if (isSnoozed(task, today)) return "snoozed";
  if (task.dueOn === null) return "open";
  if (isWaitingPastDue(task, today)) return "waiting";
  if (task.dueOn < today) return "overdue";
  return task.dueOn <= addDays(today, MATRIX_SOON_DAYS) ? "soon" : "open";
}

/** Stable identity of a key task across events: the template item's stable key, else the title. */
export function matrixColumnKey(task: { templateStableKey: string | null; title: string }): string {
  return task.templateStableKey
    ? `k:${task.templateStableKey}`
    : `t:${task.title.trim().toLowerCase()}`;
}

export type MatrixSourceTask = {
  eventId: string;
  templateStableKey: string | null;
  title: string;
  dueOn: string | null;
  eventStartsOn: string;
};

export type MatrixColumn = { key: string; title: string; events: number };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * The matrix columns: one per key task that occurs among the events, in their usual due order (median
 * days before the first event day, earliest first). Over `max` columns, those present in the most events
 * win (ties: the earlier due), and the kept ones are shown in due order again. The title is the most
 * common one of that key.
 */
export function selectMatrixColumns(
  tasks: readonly MatrixSourceTask[],
  max: number = MATRIX_MAX_COLUMNS,
): MatrixColumn[] {
  const groups = new Map<
    string,
    { titles: Map<string, number>; lead: number[]; events: Set<string> }
  >();
  for (const t of tasks) {
    const key = matrixColumnKey(t);
    const g = groups.get(key) ?? {
      titles: new Map<string, number>(),
      lead: [] as number[],
      events: new Set<string>(),
    };
    g.titles.set(t.title, (g.titles.get(t.title) ?? 0) + 1);
    if (t.dueOn) g.lead.push(daysBetween(t.dueOn, t.eventStartsOn));
    g.events.add(t.eventId);
    groups.set(key, g);
  }
  const all = [...groups.entries()].map(([key, g]) => {
    const [title] = [...g.titles.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"),
    )[0] as [string, number];
    return {
      key,
      title,
      events: g.events.size,
      // No due date anywhere: sorts last.
      lead: g.lead.length ? median(g.lead) : Number.NEGATIVE_INFINITY,
    };
  });
  const byDue = (a: (typeof all)[number], b: (typeof all)[number]) =>
    b.lead - a.lead || a.title.localeCompare(b.title, "de");
  const kept =
    all.length > max
      ? [...all].sort((a, b) => b.events - a.events || byDue(a, b)).slice(0, max)
      : all;
  return kept.sort(byDue).map(({ key, title, events }) => ({ key, title, events }));
}

/** Short header label: the title cut at a word boundary near `max` characters, with an ellipsis. */
export function shortLabel(title: string, max = 18): string {
  const clean = title.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space >= max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

const CELL_RANK: Record<MatrixCellState, number> = {
  overdue: 0,
  soon: 1,
  waiting: 2,
  open: 3,
  snoozed: 4,
  done: 5,
  absent: 6,
};

/** When an event has several tasks for one column (several checklists), the one needing attention most. */
export function pickCellTask<T extends Pick<ReadinessTask, "status" | "dueOn" | "snoozedUntil">>(
  candidates: readonly T[],
  today: string,
): T | null {
  let best: T | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const rank = CELL_RANK[matrixCellState(c, today)];
    if (rank < bestRank) {
      best = c;
      bestRank = rank;
    }
  }
  return bestRank === CELL_RANK.absent ? null : best;
}
