/**
 * Contracts, monthly hours and pay, Minijob history and the payroll month (M4). Pure functions:
 * rates and limits come from the contract rows and `legal_parameter` values passed in.
 */
import { addDays, daysInMonth, isIsoDate, isoDate } from "../dates/calendar";
import { type MinijobMonthStatus, type MinijobParameters, minijobEarningsStatus } from "./minijob";
import { type ShiftTimesInput, shiftWork } from "./worktime";

// ---------------------------------------------------------------------------------------------
// Months

/** "2026-05-17" or "2026-05" → "2026-05-01". */
export function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

/** Last day of the month containing `value`. */
export function monthEnd(value: string): string {
  const [y = 0, m = 1] = value.split("-").map(Number);
  return isoDate(y, m, daysInMonth(y, m));
}

/** First day of the month `n` months after the one containing `value` (n may be negative). */
export function addMonths(value: string, n: number): string {
  const [y = 0, m = 1] = value.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  return isoDate(Math.floor(index / 12), (index % 12) + 1, 1);
}

export function isMonthStart(value: unknown): value is string {
  return typeof value === "string" && isIsoDate(value) && value.endsWith("-01");
}

// ---------------------------------------------------------------------------------------------
// Contracts

export const EMPLOYMENT_TYPES = [
  "minijob",
  "midijob",
  "student",
  "part_time",
  "full_time",
  "freelance",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** German names as they appear in the payroll export. */
export const EMPLOYMENT_TYPE_NAMES_DE: Record<EmploymentType, string> = {
  minijob: "Minijob",
  midijob: "Midijob",
  student: "Werkstudent",
  part_time: "Teilzeit",
  full_time: "Vollzeit",
  freelance: "Freiberuflich",
};

export type ContractTerms = {
  id?: string;
  type: EmploymentType;
  hourlyRateCents: number | null;
  contractedHoursPerWeek: number | null;
  fixedMonthlyPayCents: number | null;
  workingTimeAccount: boolean;
  otherMinijobDeclared: boolean;
  validFrom: string;
  validUntil: string | null;
};

export type ContractError =
  | "invalid_dates"
  | "invalid_type"
  | "invalid_amount"
  | "rate_required"
  | "hours_required"
  | "fixed_pay_required";

/**
 * Rules a contract must satisfy on its own. A Minijob needs an hourly rate (the allowance is counted
 * in hours) and contracted weekly hours, otherwise §12 TzBfG assumes 20 hours a week.
 */
export function checkContractTerms(terms: ContractTerms): ContractError | null {
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(terms.type)) return "invalid_type";
  if (!isIsoDate(terms.validFrom)) return "invalid_dates";
  if (
    terms.validUntil !== null &&
    (!isIsoDate(terms.validUntil) || terms.validUntil < terms.validFrom)
  )
    return "invalid_dates";
  const amountOk = (value: number | null) =>
    value === null || (Number.isSafeInteger(value) && value >= 0);
  if (
    !amountOk(terms.hourlyRateCents) ||
    terms.hourlyRateCents === 0 ||
    !amountOk(terms.fixedMonthlyPayCents) ||
    (terms.contractedHoursPerWeek !== null &&
      !(terms.contractedHoursPerWeek >= 0 && terms.contractedHoursPerWeek <= 168))
  )
    return "invalid_amount";
  if (terms.hourlyRateCents === null && terms.fixedMonthlyPayCents === null) return "rate_required";
  if (terms.type === "minijob" && terms.hourlyRateCents === null) return "rate_required";
  if (terms.workingTimeAccount && terms.fixedMonthlyPayCents === null) return "fixed_pay_required";
  if (terms.type !== "freelance" && terms.contractedHoursPerWeek === null) return "hours_required";
  return null;
}

type Validity = { validFrom: string; validUntil: string | null };

/** Whether two validity periods share a day (open end = unlimited). */
export function validitiesOverlap(a: Validity, b: Validity): boolean {
  return (
    a.validFrom <= (b.validUntil ?? "9999-12-31") && b.validFrom <= (a.validUntil ?? "9999-12-31")
  );
}

/** The first of `others` (sorted by start) that overlaps `candidate`, ignoring the same id. */
export function findOverlappingContract<T extends Validity & { id?: string }>(
  candidate: Validity & { id?: string },
  others: readonly T[],
): T | null {
  const sorted = [...others].sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
  return (
    sorted.find(
      (other) =>
        !(candidate.id !== undefined && other.id === candidate.id) &&
        validitiesOverlap(candidate, other),
    ) ?? null
  );
}

