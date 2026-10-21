import { addDays, daysInMonth, mondayOf } from "../dates/calendar";

/*
 * Workload ("Arbeitslast"): estimated open task hours against a person's capacity, per ISO week, and
 * per month against the whole team for the Übersicht season strip.
 */

/** Weekly capacity for task work when a person has no contract hours on file (decision: 20 h). */
export const DEFAULT_WEEKLY_CAPACITY_HOURS = 20;

/**
 * Assumption for the hiring signal: one additional Minijobber covers 40 h per month (about 9 h a
 * week at the Minijob earnings limit). Used for "≈ x Minijobber/Monat zusätzlich".
 */
export const MINIJOBBER_HOURS_PER_MONTH = 40;

export type ContractTerms = {
  validFrom: string;
  validUntil: string | null;
  contractedHoursPerWeek: number | null;
};

/**
 * Task capacity of a person per week on `onDate`: the contract valid that day (latest `validFrom`
 * wins) says `contractedHoursPerWeek`; without a contract or without hours the default applies.
 */
export function weeklyCapacityHours(
  contracts: readonly ContractTerms[],
  onDate: string,
  fallback: number = DEFAULT_WEEKLY_CAPACITY_HOURS,
): number {
  const valid = contracts
    .filter((c) => c.validFrom <= onDate && (c.validUntil === null || c.validUntil >= onDate))
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
  return valid?.contractedHoursPerWeek ?? fallback;
}

export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

export type LoadLevel = "ok" | "warn" | "critical";

/** Under 80 % of capacity is fine, up to 100 % is near the limit, above is overloaded. */
export function loadLevel(hours: number, capacityHours: number): LoadLevel {
  if (capacityHours <= 0) return hours > 0 ? "critical" : "ok";
  const ratio = hours / capacityHours;
  if (ratio > 1) return "critical";
  return ratio >= 0.8 ? "warn" : "ok";
}

/** Monday of the week a task's hours count in: overdue tasks count in the current week; undated ones nowhere. */
export function loadWeekStart(dueOn: string | null, today: string): string | null {
  if (dueOn === null) return null;
  const monday = mondayOf(dueOn);
  const current = mondayOf(today);
  return monday < current ? current : monday;
}

/** Mondays of `count` consecutive ISO weeks starting with the week of `today`. */
export function weekStarts(today: string, count: number): string[] {
  const first = mondayOf(today);
  return Array.from({ length: count }, (_, i) => addDays(first, i * 7));
}

/** Capacity of one month from weekly hours (days in month ÷ 7 weeks). */
export function monthlyCapacityHours(weeklyHours: number, year: number, month: number): number {
  return (weeklyHours * daysInMonth(year, month)) / 7;
}

export type MonthDemand = {
  /** `YYYY-MM` */
  month: string;
  demandHours: number;
  capacityHours: number;
};

export type MonthSignal = MonthDemand & {
  /** Hours the team cannot cover that month (never negative). */
  gapHours: number;
  /** Additional Minijobbers that would close the gap. */
  minijobbers: number;
};

export type HiringSignal = {
  months: MonthSignal[];
  demandHours: number;
  capacityHours: number;
  /** Mean of the monthly figures over the months that have demand ("≈ 3,1 Minijobber/Monat"). */
  averageMinijobbers: number;
  peakMinijobbers: number;
};

/** Hiring signal for the season strip: gap per month ÷ 40 h per Minijobber. */
export function hiringSignal(months: MonthDemand[]): HiringSignal {
  const rows = months.map((m) => {
    const gapHours = Math.max(0, m.demandHours - m.capacityHours);
    return { ...m, gapHours, minijobbers: gapHours / MINIJOBBER_HOURS_PER_MONTH };
  });
  const active = rows.filter((r) => r.demandHours > 0);
  const sum = active.reduce((total, r) => total + r.minijobbers, 0);
  return {
    months: rows,
    demandHours: rows.reduce((total, r) => total + r.demandHours, 0),
    capacityHours: rows.reduce((total, r) => total + r.capacityHours, 0),
    averageMinijobbers: active.length ? sum / active.length : 0,
    peakMinijobbers: rows.reduce((peak, r) => Math.max(peak, r.minijobbers), 0),
  };
}
