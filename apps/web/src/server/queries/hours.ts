import "server-only";
import {
  ARBZG_STATUTORY_LIMITS,
  addDays,
  addMonthsToMonth,
  type ContractTerms,
  can,
  checkWorkingTime,
  type EmploymentType,
  effectiveSpan,
  holidaysBetween,
  type MinijobHistory,
  type MinijobMonthStatus,
  type MinijobParameters,
  minijobHistory,
  minijobStatusOf,
  monthEnd,
  monthStart,
  type PayrollCsvRow,
  type PersonMonth,
  payrollDeadline,
  payrollMonthToClose,
  personMonth,
  type RecordingState,
  recordingDeadline,
  recordingState,
  type ShiftStatus,
  type ShiftTimesInput,
  shiftCounts,
  shiftLength,
  type WorkingTimeLimits,
  type WorkingTimeWarning,
  yearToDateCents,
} from "@marktwerk/core";
import {
  dutyRole,
  employmentContract,
  event,
  overrunJustification,
  payrollPeriod,
  shift,
  staffMember,
} from "@marktwerk/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import {
  type LegalRow,
  loadLegalRows,
  minijobParamsAt,
  minimumWageAt,
  type Reader,
  workingTimeLimitsAt,
} from "../legal-params";

/** Same shapes as every module's `dueItems` / `calendarItems` (the orchestrator unifies them). */
export type DueItem = {
  kind: "task" | "permit" | "installment" | "hours" | "obligation";
  id: string;
  title: string;
  dueOn: string;
  urgency: "overdue" | "today" | "soon";
  href: string;
  meta?: string;
  eventId?: string | null;
  assigneeName?: string | null;
};

export type CalendarItem = {
  layer: "tasks" | "permits" | "shifts" | "installments" | "obligations";
  id: string;
  date: string;
  title: string;
  href: string;
  tone?: "ok" | "warn" | "critical" | "neutral";
};

const hhmm = (value: string | null): string | null => (value ? value.slice(0, 5) : null);

// ---------------------------------------------------------------------------------------------
// Contracts

export type ContractRow = ContractTerms & {
  id: string;
  staffMemberId: string;
  notes: string | null;
};

const contractColumns = {
  id: employmentContract.id,
  staffMemberId: employmentContract.staffMemberId,
  type: employmentContract.type,
  hourlyRateCents: employmentContract.hourlyRateCents,
  contractedHoursPerWeek: employmentContract.contractedHoursPerWeek,
  fixedMonthlyPayCents: employmentContract.fixedMonthlyPayCents,
  workingTimeAccount: employmentContract.workingTimeAccount,
  otherMinijobDeclared: employmentContract.otherMinijobDeclared,
  validFrom: employmentContract.validFrom,
  validUntil: employmentContract.validUntil,
  notes: employmentContract.notes,
};

/** Contract history of one person, newest first. */
export async function listContracts(
  staffMemberId: string,
  reader: Reader = db,
): Promise<ContractRow[]> {
  return reader
    .select(contractColumns)
    .from(employmentContract)
    .where(eq(employmentContract.staffMemberId, staffMemberId))
    .orderBy(desc(employmentContract.validFrom));
}

/** Statutory minimum wage (cents per hour) valid on a day, from `legal_parameter`. */
export async function minimumWageOn(date: string, reader: Reader = db): Promise<number | null> {
  return minimumWageAt(await loadLegalRows(reader), date);
}

// ---------------------------------------------------------------------------------------------
// Payroll periods

export type PeriodStatus = "open" | "locked" | "approved" | "exported";

export type PeriodRow = {
  id: string;
  month: string;
  status: PeriodStatus;
  lockedAt: Date | null;
  lockedByName: string | null;
  approvedAt: Date | null;
  approvedByName: string | null;
  exportedAt: Date | null;
};

