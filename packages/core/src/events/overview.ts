import { addDays, daysBetween } from "../dates/calendar";
import { PERMIT_HORIZON_DEFAULT_DAYS } from "../deadlines/permit-horizon";
import { permitNeedsActionForEvent } from "../permits/action";
import { type EventPermitInput, isHeld, permitStateForEvent } from "../permits/status";
import { isFinishedStatus, isOpenStatus, type TaskStatusKey } from "../tasks/board";
import { isSnoozed } from "../tasks/snooze";
import { isOverdueTask, isWaitingPastDue } from "../tasks/waiting";

/*
 * The Überblick of an event ("is this market on track, and what's missing?", decision 2026-10-22).
 * Pure: every date is a Berlin calendar day (`YYYY-MM-DD`), `today` is passed in. Due dates are the Berlin
 * day of the task's due instant, so a task due at 09:00 today is "today", not overdue, also on the days the
 * clocks change.
 */

/** "Was fehlt" and the Kernaufgaben state "bald fällig" look this many days ahead (today included). */
export const OVERVIEW_SOON_DAYS = 7;

export type OverviewTask = {
  id: string;
  title: string;
  status: TaskStatusKey;
  /** Berlin day the task is due, null = no due date. */
  dueOn: string | null;
  isKey: boolean;
  snoozedUntil: string | null;
  /** Position in the template (`board_sort`): breaks ties on the same day so Aufbau comes before Abbau. */
  boardSort?: number;
};

// ---------------------------------------------------------------------------------------------
// status line

export type EventCountdown =
  | { kind: "upcoming"; days: number }
  | { kind: "running" }
  | { kind: "over" };

/** Days until the first event day; "running" from the first to the last event day, "over" after it. */
export function eventCountdown(
  event: { startsOn: string; endsOn: string },
  today: string,
): EventCountdown {
  if (today > event.endsOn) return { kind: "over" };
  if (today >= event.startsOn) return { kind: "running" };
  return { kind: "upcoming", days: daysBetween(today, event.startsOn) };
}

export type TaskProgress = {
  /** Done or skipped. */
  done: number;
  /** Everything that is not cancelled. */
  total: number;
  /** Not done / skipped / cancelled; snoozed tasks are still open. */
  open: number;
  /** done / total, 0 when there are no tasks. */
  ratio: number;
};

/** Tasks done of all tasks. Cancelled tasks never count; skipped ones count as finished. */
export function taskProgress(tasks: readonly Pick<OverviewTask, "status">[]): TaskProgress {
  const counted = tasks.filter((t) => t.status !== "cancelled");
  const done = counted.filter((t) => isFinishedStatus(t.status)).length;
  const total = counted.length;
  return {
    done,
    total,
    open: counted.filter((t) => isOpenStatus(t.status)).length,
    ratio: total === 0 ? 0 : done / total,
  };
}

/**
 * Does the permit let the event happen? Held (granted, also "expiring"), not expired and, if it has an end
 * date, valid on the first event day. Same rule as the automatic confirmation.
 */
export function permitCoversEvent(
  permit: EventPermitInput,
  startsOn: string,
  today: string,
  endsOn: string = startsOn,
): boolean {
  if (!isHeld(permitStateForEvent(permit, { endsOn }, today))) return false;
  return permit.validUntil === null || permit.validUntil >= startsOn;
}

/** Permits the event needs: required and not marked "nicht nötig" or replaced by a renewal. */
export function neededPermits<T extends Pick<EventPermitInput, "required" | "status">>(
  permits: readonly T[],
): T[] {
  return permits.filter(
    (p) => p.required && p.status !== "not_required" && p.status !== "superseded",
  );
}

export type PermitProgress = { granted: number; total: number };

export function permitProgress(
  permits: readonly EventPermitInput[],
  startsOn: string,
  today: string,
  endsOn: string = startsOn,
): PermitProgress {
  const needed = neededPermits(permits);
  return {
    granted: needed.filter((p) => permitCoversEvent(p, startsOn, today, endsOn)).length,
    total: needed.length,
  };
}

// ---------------------------------------------------------------------------------------------
// Was fehlt

export type MissingReason = "overdue" | "blocked" | "waiting" | "today" | "soon";

export type MissingTask = OverviewTask & {
  /** The most urgent reason: overdue > blocked > waiting > today > soon. */
  reason: MissingReason;
};

/**
 * Open, not snoozed, and overdue, blocked / waiting, or due within the next 7 days. Null = not missing.
 * A task waiting for somebody else is never "overdue", it is "waiting" (the UI says "wartet seit …").
 */
