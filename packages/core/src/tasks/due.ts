import { addDays, weekday } from "../dates/calendar";
import { holidaysBetween } from "../dates/holidays";
import { DEFAULT_TIME_ZONE, resolveRelativeDue } from "../dates/relative";

/** Offsets in templates go from T-365 to T+365 (a year before or after the anchor). */
export const MAX_OFFSET_DAYS = 365;

export type DayMode = "calendar" | "business";

/** Holiday dates ("YYYY-MM-DD"); the Map from `holidaysBetween` works as well as a plain Set. */
export type HolidayDates = ReadonlySet<string> | ReadonlyMap<string, unknown>;

/** Saturdays, Sundays and public holidays are not working days. */
export function isBusinessDay(date: string, holidays: HolidayDates): boolean {
  const day = weekday(date);
  return day !== 0 && day !== 6 && !holidays.has(date);
}

/**
 * Due date of a template item: `anchorDate` plus a signed offset.
 *
 * - `calendar`: every day counts (T-30 is exactly 30 days earlier).
 * - `business`: only working days count (Mon–Fri, not a holiday in `holidays`), so "T-3" from a
 *   Monday is the Wednesday of the week before, and an offset landing on a holiday steps over it.
 *   Offset 0 keeps the anchor if it is a working day and otherwise moves to the working day before
 *   it (conservative: never later than the anchor), e.g. "T" of a Sunday event is the Friday.
 *
 * Pure date arithmetic on calendar days: no time zone, so DST changes cannot shift the result.
 * For business mode `holidays` must cover the range the offset can reach, see `holidayWindow`.
 */
export function dueDateFor(
  anchorDate: string,
  offsetDays: number,
  dayMode: DayMode,
  holidays: HolidayDates = new Set(),
): string {
  if (!Number.isInteger(offsetDays)) throw new Error(`Offset must be an integer: ${offsetDays}`);
  if (dayMode === "calendar") return addDays(anchorDate, offsetDays);

  let date = anchorDate;
  if (offsetDays === 0) {
    while (!isBusinessDay(date, holidays)) date = addDays(date, -1);
    return date;
  }
  const step = offsetDays < 0 ? -1 : 1;
  for (let left = Math.abs(offsetDays); left > 0; ) {
    date = addDays(date, step);
    if (isBusinessDay(date, holidays)) left -= 1;
  }
  return date;
}

/**
 * The range of dates whose holidays `dueDateFor` may need for an anchor and offset (business mode).
 * Generous on purpose: two calendar days per working day plus two weeks.
 */
export function holidayWindow(
  anchorDate: string,
  offsetDays: number,
): { from: string; to: string } {
  const reach = Math.abs(offsetDays) * 2 + 14;
  return { from: addDays(anchorDate, -reach), to: addDays(anchorDate, reach) };
}

/** `dueDateFor` with the NRW holidays looked up itself (for one-off calculations and tests). */
export function dueDateForNrw(anchorDate: string, offsetDays: number, dayMode: DayMode): string {
  if (dayMode === "calendar") return dueDateFor(anchorDate, offsetDays, dayMode);
  const { from, to } = holidayWindow(anchorDate, offsetDays);
  return dueDateFor(anchorDate, offsetDays, dayMode, holidaysBetween(from, to));
}

/** "09:00:00" (Postgres `time`) or "9:05" → "09:00"; null for anything that is not a clock time. */
export function clockTime(value: string | null | undefined): string | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(value?.trim() ?? "");
  return match ? `${match[1]?.padStart(2, "0")}:${match[2]}` : null;
}

/**
 * The instant a task is due: the due date at the item's wall-clock time (or the company default) in
 * the company time zone, so it keeps its local time across DST changes.
 */
export function dueInstantFor(
  dueDate: string,
  dueTime: string | null | undefined,
  defaultDueTime: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const time = clockTime(dueTime) ?? clockTime(defaultDueTime) ?? "09:00";
  return resolveRelativeDue(dueDate, 0, time, timeZone);
}

/**
 * Due instant of one template item / task for the given event anchors, or null when the event has no
 * such anchor yet ("Missing anchor → task has no due date yet", data model).
 */
export function taskDueInstant(
  anchors: ReadonlyMap<string, string>,
  rule: { anchorKey: string | null; offsetDays: number | null; dayMode: DayMode },
  holidays: HolidayDates,
  defaults: { dueTime?: string | null; defaultDueTime: string; timeZone?: string },
): Date | null {
  if (rule.anchorKey === null || rule.offsetDays === null) return null;
  const anchorDate = anchors.get(rule.anchorKey);
  if (!anchorDate) return null;
  const date = dueDateFor(anchorDate, rule.offsetDays, rule.dayMode, holidays);
  return dueInstantFor(date, defaults.dueTime, defaults.defaultDueTime, defaults.timeZone);
}

/**
 * The wall-clock time ("HH:mm") of an instant in a time zone. A task keeps its time of day when its
 * date moves, whether the time came from the template item or from the company default.
 */
export function wallClockTime(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("hour")}:${part("minute")}`;
}