/** The payroll period of a month; null until someone locks (or edits) it, which means "open". */
export async function getPeriod(month: string, reader: Reader = db): Promise<PeriodRow | null> {
  const [row] = await reader
    .select({
      id: payrollPeriod.id,
      month: payrollPeriod.month,
      status: payrollPeriod.status,
      lockedAt: payrollPeriod.lockedAt,
      lockedById: payrollPeriod.lockedByStaffMemberId,
      approvedAt: payrollPeriod.approvedAt,
      approvedById: payrollPeriod.approvedByStaffMemberId,
      exportedAt: payrollPeriod.exportedAt,
    })
    .from(payrollPeriod)
    .where(eq(payrollPeriod.month, monthStart(month)));
  if (!row) return null;
  const ids = [row.lockedById, row.approvedById].filter((v): v is string => v !== null);
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const people = await reader
      .select({ id: staffMember.id, name: staffMember.displayName })
      .from(staffMember)
      .where(inArray(staffMember.id, ids));
    for (const p of people) names.set(p.id, p.name);
  }
  return {
    id: row.id,
    month: row.month,
    status: row.status,
    lockedAt: row.lockedAt,
    lockedByName: row.lockedById ? (names.get(row.lockedById) ?? null) : null,
    approvedAt: row.approvedAt,
    approvedByName: row.approvedById ? (names.get(row.approvedById) ?? null) : null,
    exportedAt: row.exportedAt,
  };
}

/** Status of each month that has a period row (for the month picker). */
export async function listPeriodStatuses(reader: Reader = db): Promise<Map<string, PeriodStatus>> {
  const rows = await reader
    .select({ month: payrollPeriod.month, status: payrollPeriod.status })
    .from(payrollPeriod);
  return new Map(rows.map((r) => [r.month.slice(0, 7), r.status]));
}

// ---------------------------------------------------------------------------------------------
// Month figures

export type MinijobSummary = {
  status: MinijobMonthStatus;
  params: MinijobParameters;
  history: { previousOverrunMonths: number; previousElevenMonthsCents: number };
  /** Calendar year to date, including this month. */
  ytdCents: number;
  /** Overrun months in the 12 months up to and including this one. */
  overrunMonths: number;
};

export type Justification = { reason: string; recordedByName: string | null; at: Date };

export type PersonMonthRow = {
  staffMemberId: string;
  displayName: string;
  active: boolean;
  month: PersonMonth;
  contractType: EmploymentType | null;
  minijob: MinijobSummary | null;
  justification: Justification | null;
  arbzg: WorkingTimeWarning[];
  /** Past shifts of this month without recorded times. */
  missingTimes: number;
  /** Earliest §17 MiLoG deadline among those. */
  missingDeadline: string | null;
};

export type MonthFigures = {
  month: string;
  period: PeriodRow | null;
  /** Minijob rules of the month; null when the legal values are missing. */
  params: MinijobParameters | null;
  limits: WorkingTimeLimits;
  /** Statutory minimum wage of the month in cents per hour, null when not in legal_parameter. */
  minimumWageCents: number | null;
  rows: PersonMonthRow[];
};

type ShiftFacts = ShiftTimesInput & {
  id: string;
  staffMemberId: string;
  eventId: string | null;
};

const shiftFactColumns = {
  id: shift.id,
  staffMemberId: shift.staffMemberId,
  eventId: shift.eventId,
  workDate: shift.workDate,
  status: shift.status,
  plannedStart: shift.plannedStart,
  plannedEnd: shift.plannedEnd,
  actualStart: shift.actualStart,
  actualEnd: shift.actualEnd,
  breakMinutes: shift.breakMinutes,
};

function toFacts(row: {
  id: string;
  staffMemberId: string;
  eventId: string | null;
  workDate: string;
  status: ShiftStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  breakMinutes: number;
}): ShiftFacts {
  return {
    ...row,
    plannedStart: hhmm(row.plannedStart),
    plannedEnd: hhmm(row.plannedEnd),
    actualStart: hhmm(row.actualStart),
    actualEnd: hhmm(row.actualEnd),
  };
}

/** A shift whose times still have to be entered. */
function needsTimes(s: ShiftTimesInput, today: string): boolean {
  return (
    s.workDate < today &&
    (s.status === "requested" || s.status === "confirmed" || s.status === "worked") &&
    !(s.actualStart && s.actualEnd)
  );
}

