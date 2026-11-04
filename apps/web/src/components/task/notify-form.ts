import {
  checkNotifySetting,
  DEFAULT_TIME_ZONE,
  type NotifyChannel,
  type NotifyProblem,
  type NotifyTiming,
  resolveRelativeDue,
} from "@marktwerk/core";
import type { NotifyInput } from "@/server/services/tasks";

/** What the form holds; `at` is the `datetime-local` text (wall clock in Europe/Berlin). */
export type NotifyFormValue = {
  channels: NotifyChannel[];
  timing: NotifyTiming | "";
  at: string;
};

export const NO_NOTIFY: NotifyFormValue = { channels: [], timing: "", at: "" };

const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/** `datetime-local` text → the instant, reading it as Europe/Berlin wall clock (null when incomplete). */
export function instantOf(at: string): Date | null {
  const match = WALL_CLOCK.exec(at);
  if (!match) return null;
  const [, day, time] = match as unknown as [string, string, string];
  try {
    return resolveRelativeDue(day, 0, time, DEFAULT_TIME_ZONE);
  } catch {
    return null;
  }
}

/** An instant → `datetime-local` text in Europe/Berlin wall clock. */
export function wallClockOf(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** The saved setting as form state. */
export function notifyFormOf(saved: NotifyInput): NotifyFormValue {
  return {
    channels: saved.channels,
    timing: saved.timing ?? "",
    at: saved.at ? wallClockOf(saved.at) : "",
  };
}

/** The form state as the service input (instant for the custom moment). */
export function notifyInputOf(value: NotifyFormValue): NotifyInput {
  if (value.channels.length === 0) return { channels: [], timing: null, at: null };
  const timing = value.timing || null;
  return {
    channels: value.channels,
    timing,
    at: timing === "custom" ? (instantOf(value.at)?.toISOString() ?? null) : null,
  };
}

/** What is wrong with the form state, if anything (same rule the service applies). */
export function notifyProblemOf(value: NotifyFormValue, hasDue: boolean): NotifyProblem | null {
  const input = notifyInputOf(value);
  return checkNotifySetting(
    { channels: input.channels, timing: input.timing, at: input.at ? new Date(input.at) : null },
    hasDue,
  );
}

/** Timings computed from the due date (so they need one). */
export const RELATIVE_TIMINGS: readonly NotifyTiming[] = [
  "due_day",
  "before_1d",
  "before_3d",
  "before_7d",
];
