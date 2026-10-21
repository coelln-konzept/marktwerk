/**
 * Working-time rules for staff hours (M4): shift length with breaks and past-midnight shifts, ArbZG
 * checks and the §17 MiLoG recording deadline. Pure functions, no I/O.
 *
 * Times are Europe/Berlin wall-clock ("HH:mm"), days are "YYYY-MM-DD". A shift belongs to the day it
 * starts on. Lengths are real elapsed minutes, so a night shift over the DST change is an hour shorter
 * (March) or longer (October) than the clock difference.
 *
 * Legal numbers that can change (limits, break rules) are passed in as `WorkingTimeLimits`; the app
 * reads them from `legal_parameter` and falls back to `ARBZG_STATUTORY_LIMITS`, the text of the law.
 */
import { TZDate } from "@date-fns/tz";
import { addDays, daysBetween } from "../dates/calendar";

const TIME_ZONE = "Europe/Berlin";
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/** "08:30" / "08:30:00" → 510; null if it isn't a clock time. */
export function clockToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = CLOCK.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 510 → "08:30". */
export function minutesToClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The instant (ms since epoch) of a Berlin wall-clock time; a skipped spring hour moves forward. */
function berlinInstantMs(date: string, minutesOfDay: number): number {
  const [y = 0, mo = 1, d = 1] = date.split("-").map(Number);
  return new TZDate(
    y,
    mo - 1,
    d,
    Math.floor(minutesOfDay / 60),
    minutesOfDay % 60,
    0,
    0,
    TIME_ZONE,
  ).getTime();
}

export type ShiftSpan = {
  /** Day the shift starts on. */
  workDate: string;
  /** "HH:mm" */
  start: string;
  /** "HH:mm"; an end at or before the start means the shift ends the next day. */
  end: string;
  breakMinutes: number;
};

export type ShiftLength = {
  /** Real elapsed minutes from start to end. */
  grossMinutes: number;
  /** Gross minus the break (never below 0). */
  netMinutes: number;
  /** The shift ends after midnight. */
  endsNextDay: boolean;
};

/** Start and end instants (ms) of a shift, or null for invalid times. */
export function shiftInstants(
  shift: Pick<ShiftSpan, "workDate" | "start" | "end">,
): { startMs: number; endMs: number; endsNextDay: boolean } | null {
  const start = clockToMinutes(shift.start);
  const end = clockToMinutes(shift.end);
  if (start === null || end === null) return null;
  const endsNextDay = end <= start;
  const startMs = berlinInstantMs(shift.workDate, start);
  const endMs = berlinInstantMs(endsNextDay ? addDays(shift.workDate, 1) : shift.workDate, end);
  return { startMs, endMs, endsNextDay };
}

/**
 * Length of a shift. `end === start` is an empty shift (0 minutes), not 24 hours; use a real end time
 * for a long night. Returns null for invalid clock times.
 */
export function shiftLength(shift: ShiftSpan): ShiftLength | null {
  const instants = shiftInstants(shift);
  if (!instants) return null;
  if (shift.start === shift.end) return { grossMinutes: 0, netMinutes: 0, endsNextDay: false };
  const grossMinutes = Math.round((instants.endMs - instants.startMs) / 60_000);
  const breakMinutes = Math.max(0, shift.breakMinutes);
  return {
    grossMinutes,
    netMinutes: Math.max(0, grossMinutes - breakMinutes),
    endsNextDay: instants.endsNextDay,
  };
}

// ---------------------------------------------------------------------------------------------
// Which times count

export type ShiftStatus =
  | "requested"
  | "confirmed"
  | "declined"
  | "worked"
  | "no_show"
  | "cancelled";

export type ShiftTimesInput = {
  workDate: string;
  status: ShiftStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  breakMinutes: number;
};

/** Declined, cancelled and no-show shifts are not work. */
export function shiftCounts(status: ShiftStatus): boolean {
  return status === "requested" || status === "confirmed" || status === "worked";
}

/** Actual times if both were recorded, otherwise the planned ones; null if neither is complete. */
export function effectiveSpan(
  shift: ShiftTimesInput,
): (ShiftSpan & { source: "actual" | "planned" }) | null {
  if (shift.actualStart && shift.actualEnd) {
    return {
      workDate: shift.workDate,
      start: shift.actualStart.slice(0, 5),
      end: shift.actualEnd.slice(0, 5),
      breakMinutes: shift.breakMinutes,
      source: "actual",
    };
  }
  if (shift.plannedStart && shift.plannedEnd) {
    return {
      workDate: shift.workDate,
      start: shift.plannedStart.slice(0, 5),
      end: shift.plannedEnd.slice(0, 5),
      breakMinutes: shift.breakMinutes,
      source: "planned",
    };
  }
  return null;
}

/** Minutes of one shift, split into recorded work and still-planned work. */
export function shiftWork(shift: ShiftTimesInput): {
  workedMinutes: number;
  plannedMinutes: number;
} {
  if (!shiftCounts(shift.status)) return { workedMinutes: 0, plannedMinutes: 0 };
  const span = effectiveSpan(shift);
  if (!span) return { workedMinutes: 0, plannedMinutes: 0 };
  const length = shiftLength(span);
  if (!length) return { workedMinutes: 0, plannedMinutes: 0 };
  return span.source === "actual"
    ? { workedMinutes: length.netMinutes, plannedMinutes: 0 }
    : { workedMinutes: 0, plannedMinutes: length.netMinutes };
}

// ---------------------------------------------------------------------------------------------
// ArbZG