/**
 * Hours, pay and Minijob figures of every person for one month: the data of the Team grid, the month
 * close and the CSV. Looks 11 months back for the Minijob history and one day around the month for
 * the rest periods.
 */
export async function loadMonthFigures(
  reader: Reader,
  monthInput: string,
  today: string,
  legalRows?: LegalRow[],
): Promise<MonthFigures> {
  const month = monthStart(monthInput);
  const to = monthEnd(month);
  const from12 = addMonthsToMonth(month, -11);
  const legal = legalRows ?? (await loadLegalRows(reader));
  const params = minijobParamsAt(legal, month);
  const limits = workingTimeLimitsAt(legal, month);

  // One after the other: the reader may be a transaction, which has a single connection.
  const shiftRows = await reader
    .select(shiftFactColumns)
    .from(shift)
    .where(and(gte(shift.workDate, from12), lte(shift.workDate, addDays(to, 1))));
  const contractRows = await reader
    .select(contractColumns)
    .from(employmentContract)
    .where(
      and(
        lte(employmentContract.validFrom, to),
        or(isNull(employmentContract.validUntil), gte(employmentContract.validUntil, from12)),
      ),
    );
  const people = await reader
    .select({
      id: staffMember.id,
      displayName: staffMember.displayName,
      active: staffMember.active,
    })
    .from(staffMember)
    .orderBy(asc(staffMember.displayName));
  const justifications = await reader
    .select({
      staffMemberId: overrunJustification.staffMemberId,
      reason: overrunJustification.reason,
      recordedById: overrunJustification.recordedById,
      at: overrunJustification.updatedAt,
    })
    .from(overrunJustification)
    .where(eq(overrunJustification.month, month));
  const period = await getPeriod(month, reader);

  const shiftsByPerson = new Map<string, ShiftFacts[]>();
  for (const row of shiftRows) {
    const list = shiftsByPerson.get(row.staffMemberId) ?? [];
    list.push(toFacts(row));
    shiftsByPerson.set(row.staffMemberId, list);
  }
  const contractsByPerson = new Map<string, ContractRow[]>();
  for (const row of contractRows) {
    const list = contractsByPerson.get(row.staffMemberId) ?? [];
    list.push(row);
    contractsByPerson.set(row.staffMemberId, list);
  }
  const nameOf = new Map(people.map((p) => [p.id, p.displayName]));
  const justificationOf = new Map(
    justifications.map((j) => [
      j.staffMemberId,
      {
        reason: j.reason,
        recordedByName: j.recordedById ? (nameOf.get(j.recordedById) ?? null) : null,
        at: j.at,
      } satisfies Justification,
    ]),
  );
  const limitAt = (date: string) =>
    params
      ? (minijobParamsAt(legal, date)?.limitCents ?? params.limitCents)
      : Number.POSITIVE_INFINITY;

  const rows: PersonMonthRow[] = [];
  for (const person of people) {
    const shifts = shiftsByPerson.get(person.id) ?? [];
    const contracts = contractsByPerson.get(person.id) ?? [];
    const current = personMonth({ month, shifts, contracts });
    const inMonth = shifts.filter((s) => s.workDate >= month && s.workDate <= to);
    const hasWork = inMonth.some((s) => shiftCounts(s.status));
    const hasPay = current.hasContract && person.active;
    if (!hasWork && !hasPay) continue;

    let minijob: MinijobSummary | null = null;
    if (current.contractType === "minijob" && params) {
      const earned = new Map<string, number>();
      for (let back = 1; back <= 11; back += 1) {
        const m = addMonthsToMonth(month, -back);
        earned.set(m.slice(0, 7), personMonth({ month: m, shifts, contracts }).grossCents);
      }
      earned.set(month.slice(0, 7), current.grossCents);
      const history = minijobHistory(month, earned, limitAt);
      let overrunMonths = history.previousOverrunMonths;
      if (current.grossCents > params.limitCents) overrunMonths += 1;
      minijob = {
        status: minijobStatusOf(current, history, params),
        params,
        history,
        ytdCents: yearToDateCents(month, earned),
        overrunMonths,
      };
    }

    const spans = shifts
      .filter((s) => shiftCounts(s.status))
      .flatMap((s) => {
        const span = effectiveSpan(s);
        return span ? [{ ...span, id: s.id }] : [];
      });
    const arbzg = checkWorkingTime(spans, limits).filter((w) => w.date >= month && w.date <= to);

    const missing = inMonth.filter((s) => needsTimes(s, today));
    const deadlines = missing.map((s) => recordingDeadline(s.workDate)).sort();

    rows.push({
      staffMemberId: person.id,
      displayName: person.displayName,
      active: person.active,
      month: current,
      contractType: current.contractType,
      minijob,
      justification: justificationOf.get(person.id) ?? null,
      arbzg,
      missingTimes: missing.length,
      missingDeadline: deadlines[0] ?? null,
    });
  }
  return { month, period, params, limits, minimumWageCents: minimumWageAt(legal, month), rows };
}

