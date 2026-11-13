import { type EventTimesInput, isClockTime } from "./details";

/**
 * Zeitplan (ADR 0022): a market's and an event's times as a list of windows, each saying who it is for,
 * what happens, on which day and from–to. Times are local wall-clock "HH:mm" in Europe/Berlin; windows
 * past midnight are not supported (from < to on the same day).
 */

export const SCHEDULE_AUDIENCES = ["team", "vendors", "visitors"] as const;
export const SCHEDULE_KINDS = ["setup", "open", "teardown"] as const;
/** In chronological order: `before` = the day before the first day. */
export const SCHEDULE_DAYS = ["before", "first", "each", "last"] as const;

export type ScheduleAudience = (typeof SCHEDULE_AUDIENCES)[number];
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export type ScheduleDay = (typeof SCHEDULE_DAYS)[number];

export type ScheduleRow = {
  audience: ScheduleAudience;
  kind: ScheduleKind;
  day: ScheduleDay;
  /** "HH:mm" */
  from: string;
  /** "HH:mm", after `from` */
  to: string;
};

export type Schedule = ScheduleRow[];

/** The three rows every new market starts with (ADR 0022). Copy before changing. */
export const DEFAULT_SCHEDULE: readonly Readonly<ScheduleRow>[] = Object.freeze([
  Object.freeze({
    audience: "vendors",
    kind: "setup",
    day: "first",
    from: "06:00",
    to: "08:00",
  } as const),
  Object.freeze({
    audience: "visitors",
    kind: "open",
    day: "each",
    from: "08:00",
    to: "16:00",
  } as const),
  Object.freeze({
    audience: "vendors",
    kind: "teardown",
    day: "last",
    from: "16:00",
    to: "18:00",
  } as const),
]);

/** A fresh, mutable copy of DEFAULT_SCHEDULE. */
export function defaultSchedule(): Schedule {
  return DEFAULT_SCHEDULE.map((row) => ({ ...row }));
}

/** End of a "before" setup window migrated from a setup time later than opening (see scheduleFromTimes). */
const END_OF_DAY = "23:59";

/**
 * The old four fields (`times`) → a Zeitplan, per ADR 0022's migration rule:
 * - visitors · open · each · open–close;
 * - vendors · setup · first · setup–open, only if setup is before open. A setup time after opening was
 *   allowed for multi-day markets meaning "set up the day before", so it becomes
 *   vendors · setup · before · setup–23:59. Setup equal to open gives no setup row;
 * - vendors · teardown · last · close–teardown, only if teardown is after close (equal: no row).
 *
 * Missing, empty or malformed fields fall back to the DEFAULT_SCHEDULE value of that field
 * (setup 06:00, open 08:00, close 16:00, teardown 18:00). If open/close still don't form a window
 * (open ≥ close), both fall back to the default 08:00–16:00. Rows come out sorted (sortSchedule).
 */
export function scheduleFromTimes(
  times: Partial<Record<keyof EventTimesInput, string | null>> | null | undefined,
): Schedule {
  const pick = (value: string | null | undefined, fallback: string) =>
    isClockTime(value) ? value : fallback;
  let open = pick(times?.open, "08:00");
  let close = pick(times?.close, "16:00");
  if (open >= close) {
    open = "08:00";
    close = "16:00";
  }
  const setup = pick(times?.setup, "06:00");
  const teardown = pick(times?.teardown, "18:00");

  const rows: Schedule = [];
  if (setup < open)
    rows.push({ audience: "vendors", kind: "setup", day: "first", from: setup, to: open });
  else if (setup > open && setup < END_OF_DAY)
    rows.push({ audience: "vendors", kind: "setup", day: "before", from: setup, to: END_OF_DAY });
  rows.push({ audience: "visitors", kind: "open", day: "each", from: open, to: close });
  if (teardown > close)
    rows.push({ audience: "vendors", kind: "teardown", day: "last", from: close, to: teardown });
  return sortSchedule(rows);
}