export type WorkingTimeLimits = {
  /** Longest work day in minutes (§3 ArbZG: 8 h, up to 10 h with compensation). */
  maxDailyMinutes: number;
  /** Shortest rest between two shifts (§5 ArbZG: 11 h). */
  minRestMinutes: number;
  /** Work above this many minutes needs `shortBreakMinutes` (§4: 6 h → 30 min). */
  breakAfterMinutes: number;
  shortBreakMinutes: number;
  /** Work above this many minutes needs `longBreakMinutes` (§4: 9 h → 45 min). */
  longBreakAfterMinutes: number;
  longBreakMinutes: number;
};

/** The statutory text (§§3–5 ArbZG), used when `legal_parameter` has no override. */
export const ARBZG_STATUTORY_LIMITS: WorkingTimeLimits = {
  maxDailyMinutes: 600,
  minRestMinutes: 660,
  breakAfterMinutes: 360,
  shortBreakMinutes: 30,
  longBreakAfterMinutes: 540,
  longBreakMinutes: 45,
};

/** Minimum break for this much work. */
export function requiredBreakMinutes(
  workMinutes: number,
  limits: WorkingTimeLimits = ARBZG_STATUTORY_LIMITS,
): number {
  if (workMinutes > limits.longBreakAfterMinutes) return limits.longBreakMinutes;
  if (workMinutes > limits.breakAfterMinutes) return limits.shortBreakMinutes;
  return 0;
}

export type WorkingTimeWarning =
  | { code: "daily_max"; date: string; minutes: number; limit: number }
  | {
      code: "rest_period";
      date: string;
      restMinutes: number;
      limit: number;
      /** Day of the previous shift. */
      previousDate: string;
    }
  | { code: "break_missing"; date: string; required: number; actual: number }
  | { code: "overlap"; date: string; previousDate: string };

export type WorkingTimeShift = ShiftSpan & { id?: string };

/**
 * ArbZG checks over one person's shifts (all that count as work; pass the neighbouring days too so
 * rest periods across the edge of the range are seen). Warnings, not errors: the office decides.
 */
export function checkWorkingTime(
  shifts: readonly WorkingTimeShift[],
  limits: WorkingTimeLimits = ARBZG_STATUTORY_LIMITS,
): WorkingTimeWarning[] {
  const warnings: WorkingTimeWarning[] = [];
  const dayMinutes = new Map<string, number>();
  const timed: { shift: WorkingTimeShift; startMs: number; endMs: number }[] = [];

  for (const shift of shifts) {
    const length = shiftLength(shift);
    const instants = shiftInstants(shift);
    if (!length || !instants) continue;
    dayMinutes.set(shift.workDate, (dayMinutes.get(shift.workDate) ?? 0) + length.netMinutes);
    timed.push({ shift, startMs: instants.startMs, endMs: instants.endMs });
    const required = requiredBreakMinutes(length.netMinutes, limits);
    if (required > Math.max(0, shift.breakMinutes) && length.netMinutes > 0) {
      warnings.push({
        code: "break_missing",
        date: shift.workDate,
        required,
        actual: Math.max(0, shift.breakMinutes),
      });
    }
  }

  for (const [date, minutes] of dayMinutes) {
    if (minutes > limits.maxDailyMinutes)
      warnings.push({ code: "daily_max", date, minutes, limit: limits.maxDailyMinutes });
  }

  timed.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  for (let i = 1; i < timed.length; i += 1) {
    const previous = timed[i - 1];
    const next = timed[i];
    if (!previous || !next) continue;
    const restMinutes = Math.round((next.startMs - previous.endMs) / 60_000);
    if (restMinutes < 0) {
      warnings.push({
        code: "overlap",
        date: next.shift.workDate,
        previousDate: previous.shift.workDate,
      });
    } else if (
      restMinutes < limits.minRestMinutes &&
      // A gap inside one work day is a break (checked above), not a rest period.
      previous.shift.workDate !== next.shift.workDate
    ) {
      warnings.push({
        code: "rest_period",
        date: next.shift.workDate,
        previousDate: previous.shift.workDate,
        restMinutes,
        limit: limits.minRestMinutes,
      });
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------------------------
// §17 MiLoG

/** Day on which an open record starts to alert (day 5 after the work). */
export const MILOG_ALERT_DAY = 5;
/** Last day to record (day 7 after the work, §17 MiLoG). */
export const MILOG_DEADLINE_DAYS = 7;

/** Records of a work day must exist by the end of this day. */
export function recordingDeadline(workDate: string): string {
  return addDays(workDate, MILOG_DEADLINE_DAYS);
}

/** From this day on an unrecorded shift raises an alert. */
export function recordingAlertDate(workDate: string): string {
  return addDays(workDate, MILOG_ALERT_DAY);
}

export type RecordingState =
  /** The work day is today or later. */
  | "not_due"
  /** Past, times missing, deadline still comfortably away. */
  | "pending"
  /** Day 5 to the deadline day: record now. */
  | "alert"
  /** The deadline has passed. */
  | "overdue"
  | "recorded";

export function recordingState(args: {
  workDate: string;
  hasActualTimes: boolean;
  today: string;
}): RecordingState {
  if (args.hasActualTimes) return "recorded";
  if (daysBetween(args.workDate, args.today) <= 0) return "not_due";
  if (args.today < recordingAlertDate(args.workDate)) return "pending";
  if (args.today <= recordingDeadline(args.workDate)) return "alert";
  return "overdue";
}