/** Month figures for the pages (the services call `loadMonthFigures` with their transaction). */
export function getMonthFigures(month: string, today: string): Promise<MonthFigures> {
  return loadMonthFigures(db, month, today);
}

// ---------------------------------------------------------------------------------------------
// Month close checks

export type CloseCheckCode =
  | "month_open"
  | "missing_times"
  | "no_contract"
  | "overrun_unjustified"
  | "minijob_red"
  | "arbzg"
  | "legal_missing"
  | "other_minijob";

export type CloseCheck = {
  code: CloseCheckCode;
  /** Blockers stop the lock; warnings are shown but do not. */
  level: "blocker" | "warning";
  count: number;
  /** People concerned, as names. */
  people: string[];
};

/** What the "Prüfen" step shows, and what locking the month insists on. */
export function closeChecksOf(figures: MonthFigures, today: string): CloseCheck[] {
  const checks: CloseCheck[] = [];
  const { rows } = figures;
  const names = (list: PersonMonthRow[]) => list.map((r) => r.displayName);
  const add = (
    code: CloseCheckCode,
    level: CloseCheck["level"],
    list: PersonMonthRow[],
    n?: number,
  ) => {
    if (list.length > 0 || (n ?? 0) > 0)
      checks.push({ code, level, count: n ?? list.length, people: names(list) });
  };

  if (today <= monthEnd(figures.month))
    checks.push({ code: "month_open", level: "blocker", count: 1, people: [] });
  const missing = rows.filter((r) => r.missingTimes > 0);
  add(
    "missing_times",
    "blocker",
    missing,
    missing.reduce((sum, r) => sum + r.missingTimes, 0),
  );
  add(
    "no_contract",
    "blocker",
    rows.filter((r) => r.month.uncoveredMinutes > 0),
  );
  if (!figures.params && rows.some((r) => r.contractType === "minijob"))
    checks.push({ code: "legal_missing", level: "blocker", count: 1, people: [] });
  const over = rows.filter(
    (r) => r.minijob && r.minijob.status.earnedCents > r.minijob.params.limitCents,
  );
  add(
    "overrun_unjustified",
    "blocker",
    over.filter((r) => !r.justification),
  );
  add(
    "minijob_red",
    "warning",
    over.filter((r) => r.minijob?.status.level === "red"),
  );
  add(
    "arbzg",
    "warning",
    rows.filter((r) => r.arbzg.length > 0),
  );
  add(
    "other_minijob",
    "warning",
    rows.filter((r) => r.contractType === "minijob" && r.month.otherMinijobDeclared),
  );
  return checks;
}

// ---------------------------------------------------------------------------------------------
// Shift lists

export type ShiftWarning =
  | { kind: "arbzg"; warning: WorkingTimeWarning }
  | { kind: "minijob"; level: "amber" | "red" };

