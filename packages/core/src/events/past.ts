import { addDays } from "../dates/calendar";

/*
 * Past markets (decision 2026-10-22, UX pass): open tasks of a market that is long over drop out of every
 * cross-market list and KPI (Übersicht, Board, Kalender, reminders, digest). They stay on the event's own
 * board and can be skipped in bulk ("Aufräumen"). Nothing closes silently.
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

/** Reason stored on tasks skipped by the cleanup, so the audit trail says why. */
export const PAST_EVENT_SKIP_REASON = "Markt vorbei (aufgeräumt)";
