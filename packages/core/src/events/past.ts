import { addDays } from "../dates/calendar";

/*
 * Past markets (decision 2026-10-22, UX pass): open tasks of a market that is long over drop out of every
 * cross-market list and KPI (Übersicht, Board, Kalender, reminders, digest). They stay on the event's own
 * board and can be skipped in bulk ("Aufräumen"). Nothing closes silently.
 * Refined 2026-10-26: only tasks that are already due (or have no date) count as leftovers. Follow-up work
 * of a past market that is due today or later (e.g. "Belege zuordnen") stays in the lists like any other task.
 */

/** An event is past once its last day lies more than this many Berlin calendar days before today. */
export const PAST_EVENT_GRACE_DAYS = 7;

/**
 * The first last-day an event can have and still count as current: events ending on or after this date
 * are current, events ending before it are past. Calendar-day arithmetic, so DST switches do not matter.
 */
export function pastEventCutoff(today: string): string {
  return addDays(today, -PAST_EVENT_GRACE_DAYS);
}

/** True when the event's last day (`endsOn`, `YYYY-MM-DD`) is more than 7 days before `today`. */
export function isPastEvent(endsOn: string, today: string): boolean {
  return endsOn < pastEventCutoff(today);
}

/**
 * A leftover of a past market: its market ended more than 7 days ago and the task is not upcoming work (due
 * before today, or without a due date). Only leftovers drop out of the lists and go to "Aufräumen". Tasks
 * without a market are never leftovers.
 */
export function isPastMarketLeftover(
  endsOn: string | null,
  dueOn: string | null,
  today: string,
): boolean {
  if (endsOn === null || !isPastEvent(endsOn, today)) return false;
  return dueOn === null || dueOn < today;
}

/** Reason stored on tasks skipped by the cleanup, so the audit trail says why. */
export const PAST_EVENT_SKIP_REASON = "Markt vorbei (aufgeräumt)";
