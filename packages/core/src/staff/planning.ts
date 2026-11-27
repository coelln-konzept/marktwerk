// packages/core/src/staff/planning.ts
import { addDays, daysBetween, isoWeek } from "../dates/calendar";
import {
  rowsForDay,
  SCHEDULE_KINDS,
  type ScheduleKind,
  type ScheduleRow,
} from "../events/schedule";
import { contractOn, monthEnd, monthStart } from "./hours";
import {
  ARBZG_STATUTORY_LIMITS,
  checkWorkingTime,
  effectiveSpan,
  requiredBreakMinutes,
  type ShiftStatus,
  type ShiftTimesInput,
  shiftCounts,
  shiftLength,
  shiftWork,
  type WorkingTimeLimits,
  type WorkingTimeWarning,
} from "./worktime";

/**
 * Shift planning (spec 2026-11-26-shift-allocator-design.md §4). The budget is company policy, not law: the
 * Minijob cap in hours with a margin (40 h per month by default, per person on the contract).
 */
export const DEFAULT_MONTHLY_HOUR_BUDGET = 40;
/** "Knapp": at most one typical market shift left. */
export const TIGHT_MINUTES = 4 * 60;
/** §12 TzBfG: work on call must be announced at least four days ahead. */
export const SHORT_NOTICE_DAYS = 4;

export type BudgetContract = {
  validFrom: string;
  validUntil: string | null;
  monthlyHourBudget: number | null;
};

/** The budget of a month: the contract valid on the month's last day that has one, else the default. */
export function hourBudget(
  contracts: readonly BudgetContract[],
  month: string,
  defaultHours: number,
): { minutes: number; noContract: boolean } {
  const from = monthStart(month);
  for (let day = monthEnd(month); day >= from; day = addDays(day, -1)) {
    const contract = contractOn(contracts, day);
    if (contract)
      return {
        minutes: Math.round((contract.monthlyHourBudget ?? defaultHours) * 60),
        noContract: false,
      };
  }
  return { minutes: Math.round(defaultHours * 60), noContract: true };
}

export type MonthUsage = {
  /** Shifts with recorded times. */
  workedMinutes: number;
  /** Planned, status bestätigt. */
  confirmedMinutes: number;
  /** Planned, status angefragt (not yet answered). */
  requestedMinutes: number;
};

/** Minutes of the month that count against the budget (requested, confirmed and worked shifts). */
export function monthUsage(shifts: readonly ShiftTimesInput[], month: string): MonthUsage {
  const from = monthStart(month);
  const to = monthEnd(month);
  const usage: MonthUsage = { workedMinutes: 0, confirmedMinutes: 0, requestedMinutes: 0 };
  for (const shift of shifts) {
    if (shift.workDate < from || shift.workDate > to) continue;
    const work = shiftWork(shift);
    usage.workedMinutes += work.workedMinutes;
    if (shift.status === "requested") usage.requestedMinutes += work.plannedMinutes;
    else usage.confirmedMinutes += work.plannedMinutes;
  }
  return usage;
}

export type BudgetLevel = "ok" | "tight" | "over";

export function budgetStatus(
  usage: MonthUsage,
  budgetMinutes: number,
): { usedMinutes: number; leftMinutes: number; level: BudgetLevel } {
  const usedMinutes = usage.workedMinutes + usage.confirmedMinutes + usage.requestedMinutes;
  const leftMinutes = budgetMinutes - usedMinutes;
  const level: BudgetLevel =
    leftMinutes < 0 ? "over" : leftMinutes <= TIGHT_MINUTES ? "tight" : "ok";
  return { usedMinutes, leftMinutes, level };
}

export type WeekTotal = { year: number; week: number; minutes: number };

/** Minutes per ISO week (information only: a Minijob has no weekly limit). */
export function weekTotals(shifts: readonly ShiftTimesInput[]): WeekTotal[] {
  const byWeek = new Map<string, WeekTotal>();
  for (const shift of shifts) {
    const work = shiftWork(shift);
    const minutes = work.workedMinutes + work.plannedMinutes;
    if (minutes === 0) continue;
    const { year, week } = isoWeek(shift.workDate);
    const key = `${year}-${String(week).padStart(2, "0")}`;
    const total = byWeek.get(key) ?? { year, week, minutes: 0 };
    total.minutes += minutes;
    byWeek.set(key, total);
  }
  return [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, total]) => total);
}