export type ScheduleIssueCode =
  /** audience, kind or day is not one of the known values */
  | "invalid_row"
  /** from or to is not "HH:mm" (00:00–23:59) */
  | "invalid_time"
  /** from is not before to */
  | "from_not_before_to"
  /** `before` used with something other than setup */
  | "before_not_setup"
  /** single-day event: a teardown window that starts before the visitors open */
  | "teardown_before_open"
  /** same audience, kind, day, from and to as an earlier row */
  | "duplicate_row"
  /** no visitors · open row at all (overall) */
  | "no_visitor_hours";

/** `row` = index into the validated array; null for an issue about the whole Zeitplan. */
export type ScheduleIssue = { code: ScheduleIssueCode; row: number | null };

function assertDuration(durationDays: number) {
  if (!Number.isInteger(durationDays) || durationDays < 1)
    throw new RangeError(`durationDays must be a positive integer, got ${durationDays}`);
}

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

/** Whether a row's audience, kind and day are known values and its times are well-formed. */
function isWellFormed(row: ScheduleRow): boolean {
  return (
    isOneOf(SCHEDULE_AUDIENCES, row.audience) &&
    isOneOf(SCHEDULE_KINDS, row.kind) &&
    isOneOf(SCHEDULE_DAYS, row.day) &&
    isClockTime(row.from) &&
    isClockTime(row.to) &&
    row.from < row.to
  );
}

/**
 * Every problem in a Zeitplan; empty = fine. At most one issue per row (the first that applies, in the
 * order of ScheduleIssueCode), plus `no_visitor_hours` once for the whole list.
 *
 * Day rules (ADR 0022: "day only where it makes sense for the event length"):
 * - `first`, `each` and `last` are valid for any length. On a single-day event they all mean that one
 *   day, so the default Zeitplan (setup first · open each · teardown last) fits every market.
 * - `before` (the day before the first day) is valid for any length, but only for setup: nobody opens or
 *   tears down before the event starts.
 * - The early tear-down on the last morning (vendors · teardown · last · 07:00–10:00) needs a night the
 *   goods stood through, so on a single-day event a teardown row on that day (`first`/`each`/`last`)
 *   that starts before the earliest visitor opening of that day is flagged `teardown_before_open`. A
 *   teardown starting during opening hours (a stand leaving early) is the user's call.
 *
 * Throws a RangeError if durationDays isn't a positive integer (a caller bug, not user input).
 */
export function validateSchedule(
  rows: readonly ScheduleRow[],
  durationDays: number,
): ScheduleIssue[] {
  assertDuration(durationDays);
  const issues: ScheduleIssue[] = [];
  const seen = new Set<string>();
  const firstDayOpen =
    durationDays === 1
      ? rowsForDay(rows.filter(isWellFormed), 0, 1)
          .filter((r) => r.audience === "visitors" && r.kind === "open")
          .map((r) => r.from)
          .sort()[0]
      : undefined;

  rows.forEach((row, index) => {
    const code = rowIssue(row, firstDayOpen, seen);
    if (code) issues.push({ code, row: index });
  });

  if (!rows.some((r) => r.audience === "visitors" && r.kind === "open"))
    issues.push({ code: "no_visitor_hours", row: null });
  return issues;
}

/** The first issue of one row; records well-formed rows in `seen` to find duplicates. */
function rowIssue(
  row: ScheduleRow,
  firstDayOpen: string | undefined,
  seen: Set<string>,
): ScheduleIssueCode | null {
  if (
    !isOneOf(SCHEDULE_AUDIENCES, row.audience) ||
    !isOneOf(SCHEDULE_KINDS, row.kind) ||
    !isOneOf(SCHEDULE_DAYS, row.day)
  )
    return "invalid_row";
  if (!isClockTime(row.from) || !isClockTime(row.to)) return "invalid_time";
  if (row.from >= row.to) return "from_not_before_to";
  if (row.day === "before" && row.kind !== "setup") return "before_not_setup";
  if (
    firstDayOpen !== undefined &&
    row.kind === "teardown" &&
    row.day !== "before" &&
    row.from < firstDayOpen
  )
    return "teardown_before_open";
  const key = `${row.audience}|${row.kind}|${row.day}|${row.from}|${row.to}`;
  if (seen.has(key)) return "duplicate_row";
  seen.add(key);
  return null;
}