export function missingReason(task: OverviewTask, today: string): MissingReason | null {
  if (!isOpenStatus(task.status) || isSnoozed(task, today)) return null;
  if (isOverdueTask(task, today)) return "overdue";
  if (task.status === "blocked") return "blocked";
  if (task.status === "waiting_external") return "waiting";
  if (task.dueOn !== null && task.dueOn === today) return "today";
  if (task.dueOn !== null && task.dueOn <= addDays(today, OVERVIEW_SOON_DAYS)) return "soon";
  return null;
}

/** Key tasks first, then earliest due date (no date last), then template position, then title. */
function compareTasks(a: OverviewTask, b: OverviewTask): number {
  if (a.isKey !== b.isKey) return a.isKey ? -1 : 1;
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  const bySort = (a.boardSort ?? 0) - (b.boardSort ?? 0);
  if (bySort !== 0) return bySort;
  return a.title.localeCompare(b.title, "de");
}

export function missingTasks(tasks: readonly OverviewTask[], today: string): MissingTask[] {
  return tasks
    .flatMap((t) => {
      const reason = missingReason(t, today);
      return reason ? [{ ...t, reason }] : [];
    })
    .sort(compareTasks);
}

export type OverviewPermit = EventPermitInput & { id: string; title: string };

/**
 * Needed permits that do not cover the event yet and need action (`permitNeedsActionForEvent`: not just
 * filed, apply-by overdue or within the permit horizon, anything within 14 days of the market); the most
 * pressing (earliest apply-by) first.
 */
export function missingPermits<T extends OverviewPermit>(
  permits: readonly T[],
  startsOn: string,
  today: string,
  endsOn: string = startsOn,
  horizonDays: number = PERMIT_HORIZON_DEFAULT_DAYS,
): T[] {
  return neededPermits(permits)
    .filter(
      (p) =>
        !permitCoversEvent(p, startsOn, today, endsOn) &&
        permitNeedsActionForEvent(p, { startsOn, endsOn }, today, horizonDays),
    )
    .sort((a, b) => {
      if (a.applyBy !== b.applyBy) {
        if (a.applyBy === null) return 1;
        if (b.applyBy === null) return -1;
        return a.applyBy < b.applyBy ? -1 : 1;
      }
      return a.title.localeCompare(b.title, "de");
    });
}

// ---------------------------------------------------------------------------------------------
// Kernaufgaben

export type KeyTaskState = "done" | "open" | "soon" | "overdue" | "waiting" | "snoozed";

/**
 * State of a Kernaufgabe: done (also skipped) · snoozed (hidden until its date) · waiting (waiting for somebody
 * else, past its date) · overdue (due before today) · soon (due within 7 days, today included) · open. Cancelled tasks have no state (null).
 */
export function keyTaskState(task: OverviewTask, today: string): KeyTaskState | null {
  if (task.status === "cancelled") return null;
  if (isFinishedStatus(task.status)) return "done";
  if (isSnoozed(task, today)) return "snoozed";
  if (isWaitingPastDue(task, today)) return "waiting";
  if (task.dueOn !== null && task.dueOn < today) return "overdue";
  if (task.dueOn !== null && task.dueOn <= addDays(today, OVERVIEW_SOON_DAYS)) return "soon";
  return "open";
}

export type KeyTaskRow = OverviewTask & { state: KeyTaskState };

/** The checklist: all key tasks with their state, undone first (by due date), finished ones last. */
export function keyTasks(tasks: readonly OverviewTask[], today: string): KeyTaskRow[] {
  return tasks
    .filter((t) => t.isKey)
    .flatMap((t) => {
      const state = keyTaskState(t, today);
      return state ? [{ ...t, state }] : [];
    })
    .sort((a, b) => {
      const aDone = a.state === "done";
      const bDone = b.state === "done";
      if (aDone !== bDone) return aDone ? 1 : -1;
      return compareTasks(a, b);
    });
}

// ---------------------------------------------------------------------------------------------
// Nächste Termine

export type TimelineDate = { key: string; date: string };

/** Upcoming dates (today included) soonest first; past dates separately, most recent first. */
export function splitTimeline<T extends TimelineDate>(
  dates: readonly T[],
  today: string,
): { upcoming: T[]; past: T[] } {
  const sorted = [...dates].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    upcoming: sorted.filter((d) => d.date >= today),
    past: sorted.filter((d) => d.date < today).reverse(),
  };
}