/** Less than four days ahead (today counts as 0). Past days are not "short notice". */
export function shortNotice(workDate: string, today: string): boolean {
  const days = daysBetween(today, workDate);
  return days >= 0 && days < SHORT_NOTICE_DAYS;
}

export type StaffingRow = { dutyRoleKey: string; count: number; scheduleKind: ScheduleKind };
export const MAX_STAFFING_ROWS = 20;
export const MAX_HEADCOUNT = 30;

/** "Personalbedarf" of a market (or event): null when the shape is wrong. Role + kind is unique. */
export function parseStaffing(input: unknown): StaffingRow[] | null {
  if (!Array.isArray(input) || input.length > MAX_STAFFING_ROWS) return null;
  const seen = new Set<string>();
  const rows: StaffingRow[] = [];
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") return null;
    const { dutyRoleKey, count, scheduleKind } = raw as Record<string, unknown>;
    if (typeof dutyRoleKey !== "string" || dutyRoleKey.trim() === "") return null;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > MAX_HEADCOUNT)
      return null;
    if (
      typeof scheduleKind !== "string" ||
      !(SCHEDULE_KINDS as readonly string[]).includes(scheduleKind)
    )
      return null;
    const key = `${dutyRoleKey}|${scheduleKind}`;
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({ dutyRoleKey, count, scheduleKind: scheduleKind as ScheduleKind });
  }
  return rows;
}

export type NeedDraft = {
  workDate: string;
  dutyRoleKey: string;
  scheduleKind: ScheduleKind;
  headcount: number;
  plannedStart: string | null;
  plannedEnd: string | null;
};

/**
 * The needs of an event: per day (the day before included) and staffing row, the window of that kind that day.
 * The team's own row wins; without one, any row of that kind that day (earliest from, latest to). No row of that
 * kind that day = no need that day.
 */
export function needsFromStaffing(
  staffing: readonly StaffingRow[],
  schedule: readonly ScheduleRow[],
  startsOn: string,
  durationDays: number,
): NeedDraft[] {
  const needs: NeedDraft[] = [];
  for (let dayIndex = -1; dayIndex < durationDays; dayIndex += 1) {
    const rows = rowsForDay(schedule, dayIndex, durationDays);
    if (rows.length === 0) continue;
    const workDate = addDays(startsOn, dayIndex);
    for (const row of staffing) {
      if (row.count === 0) continue;
      const ofKind = rows.filter((r) => r.kind === row.scheduleKind);
      const team = ofKind.filter((r) => r.audience === "team");
      const pick = team.length > 0 ? team : ofKind;
      if (pick.length === 0) continue;
      const from = pick.map((r) => r.from).sort()[0] ?? null;
      const to =
        pick
          .map((r) => r.to)
          .sort()
          .at(-1) ?? null;
      needs.push({
        workDate,
        dutyRoleKey: row.dutyRoleKey,
        scheduleKind: row.scheduleKind,
        headcount: row.count,
        plannedStart: from,
        plannedEnd: to,
      });
    }
  }
  const kindOrder = (k: ScheduleKind) => SCHEDULE_KINDS.indexOf(k);
  return needs.sort(
    (a, b) =>
      (a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : 0) ||
      kindOrder(a.scheduleKind) - kindOrder(b.scheduleKind),
  );
}

/** Filled = requested + confirmed (declined and cancelled reopen the slot). */
export function needGaps(
  headcount: number,
  statuses: readonly ShiftStatus[],
): { filled: number; open: number; over: number } {
  const filled = statuses.filter((s) => s === "requested" || s === "confirmed").length;
  return { filled, open: Math.max(0, headcount - filled), over: Math.max(0, filled - headcount) };
}

/**
 * Net minutes of a planned slot with the statutory break deducted (the break a new shift gets). ArbZG §4 counts
 * work without the break: the break is the smallest one (0, 30, 45 min) that covers what the remaining work needs.
 */