/** The contract valid on a day. Contracts must not overlap; if they do the latest start wins. */
export function contractOn<T extends Validity>(contracts: readonly T[], date: string): T | null {
  let found: T | null = null;
  for (const c of contracts) {
    if (c.validFrom <= date && (c.validUntil === null || c.validUntil >= date)) {
      if (!found || c.validFrom > found.validFrom) found = c;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Monthly hours and pay

export type PersonMonth = {
  workedMinutes: number;
  plannedMinutes: number;
  /** worked + planned */
  totalMinutes: number;
  /** Minutes per work day (worked + planned), keyed by "YYYY-MM-DD". */
  dayMinutes: Record<string, number>;
  /** Hourly pay (dated rates) plus fixed monthly pay. */
  grossCents: number;
  hourlyPayCents: number;
  fixedPayCents: number;
  /** Minutes per hourly rate, in the order the rates occur. */
  rates: { rateCents: number; minutes: number }[];
  /** The hourly rate valid last in the month (turns the allowance into hours). */
  lastRateCents: number | null;
  /** Type of the contract valid at the end of the month, else the latest one in it. */
  contractType: EmploymentType | null;
  /** The person has a contract with an hourly rate or fixed pay in this month. */
  hasContract: boolean;
  /** Work minutes on days without a contract or without a rate (not paid by the numbers above). */
  uncoveredMinutes: number;
  otherMinijobDeclared: boolean;
};

/**
 * Hours and pay of one person in one month. Hourly pay is rounded once per rate, not per shift, so
 * rounding errors do not add up. A contract with a fixed monthly pay (salary or working-time account)
 * pays that amount once for the month, whatever the hours.
 */
export function personMonth(input: {
  month: string;
  shifts: readonly ShiftTimesInput[];
  contracts: readonly (ContractTerms & Validity)[];
}): PersonMonth {
  const from = monthStart(input.month);
  const to = monthEnd(input.month);
  const inMonth = input.contracts.filter((c) =>
    validitiesOverlap(c, { validFrom: from, validUntil: to }),
  );

  let workedMinutes = 0;
  let plannedMinutes = 0;
  let uncoveredMinutes = 0;
  const dayMinutes: Record<string, number> = {};
  const rateMinutes = new Map<number, number>();

  for (const shift of input.shifts) {
    if (shift.workDate < from || shift.workDate > to) continue;
    const work = shiftWork(shift);
    const minutes = work.workedMinutes + work.plannedMinutes;
    if (minutes === 0) continue;
    workedMinutes += work.workedMinutes;
    plannedMinutes += work.plannedMinutes;
    dayMinutes[shift.workDate] = (dayMinutes[shift.workDate] ?? 0) + minutes;
    const contract = contractOn(inMonth, shift.workDate);
    if (!contract) uncoveredMinutes += minutes;
    else if (contract.fixedMonthlyPayCents !== null) {
      // paid by the fixed amount below
    } else if (contract.hourlyRateCents === null) uncoveredMinutes += minutes;
    else
      rateMinutes.set(
        contract.hourlyRateCents,
        (rateMinutes.get(contract.hourlyRateCents) ?? 0) + minutes,
      );
  }

  const rates = [...rateMinutes].map(([rateCents, minutes]) => ({ rateCents, minutes }));
  const hourlyPayCents = rates.reduce(
    (sum, r) => sum + Math.round((r.minutes * r.rateCents) / 60),
    0,
  );
  const fixedPayCents = inMonth.reduce((sum, c) => sum + (c.fixedMonthlyPayCents ?? 0), 0);

  const atEnd = contractOn(inMonth, to) ?? contractOn(inMonth, from);
  const latest = [...inMonth].sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0] ?? null;
  const representative = atEnd ?? latest;
  const lastRateCents =
    rates.at(-1)?.rateCents ?? representative?.hourlyRateCents ?? latest?.hourlyRateCents ?? null;

  return {
    workedMinutes,
    plannedMinutes,
    totalMinutes: workedMinutes + plannedMinutes,
    dayMinutes,
    grossCents: hourlyPayCents + fixedPayCents,
    hourlyPayCents,
    fixedPayCents,
    rates,
    lastRateCents,
    contractType: representative?.type ?? null,
    hasContract: inMonth.length > 0,
    uncoveredMinutes,
    otherMinijobDeclared: inMonth.some((c) => c.otherMinijobDeclared),
  };
}

// ---------------------------------------------------------------------------------------------
// Minijob over twelve months

export type MinijobHistory = { previousOverrunMonths: number; previousElevenMonthsCents: number };

/**
 * What the 11 months before `month` contribute to the Minijob rules: how many of them were over their
 * own month's limit and what was earned in them. `earnedByMonth` is keyed "YYYY-MM"; months without an
 * entry count as 0. `limitCentsFor` returns the limit valid in a month (first day passed in).
 */
export function minijobHistory(
  month: string,
  earnedByMonth: ReadonlyMap<string, number>,
  limitCentsFor: (monthFirstDay: string) => number,
): MinijobHistory {
  let overrunMonths = 0;
  let earned = 0;
  for (let back = 1; back <= 11; back += 1) {
    const m = addMonths(month, -back);
    const cents = earnedByMonth.get(m.slice(0, 7)) ?? 0;
    earned += cents;
    if (cents > limitCentsFor(m)) overrunMonths += 1;
  }
  return { previousOverrunMonths: overrunMonths, previousElevenMonthsCents: earned };
}

/** Earnings from January up to and including `month`. */
export function yearToDateCents(month: string, earnedByMonth: ReadonlyMap<string, number>): number {
  const year = month.slice(0, 4);
  let sum = 0;
  for (const [key, cents] of earnedByMonth) {
    if (key.startsWith(year) && key <= month.slice(0, 7)) sum += cents;
  }
  return sum;
}

/** Minijob status of a month given the person's month figures and history. */
export function minijobStatusOf(
  month: PersonMonth,
  history: MinijobHistory,
  params: MinijobParameters,
): MinijobMonthStatus {
  return minijobEarningsStatus(
    {
      earnedCents: month.grossCents,
      hourlyRateCents: month.lastRateCents,
      previousOverrunMonths: history.previousOverrunMonths,
      previousElevenMonthsCents: history.previousElevenMonthsCents,
    },
    params,
  );
}

// ---------------------------------------------------------------------------------------------
// Month close

export const PAYROLL_REMIND_DAY = 12;
export const PAYROLL_DEADLINE_DAY = 15;

/** The month to close on `today`: the one before the current month. */
export function payrollMonthToClose(today: string): string {
  return addMonths(today, -1);
}

/** The 15th of the month after `month`: when the books of `month` must be closed. */
export function payrollDeadline(month: string): string {
  return `${addMonths(month, 1).slice(0, 8)}${String(PAYROLL_DEADLINE_DAY).padStart(2, "0")}`;
}

export type PayrollReminderStage = "none" | "remind" | "due" | "overdue";

/** 12th–14th: remind; 15th: due; later: overdue. Before the 12th nothing is sent. */
export function payrollReminderStage(today: string): PayrollReminderStage {
  const day = Number(today.slice(8, 10));
  if (day < PAYROLL_REMIND_DAY) return "none";
  if (day < PAYROLL_DEADLINE_DAY) return "remind";
  return day === PAYROLL_DEADLINE_DAY ? "due" : "overdue";
}

/** First day on which a reminder for `month` goes out (the 12th of the following month). */
export function payrollRemindFrom(month: string): string {
  return addDays(payrollDeadline(month), PAYROLL_REMIND_DAY - PAYROLL_DEADLINE_DAY);
}

// ---------------------------------------------------------------------------------------------
// CSV export

export type PayrollCsvRow = {
  name: string;
  contractType: EmploymentType | null;
  workedMinutes: number;
  /** Rate to show; null for fixed pay. */
  hourlyRateCents: number | null;
  grossCents: number;
  justification: string | null;
};

const decimalComma = (value: number, digits: number) => value.toFixed(digits).replace(".", ",");

/** Text cells: quoted when needed, and never read as a formula by a spreadsheet. */
function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Byte order mark so Excel opens the file as UTF-8. */
export const UTF8_BOM = String.fromCharCode(0xfeff);

export const PAYROLL_CSV_HEADER = "Name;Vertrag;Stunden;Stundenlohn;Brutto;Begruendung";

/**
 * The monthly payroll file for the payroll office: German Excel CSV (`;` separator, decimal comma,
 * CRLF, UTF-8 with BOM), one row per person. DATEV LODAS comes later once agreed with the advisor.
 */
export function payrollCsv(rows: readonly PayrollCsvRow[]): string {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const lines = sorted.map((row) =>
    [
      csvText(row.name),
      row.contractType ? EMPLOYMENT_TYPE_NAMES_DE[row.contractType] : "",
      decimalComma(row.workedMinutes / 60, 2),
      row.hourlyRateCents === null ? "" : decimalComma(row.hourlyRateCents / 100, 2),
      decimalComma(row.grossCents / 100, 2),
      row.justification ? csvText(row.justification) : "",
    ].join(";"),
  );
  return `${UTF8_BOM}${[PAYROLL_CSV_HEADER, ...lines].join("\r\n")}\r\n`;
}