export type ShiftRow = {
  id: string;
  version: number;
  eventId: string | null;
  eventName: string | null;
  staffMemberId: string;
  staffName: string;
  dutyRoleId: string | null;
  dutyRoleNameDe: string | null;
  dutyRoleNameEn: string | null;
  workDate: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  breakMinutes: number;
  status: ShiftStatus;
  notes: string | null;
  recordedAt: Date | null;
  /** Minutes the shift counts (actual if recorded, else planned). */
  minutes: number;
  source: "actual" | "planned" | null;
  recording: RecordingState;
  recordingDeadline: string;
  /** The payroll month of this day is locked or later. */
  locked: boolean;
  warnings: ShiftWarning[];
};

export type ShiftFilter = {
  from?: string;
  to?: string;
  eventId?: string;
  /** Only shifts without an event (office hours). */
  officeOnly?: boolean;
  staffMemberId?: string;
};

export type LiveSpan = {
  id: string;
  workDate: string;
  start: string;
  end: string;
  breakMinutes: number;
};

export type LiveMinijobMonth = {
  rateCents: number | null;
  /** Everything the person earns in that month so far (worked + planned). */
  grossCents: number;
  /** Paid by the hour; with a fixed monthly pay more hours do not change the earnings. */
  hourly: boolean;
  history: MinijobHistory;
};

/**
 * What the shift forms need to warn while typing: the person's other shifts around the listed days
 * (rest periods), the ArbZG limits and the Minijob figures per person and month. Plain data, so it can
 * be passed to client components.
 */
export type LiveContext = {
  today: string;
  limits: WorkingTimeLimits;
  params: MinijobParameters | null;
  people: Record<string, { spans: LiveSpan[]; minijob: Record<string, LiveMinijobMonth> }>;
};

export type ShiftList = { rows: ShiftRow[]; live: LiveContext };

/**
 * Shifts with their length, §17 MiLoG state and warnings, plus the context for live warnings. Field
 * users only see their own shifts; everyone else needs `team:read` (callers check that).
 * `opts.people` / `opts.months` widen the live context beyond the listed shifts (so a form can warn
 * about people and months that have no shift in the list yet).
 */