export function slotMinutes(
  slot: { workDate: string; plannedStart: string; plannedEnd: string },
  limits: WorkingTimeLimits = ARBZG_STATUTORY_LIMITS,
): { net: number; breakMinutes: number } {
  const gross =
    shiftLength({
      workDate: slot.workDate,
      start: slot.plannedStart,
      end: slot.plannedEnd,
      breakMinutes: 0,
    })?.grossMinutes ?? 0;
  const breakMinutes =
    [0, limits.shortBreakMinutes, limits.longBreakMinutes].find(
      (candidate) => requiredBreakMinutes(gross - candidate, limits) <= candidate,
    ) ?? limits.longBreakMinutes;
  return { net: Math.max(0, gross - breakMinutes), breakMinutes };
}

export type CandidateInput = {
  staffMemberId: string;
  displayName: string;
  /** Verantwortlich for this role at this event, or the role is among their preferred roles. */
  usual: boolean;
  /** Budget left this month before the new shift. */
  leftMinutes: number;
  /** undefined = available; null = unavailable without a note. */
  unavailableNote: string | null | undefined;
  /** Shifts of this person on the slot's day (any event). */
  dayShifts: readonly ShiftTimesInput[];
  /** Shifts of the day before, the day and the day after (for the ArbZG check). */
  recentShifts: readonly (ShiftTimesInput & { id?: string })[];
};

export type CandidateFlag =
  | "unavailable"
  | "already_scheduled"
  | "overlap"
  | "over_budget_after"
  | "worktime";

export type ShiftCandidate = {
  staffMemberId: string;
  displayName: string;
  group: "usual" | "other" | "unavailable";
  leftBefore: number;
  leftAfter: number;
  flags: CandidateFlag[];
  unavailableNote: string | null;
  worktime: WorkingTimeWarning[];
};

/** Every warning but a plain "already has a shift that day" needs one confirmation (nothing blocks). */
export function needsConfirmation(flags: readonly CandidateFlag[]): boolean {
  return flags.some((f) => f !== "already_scheduled");
}

/** The picker's order and flags (spec §4.5). */
export function rankCandidates(
  slot: { workDate: string; plannedStart: string; plannedEnd: string },
  people: readonly CandidateInput[],
  limits: WorkingTimeLimits = ARBZG_STATUTORY_LIMITS,
): ShiftCandidate[] {
  const { net, breakMinutes } = slotMinutes(slot, limits);
  const newSpan = {
    workDate: slot.workDate,
    start: slot.plannedStart,
    end: slot.plannedEnd,
    breakMinutes,
  };
  const candidates = people.map((p): ShiftCandidate => {
    const flags: CandidateFlag[] = [];
    const unavailable = p.unavailableNote !== undefined;
    if (unavailable) flags.push("unavailable");
    const active = p.dayShifts.filter((s) => shiftCounts(s.status));
    if (active.length > 0) flags.push("already_scheduled");
    const spans = p.recentShifts
      .filter((s) => shiftCounts(s.status))
      .flatMap((s) => {
        const span = effectiveSpan(s);
        return span ? [s.id === undefined ? span : { ...span, id: s.id }] : [];
      });
    const warnings = checkWorkingTime([...spans, newSpan], limits).filter(
      (w) => w.date === slot.workDate || ("previousDate" in w && w.previousDate === slot.workDate),
    );
    if (warnings.some((w) => w.code === "overlap")) flags.push("overlap");
    const leftAfter = p.leftMinutes - net;
    if (leftAfter < 0) flags.push("over_budget_after");
    const worktime = warnings.filter((w) => w.code !== "overlap");
    if (worktime.length > 0) flags.push("worktime");
    return {
      staffMemberId: p.staffMemberId,
      displayName: p.displayName,
      group: unavailable ? "unavailable" : p.usual ? "usual" : "other",
      leftBefore: p.leftMinutes,
      leftAfter,
      flags,
      unavailableNote: unavailable ? (p.unavailableNote ?? null) : null,
      worktime,
    };
  });
  const groupOrder = { usual: 0, other: 1, unavailable: 2 } as const;
  return candidates.sort(
    (a, b) =>
      groupOrder[a.group] - groupOrder[b.group] ||
      b.leftAfter - a.leftAfter ||
      a.displayName.localeCompare(b.displayName, "de"),
  );
}