const DAY_ORDER: Record<ScheduleDay, number> = { before: 0, first: 1, each: 2, last: 3 };
const KIND_ORDER: Record<ScheduleKind, number> = { setup: 0, open: 1, teardown: 2 };
const AUDIENCE_ORDER: Record<ScheduleAudience, number> = { team: 0, vendors: 1, visitors: 2 };

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A sorted copy: by day (before < first < each < last), then from, then to; ties by kind
 * (setup < open < teardown) and audience (team < vendors < visitors) so the order is deterministic.
 */
export function sortSchedule<T extends ScheduleRow>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => (DAY_ORDER[a.day] ?? 9) - (DAY_ORDER[b.day] ?? 9) || compareTime(a, b),
  );
}

/** Within one day: from, then to, then kind and audience. */
function compareTime(a: ScheduleRow, b: ScheduleRow): number {
  return (
    compare(a.from, b.from) ||
    compare(a.to, b.to) ||
    (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||
    (AUDIENCE_ORDER[a.audience] ?? 9) - (AUDIENCE_ORDER[b.audience] ?? 9)
  );
}

/**
 * The rows that apply on day `dayIndex` of an event of `durationDays` days, in time order (from, then
 * to; `day` plays no part since all of them happen that day).
 * Day 0 is the first day, durationDays − 1 the last, −1 the day before (only `before` rows).
 * `each` applies on every event day; on a single-day event `first`, `each` and `last` all apply on day 0.
 * Days outside −1 … durationDays − 1 have no rows.
 */
export function rowsForDay<T extends ScheduleRow>(
  rows: readonly T[],
  dayIndex: number,
  durationDays: number,
): T[] {
  assertDuration(durationDays);
  if (!Number.isInteger(dayIndex) || dayIndex < -1 || dayIndex >= durationDays) return [];
  const applies = (day: ScheduleDay) => {
    if (dayIndex === -1) return day === "before";
    if (day === "each") return true;
    if (day === "first") return dayIndex === 0;
    if (day === "last") return dayIndex === durationDays - 1;
    return false;
  };
  return rows.filter((row) => applies(row.day)).sort(compareTime);
}

export type ScheduleSummary = {
  /**
   * Visitor hours of the first day: the span from the earliest start to the latest end of the
   * visitors · open rows on `first`/`each` (falls back to `last` rows if there are none). Null if the
   * Zeitplan has no well-formed visitors · open row.
   */
  open: { from: string; to: string } | null;
  /**
   * Earliest vendor setup: of the vendors · setup rows, the one on the earliest day, then the earliest
   * time. Null if there is none.
   */
  earliestSetup: string | null;
  /** The day of earliestSetup, so the UI can say "Aufbau ab Vortag 18:00"; null with earliestSetup. */
  earliestSetupDay: ScheduleDay | null;
};

/**
 * The compact summary for places where space is short ("08–16 Uhr · Aufbau ab 06:00", ADR 0022).
 * Malformed rows (see validateSchedule) are ignored.
 */
export function scheduleSummary(rows: readonly ScheduleRow[]): ScheduleSummary {
  const valid = rows.filter(isWellFormed);
  const visitorRows = valid.filter((r) => r.audience === "visitors" && r.kind === "open");
  const firstDay = visitorRows.filter((r) => r.day === "first" || r.day === "each");
  const openRows = firstDay.length > 0 ? firstDay : visitorRows.filter((r) => r.day === "last");
  const open =
    openRows.length > 0
      ? {
          from: openRows.map((r) => r.from).sort()[0] as string,
          to: openRows
            .map((r) => r.to)
            .sort()
            .at(-1) as string,
        }
      : null;
  const setup = sortSchedule(
    valid.filter((r) => r.audience === "vendors" && r.kind === "setup"),
  )[0];
  return { open, earliestSetup: setup?.from ?? null, earliestSetupDay: setup?.day ?? null };
}
