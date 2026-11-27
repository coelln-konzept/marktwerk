// packages/core/src/staff/planning.ts
import { addDays, daysBetween, isoWeek } from "../dates/calendar";
import { contractOn, monthEnd, monthStart } from "./hours";
import { type ShiftTimesInput, shiftWork } from "./worktime";

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
