import { addDays } from "../dates/calendar";
import { DEFAULT_TIME_ZONE, resolveRelativeDue } from "../dates/relative";
import { berlinDay } from "./board";

/** Where a task notification goes ("Benachrichtigung senden an"). Nothing is sent until mail/WhatsApp are connected. */
export const NOTIFY_CHANNELS = ["email", "whatsapp"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export const NOTIFY_TIMINGS = [
  "on_create",
  "due_day",
  "before_1d",
  "before_3d",
  "before_7d",
  "custom",
] as const;
export type NotifyTiming = (typeof NOTIFY_TIMINGS)[number];

export type NotifySetting = {
  channels: NotifyChannel[];
  timing: NotifyTiming | null;
  at: Date | null;
};
export type NotifyProblem =
  | "timing_required"
  | "at_required"
  | "due_required"
  | "unexpected_timing";

/** Wall-clock time (company time zone) at which due-relative notifications go out. */
const SEND_TIME = "08:00";
const BEFORE: Partial<Record<NotifyTiming, number>> = {
  due_day: 0,
  before_1d: 1,
  before_3d: 3,
  before_7d: 7,
};

/** Whether a notify setting is consistent; `hasDue` says whether the task has a due date. */
export function checkNotifySetting(s: NotifySetting, hasDue: boolean): NotifyProblem | null {
  if (s.channels.length === 0) return s.timing || s.at ? "unexpected_timing" : null;
  if (!s.timing) return "timing_required";
  if (s.timing === "custom") return s.at ? null : "at_required";
  if (s.at) return "unexpected_timing";
  if (s.timing !== "on_create" && !hasDue) return "due_required";
  return null;
}

/** The instant the notification is due to be sent, or null when none applies. */
export function notifyMoment(
  s: NotifySetting,
  due: Date | null,
  createdAt: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date | null {
  if (s.channels.length === 0 || !s.timing) return null;
  if (s.timing === "on_create") return createdAt;
  if (s.timing === "custom") return s.at;
  if (!due) return null;
  const day = addDays(berlinDay(due, timeZone), -(BEFORE[s.timing] ?? 0));
  return resolveRelativeDue(day, 0, SEND_TIME, timeZone);
}