export async function loadShiftList(
  actor: Actor,
  filter: ShiftFilter,
  today: string,
  opts: { people?: string[]; months?: string[] } = {},
): Promise<ShiftList> {
  const conditions: (SQL | undefined)[] = [];
  if (filter.from) conditions.push(gte(shift.workDate, filter.from));
  if (filter.to) conditions.push(lte(shift.workDate, filter.to));
  if (filter.eventId) conditions.push(eq(shift.eventId, filter.eventId));
  if (filter.officeOnly) conditions.push(isNull(shift.eventId));
  if (filter.staffMemberId) conditions.push(eq(shift.staffMemberId, filter.staffMemberId));
  const readsAll = can(actor.role, "team", "read");
  if (!readsAll) {
    if (!actor.staffMemberId) {
      return {
        rows: [],
        live: { today, limits: ARBZG_STATUTORY_LIMITS, params: null, people: {} },
      };
    }
    conditions.push(eq(shift.staffMemberId, actor.staffMemberId));
  }

  const rows = await db
    .select({
      id: shift.id,
      version: shift.version,
      eventId: shift.eventId,
      eventName: event.name,
      staffMemberId: shift.staffMemberId,
      staffName: staffMember.displayName,
      dutyRoleId: shift.dutyRoleId,
      dutyRoleNameDe: dutyRole.nameDe,
      dutyRoleNameEn: dutyRole.nameEn,
      workDate: shift.workDate,
      plannedStart: shift.plannedStart,
      plannedEnd: shift.plannedEnd,
      actualStart: shift.actualStart,
      actualEnd: shift.actualEnd,
      breakMinutes: shift.breakMinutes,
      status: shift.status,
      notes: shift.notes,
      recordedAt: shift.recordedAt,
    })
    .from(shift)
    .innerJoin(staffMember, eq(staffMember.id, shift.staffMemberId))
    .leftJoin(event, eq(event.id, shift.eventId))
    .leftJoin(dutyRole, eq(dutyRole.id, shift.dutyRoleId))
    .where(and(...conditions))
    .orderBy(asc(shift.workDate), asc(staffMember.displayName), asc(shift.plannedStart));

  const months = [
    ...new Set([
      ...rows.map((r) => monthStart(r.workDate)),
      ...(opts.months ?? []).map(monthStart),
      ...(filter.from ? [monthStart(filter.from)] : []),
    ]),
  ].sort();
  const people = [...new Set([...rows.map((r) => r.staffMemberId), ...(opts.people ?? [])])];
  const legal = await loadLegalRows(db);
  const figures = new Map<string, MonthFigures>();
  for (const m of months) figures.set(m, await loadMonthFigures(db, m, today, legal));
  const periodOf = new Map([...figures].map(([m, f]) => [m, f.period?.status ?? "open"] as const));

  // ArbZG: neighbouring days of the same people are needed to see rest periods.
  const dates = [...rows.map((r) => r.workDate), ...months, ...months.map(monthEnd)].sort();
  const first = dates[0] ?? today;
  const last = dates.at(-1) ?? today;
  const around =
    people.length === 0
      ? []
      : await db
          .select(shiftFactColumns)
          .from(shift)
          .where(
            and(
              inArray(shift.staffMemberId, people),
              gte(shift.workDate, addDays(first, -1)),
              lte(shift.workDate, addDays(last, 1)),
            ),
          );
  const spansByPerson = new Map<string, LiveSpan[]>();
  for (const s of around) {
    const facts = toFacts(s);
    if (!shiftCounts(facts.status)) continue;
    const span = effectiveSpan(facts);
    if (!span) continue;
    const list = spansByPerson.get(s.staffMemberId) ?? [];
    list.push({
      id: s.id,
      workDate: span.workDate,
      start: span.start,
      end: span.end,
      breakMinutes: span.breakMinutes,
    });
    spansByPerson.set(s.staffMemberId, list);
  }
  const limits = workingTimeLimitsAt(legal, last);
  const arbzgByPerson = new Map<string, WorkingTimeWarning[]>();
  for (const person of people) {
    arbzgByPerson.set(person, checkWorkingTime(spansByPerson.get(person) ?? [], limits));
  }

  const live: LiveContext = {
    today,
    limits,
    params: minijobParamsAt(legal, last),
    people: {},
  };
  for (const person of people) {
    const minijob: Record<string, LiveMinijobMonth> = {};
    for (const [m, f] of figures) {
      const row = f.rows.find((p) => p.staffMemberId === person);
      if (row?.minijob) {
        minijob[m] = {
          rateCents: row.month.lastRateCents,
          grossCents: row.month.grossCents,
          hourly: row.month.fixedPayCents === 0,
          history: row.minijob.history,
        };
      }
    }
    live.people[person] = { spans: spansByPerson.get(person) ?? [], minijob };
  }

  const shiftRows = rows.map((r) => {
    const facts: ShiftTimesInput = {
      workDate: r.workDate,
      status: r.status,
      plannedStart: hhmm(r.plannedStart),
      plannedEnd: hhmm(r.plannedEnd),
      actualStart: hhmm(r.actualStart),
      actualEnd: hhmm(r.actualEnd),
      breakMinutes: r.breakMinutes,
    };
    const span = effectiveSpan(facts);
    const length = span ? shiftLength(span) : null;
    const counts = shiftCounts(r.status);
    const month = monthStart(r.workDate);
    const figure = figures.get(month)?.rows.find((p) => p.staffMemberId === r.staffMemberId);
    const warnings: ShiftWarning[] = [];
    if (counts) {
      for (const w of arbzgByPerson.get(r.staffMemberId) ?? []) {
        if (w.date === r.workDate) warnings.push({ kind: "arbzg", warning: w });
      }
      const level = figure?.minijob?.status.level;
      if (level === "amber" || level === "red") warnings.push({ kind: "minijob", level });
    }
    return {
      ...r,
      plannedStart: facts.plannedStart,
      plannedEnd: facts.plannedEnd,
      actualStart: facts.actualStart,
      actualEnd: facts.actualEnd,
      minutes: counts ? (length?.netMinutes ?? 0) : 0,
      source: counts && span ? span.source : null,
      recording: counts
        ? recordingState({
            workDate: r.workDate,
            hasActualTimes: Boolean(facts.actualStart && facts.actualEnd),
            today,
          })
        : ("recorded" as const),
      recordingDeadline: recordingDeadline(r.workDate),
      locked: (periodOf.get(month) ?? "open") !== "open",
      warnings,
    };
  });
  return { rows: shiftRows, live };
}

