import { addDays, isIsoDate, mondayOf } from "../dates/calendar";

/*
 * Snoozing ("Zurückstellen"): a task is hidden from the due lists, KPIs, reminders and the digest until a
 * Berlin calendar date. On that date it is back automatically; no job is needed. The due date never changes.
 */

export const SNOOZE_PRESETS = ["tomorrow", "next_week"] as const;
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number];

/** Snoozed while `snoozedUntil` is after `today`; on the snooze date itself the task is back. */
export function isSnoozed(task: { snoozedUntil: string | null }, today: string): boolean {
  return task.snoozedUntil !== null && task.snoozedUntil > today;
}

/** "Morgen" is the next day, "Nächste Woche" the next Monday (on a Monday: the Monday a week later). */
export function snoozePresetDate(preset: SnoozePreset, today: string): string {
  return preset === "tomorrow" ? addDays(today, 1) : addDays(mondayOf(today), 7);
}

/** A snooze date must be a real calendar date after today. */
export function isValidSnoozeDate(until: unknown, today: string): until is string {
  return isIsoDate(until) && until > today;
}