/** Shifts with their length, §17 MiLoG state and warnings (see `loadShiftList`). */
export async function listShiftRows(
  actor: Actor,
  filter: ShiftFilter,
  today: string,
): Promise<ShiftRow[]> {
  return (await loadShiftList(actor, filter, today)).rows;
}

/** Weekday/holiday info for a month grid header. */
export function monthDays(month: string): { date: string; holiday: string | null }[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const holidays = holidaysBetween(first, last);
  const days: { date: string; holiday: string | null }[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const h = holidays.get(d);
    days.push({ date: d, holiday: h?.statutory ? h.nameDe : null });
  }
  return days;
}

// ---------------------------------------------------------------------------------------------
// Staff with an event shift (field scope) is handled in actor.ts (visibleEvents).

// ---------------------------------------------------------------------------------------------
// Übersicht + Kalender

type Messages = Record<string, string>;

async function dueMessages(locale: string): Promise<Messages> {
  const loaded = (await import(
    `../../../messages/${locale === "en" ? "en" : "de"}/hours.json`
  )) as { default: { hours: { due: Messages } } };
  return loaded.default.hours.due;
}

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

function urgencyOf(dueOn: string, today: string): "overdue" | "today" | "soon" {
  return dueOn < today ? "overdue" : dueOn === today ? "today" : "soon";
}

/**
 * "Heute fällig" items of the hours module: shifts whose times are still missing (grouped per event and
 * day, deadline = day 7 after the work) and the month close from the 8th, a week before the 15th.
 * Only for people who may manage hours.
 */
export async function dueItems(actor: Actor, today: string): Promise<DueItem[]> {
  if (!can(actor.role, "team", "manage")) return [];
  const t = await dueMessages(actor.locale);
  const items: DueItem[] = [];

  const lookBack = addDays(today, -60);
  const missing = await db
    .select({
      eventId: shift.eventId,
      eventName: event.name,
      workDate: shift.workDate,
      n: sql<number>`count(*)::int`,
    })
    .from(shift)
    .leftJoin(event, eq(event.id, shift.eventId))
    .where(
      and(
        lt(shift.workDate, today),
        gte(shift.workDate, lookBack),
        inArray(shift.status, ["requested", "confirmed", "worked"]),
        or(isNull(shift.actualStart), isNull(shift.actualEnd)),
        or(isNull(shift.eventId), visibleEvents(actor)),
      ),
    )
    .groupBy(shift.eventId, event.name, shift.workDate)
    .orderBy(asc(shift.workDate));
  for (const row of missing) {
    const dueOn = recordingDeadline(row.workDate);
    items.push({
      kind: "hours",
      id: `hours:${row.eventId ?? "office"}:${row.workDate}`,
      title: fill(t.missing ?? "", { count: row.n }),
      dueOn,
      urgency: urgencyOf(dueOn, today),
      href: row.eventId
        ? `/veranstaltungen/${row.eventId}/team`
        : `/team/schichten?month=${row.workDate.slice(0, 7)}`,
      meta: row.eventName ?? t.office ?? "",
      eventId: row.eventId,
    });
  }

  const month = payrollMonthToClose(today);
  const deadline = payrollDeadline(month);
  if (deadline <= addDays(today, 7)) {
    const [period, [anyShift]] = await Promise.all([
      getPeriod(month),
      db
        .select({ id: shift.id })
        .from(shift)
        .where(and(gte(shift.workDate, month), lte(shift.workDate, monthEnd(month))))
        .limit(1),
    ]);
    if (anyShift && period?.status !== "exported") {
      items.push({
        kind: "hours",
        id: `payroll:${month.slice(0, 7)}`,
        title: fill(t.payroll ?? "", { month: month.slice(0, 7) }),
        dueOn: deadline,
        urgency: urgencyOf(deadline, today),
        href: `/team/stunden/abschluss?month=${month.slice(0, 7)}`,
        meta: t.payrollMeta ?? "",
      });
    }
  }
  return items;
}

/**
 * Layer "shifts": one entry per event and day with the number of shifts (office: per day). Managers
 * and readers see everyone's; field users only their own shifts at events they can see.
 */
export async function calendarItems(
  actor: Actor,
  from: string,
  to: string,
): Promise<CalendarItem[]> {
  const canReadAll = can(actor.role, "team", "read");
  if (!canReadAll && (actor.role !== "field" || !actor.staffMemberId)) return [];
  const t = await dueMessages(actor.locale);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());

  const conditions: (SQL | undefined)[] = [
    gte(shift.workDate, from),
    lte(shift.workDate, to),
    ne(shift.status, "declined"),
    ne(shift.status, "cancelled"),
    ne(shift.status, "no_show"),
    or(isNull(shift.eventId), visibleEvents(actor)),
  ];
  if (!canReadAll && actor.staffMemberId)
    conditions.push(eq(shift.staffMemberId, actor.staffMemberId));

  const rows = await db
    .select({
      eventId: shift.eventId,
      eventName: event.name,
      workDate: shift.workDate,
      n: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${shift.actualStart} is null or ${shift.actualEnd} is null)::int`,
    })
    .from(shift)
    .leftJoin(event, eq(event.id, shift.eventId))
    .where(and(...conditions))
    .groupBy(shift.eventId, event.name, shift.workDate)
    .orderBy(asc(shift.workDate));

  return rows.map((row) => {
    const overdue = row.open > 0 && recordingDeadline(row.workDate) < today;
    const pending = row.open > 0 && row.workDate < today;
    return {
      layer: "shifts" as const,
      id: `shifts:${row.eventId ?? "office"}:${row.workDate}`,
      date: row.workDate,
      title: `${row.eventName ?? t.office ?? ""} · ${fill(t.shiftCount ?? "", { count: row.n })}`,
      href: row.eventId
        ? `/veranstaltungen/${row.eventId}/team`
        : `/team/schichten?month=${row.workDate.slice(0, 7)}`,
      tone: overdue ? ("critical" as const) : pending ? ("warn" as const) : ("neutral" as const),
    };
  });
}

/** Active staff for pickers (shift entry): id + name. */
export async function listShiftPeople(): Promise<{ id: string; displayName: string }[]> {
  return db
    .select({ id: staffMember.id, displayName: staffMember.displayName })
    .from(staffMember)
    .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
    .orderBy(asc(staffMember.displayName));
}

/** Events whose days are around a date range (office hours have none): for the "Veranstaltung" select. */
export async function listEventOptions(
  actor: Actor,
  from: string,
  to: string,
): Promise<{ id: string; name: string; startsOn: string; endsOn: string }[]> {
  return db
    .select({ id: event.id, name: event.name, startsOn: event.startsOn, endsOn: event.endsOn })
    .from(event)
    .where(
      and(
        visibleEvents(actor),
        ne(event.status, "cancelled"),
        lte(event.startsOn, addDays(to, 7)),
        gte(event.endsOn, addDays(from, -7)),
      ),
    )
    .orderBy(asc(event.startsOn), asc(event.name));
}

/** One CSV row per person with hours or pay in the month (shared by the export and its preview). */
export function payrollRowsOf(figures: MonthFigures): PayrollCsvRow[] {
  return figures.rows
    .filter((r) => r.month.workedMinutes > 0 || r.month.grossCents > 0)
    .map((r) => ({
      name: r.displayName,
      contractType: r.contractType,
      workedMinutes: r.month.workedMinutes,
      hourlyRateCents: r.month.fixedPayCents > 0 ? null : r.month.lastRateCents,
      grossCents: r.month.grossCents,
      justification: r.justification?.reason ?? null,
    }));
}
