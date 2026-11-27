import "server-only";
import {
  addDays,
  type BudgetLevel,
  budgetStatus,
  eachDay,
  hourBudget,
  isoWeek,
  type MonthUsage,
  mondayOf,
  monthEnd,
  monthStart,
  monthUsage,
  needGaps,
  rankCandidates,
  type ScheduleKind,
  type ShiftCandidate,
  type ShiftStatus,
  weekTotals,
} from "@marktwerk/core";
import {
  dutyRole,
  employmentContract,
  event,
  eventPreset,
  shift,
  shiftNeed,
  staffMember,
  staffUnavailability,
} from "@marktwerk/db/schema";
import { and, asc, eq, gte, isNull, lte, or, type SQL } from "drizzle-orm";
import { db } from "../db";
import { defaultHourBudget, loadCandidateInputs } from "./planning-candidates";

export type PlanningShift = {
  id: string;
  version: number;
  eventId: string | null;
  needId: string | null;
  workDate: string;
  status: ShiftStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  roleName: string | null;
  roleNameEn: string | null;
  marketShortCode: string | null;
  marketColor: string | null;
};
export type PlanningNeed = {
  id: string;
  eventId: string;
  eventName: string;
  workDate: string;
  dutyRoleId: string;
  roleName: string;
  roleNameEn: string;
  scheduleKind: ScheduleKind;
  headcount: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  filled: number;
  open: number;
  over: number;
  marketShortCode: string | null;
  marketColor: string | null;
};
export type PlanningPerson = {
  staffMemberId: string;
  displayName: string;
  usual: boolean;
  budgetMinutes: number;
  noContract: boolean;
  usage: MonthUsage;
  leftMinutes: number;
  level: BudgetLevel;
  /** "2026-W49" → minutes (information only). */
  weeks: Record<string, number>;
  shiftsByDay: Record<string, PlanningShift[]>;
  /** date → note (null = no note) for "nicht verfügbar". */
  unavailable: Record<string, string | null>;
};
export type PlanningMonth = {
  month: string;
  days: string[];
  weeks: { key: string; week: number; days: string[] }[];
  needsByDay: Record<string, PlanningNeed[]>;
  people: PlanningPerson[];
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const formatWeekKey = (year: number, week: number) => `${year}-W${String(week).padStart(2, "0")}`;
const weekKey = (date: string) => {
  const { year, week } = isoWeek(date);
  return formatWeekKey(year, week);
};
const KIND_ORDER: Record<ScheduleKind, number> = { setup: 0, open: 1, teardown: 2 };

async function loadNeeds(where: SQL | undefined) {
  const rows = await db
    .select({
      id: shiftNeed.id,
      eventId: shiftNeed.eventId,
      eventName: event.name,
      workDate: shiftNeed.workDate,
      dutyRoleId: shiftNeed.dutyRoleId,
      roleName: dutyRole.nameDe,
      roleNameEn: dutyRole.nameEn,
      scheduleKind: shiftNeed.scheduleKind,
      headcount: shiftNeed.headcount,
      plannedStart: shiftNeed.plannedStart,
      plannedEnd: shiftNeed.plannedEnd,
      marketShortCode: eventPreset.shortCode,
      marketColor: eventPreset.color,
    })
    .from(shiftNeed)
    .innerJoin(event, eq(event.id, shiftNeed.eventId))
    .innerJoin(dutyRole, eq(dutyRole.id, shiftNeed.dutyRoleId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(and(where, isNull(event.archivedAt)));
  return rows.sort(
    (a, b) =>
      a.workDate.localeCompare(b.workDate) ||
      a.eventName.localeCompare(b.eventName, "de") ||
      KIND_ORDER[a.scheduleKind] - KIND_ORDER[b.scheduleKind],
  );
}

async function loadShifts(where: SQL | undefined) {
  return db
    .select({
      id: shift.id,
      version: shift.version,
      staffMemberId: shift.staffMemberId,
      displayName: staffMember.displayName,
      eventId: shift.eventId,
      needId: shift.needId,
      workDate: shift.workDate,
      status: shift.status,
      plannedStart: shift.plannedStart,
      plannedEnd: shift.plannedEnd,
      actualStart: shift.actualStart,
      actualEnd: shift.actualEnd,
      breakMinutes: shift.breakMinutes,
      roleName: dutyRole.nameDe,
      roleNameEn: dutyRole.nameEn,
      marketShortCode: eventPreset.shortCode,
      marketColor: eventPreset.color,
    })
    .from(shift)
    .innerJoin(staffMember, eq(staffMember.id, shift.staffMemberId))
    .leftJoin(dutyRole, eq(dutyRole.id, shift.dutyRoleId))
    .leftJoin(event, eq(event.id, shift.eventId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(where);
}

type ShiftRowDb = Awaited<ReturnType<typeof loadShifts>>[number];
const toPlanningShift = (s: ShiftRowDb): PlanningShift => ({
  id: s.id,
  version: s.version,
  eventId: s.eventId,
  needId: s.needId,
  workDate: s.workDate,
  status: s.status,
  plannedStart: hhmm(s.plannedStart),
  plannedEnd: hhmm(s.plannedEnd),
  roleName: s.roleName,
  roleNameEn: s.roleNameEn,
  marketShortCode: s.marketShortCode,
  marketColor: s.marketColor,
});
const timesOf = (s: ShiftRowDb) => ({
  workDate: s.workDate,
  status: s.status,
  plannedStart: hhmm(s.plannedStart),
  plannedEnd: hhmm(s.plannedEnd),
  actualStart: hhmm(s.actualStart),
  actualEnd: hhmm(s.actualEnd),
  breakMinutes: s.breakMinutes,
});

function withGaps(
  needs: Awaited<ReturnType<typeof loadNeeds>>,
  shifts: readonly ShiftRowDb[],
): PlanningNeed[] {
  return needs.map((n) => ({
    ...n,
    plannedStart: hhmm(n.plannedStart),
    plannedEnd: hhmm(n.plannedEnd),
    ...needGaps(
      n.headcount,
      shifts.filter((s) => s.needId === n.id).map((s) => s.status),
    ),
  }));
}

/** Team → Planung: people × market days of one month (spec §6). */
export async function getPlanningMonth(
  monthInput: string,
  opts: { allDays?: boolean } = {},
): Promise<PlanningMonth> {
  const month = monthStart(monthInput);
  const to = monthEnd(month);
  const inMonth = (col: typeof shift.workDate | typeof shiftNeed.workDate) =>
    and(gte(col, month), lte(col, to));
  const needs = await loadNeeds(inMonth(shiftNeed.workDate));
  // Week totals cover whole ISO weeks (Mon–Sun), so load from the Monday of the
  // first week to the Sunday of the last; grid and gaps stay month-only.
  const weekFrom = mondayOf(month);
  const weekTo = addDays(mondayOf(to), 6);
  const loaded = await loadShifts(and(gte(shift.workDate, weekFrom), lte(shift.workDate, weekTo)));
  const shifts = loaded.filter((s) => s.workDate >= month && s.workDate <= to);
  const people = await db
    .select({
      id: staffMember.id,
      displayName: staffMember.displayName,
      preferred: staffMember.preferredDutyRoleIds,
    })
    .from(staffMember)
    .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
    .orderBy(asc(staffMember.displayName));
  const contracts = await db
    .select({
      staffMemberId: employmentContract.staffMemberId,
      validFrom: employmentContract.validFrom,
      validUntil: employmentContract.validUntil,
      monthlyHourBudget: employmentContract.monthlyHourBudget,
    })
    .from(employmentContract)
    .where(
      and(
        lte(employmentContract.validFrom, to),
        or(isNull(employmentContract.validUntil), gte(employmentContract.validUntil, month)),
      ),
    );
  const away = await db
    .select()
    .from(staffUnavailability)
    .where(and(gte(staffUnavailability.date, month), lte(staffUnavailability.date, to)));
  const fallback = await defaultHourBudget();

  const planningNeeds = withGaps(needs, shifts);
  const needsByDay: Record<string, PlanningNeed[]> = {};
  for (const n of planningNeeds) {
    needsByDay[n.workDate] = [...(needsByDay[n.workDate] ?? []), n];
  }
  const neededRoles = new Set(planningNeeds.map((n) => n.dutyRoleId));
  const days = opts.allDays ? eachDay(month, to) : Object.keys(needsByDay).sort();
  const weeks: PlanningMonth["weeks"] = [];
  for (const day of days) {
    const key = weekKey(day);
    const last = weeks.at(-1);
    if (last?.key === key) last.days.push(day);
    else weeks.push({ key, week: isoWeek(day).week, days: [day] });
  }

  const rows: PlanningPerson[] = people.map((p) => {
    const ownWeeks = loaded.filter((s) => s.staffMemberId === p.id);
    const own = shifts.filter((s) => s.staffMemberId === p.id);
    const budget = hourBudget(
      contracts.filter((c) => c.staffMemberId === p.id),
      month,
      fallback,
    );
    const usage = monthUsage(ownWeeks.map(timesOf), month);
    const status = budgetStatus(usage, budget.minutes);
    const shiftsByDay: Record<string, PlanningShift[]> = {};
    for (const s of own) {
      shiftsByDay[s.workDate] = [...(shiftsByDay[s.workDate] ?? []), toPlanningShift(s)];
    }
    const unavailable: Record<string, string | null> = {};
    for (const a of away) if (a.staffMemberId === p.id) unavailable[a.date] = a.note;
    return {
      staffMemberId: p.id,
      displayName: p.displayName,
      usual: p.preferred.some((id) => neededRoles.has(id)),
      budgetMinutes: budget.minutes,
      noContract: budget.noContract,
      usage,
      leftMinutes: status.leftMinutes,
      level: status.level,
      weeks: Object.fromEntries(
        weekTotals(ownWeeks.map(timesOf)).map((w) => [formatWeekKey(w.year, w.week), w.minutes]),
      ),
      shiftsByDay,
      unavailable,
    };
  });
  rows.sort(
    (a, b) => Number(b.usual) - Number(a.usual) || a.displayName.localeCompare(b.displayName, "de"),
  );
  return { month, days, weeks, needsByDay, people: rows };
}

export type EventPlanningShift = PlanningShift & { displayName: string };
export type EventPlanningDay = {
  workDate: string;
  needs: (PlanningNeed & { shifts: EventPlanningShift[] })[];
};

/** Event → Team: one block per day with its needs and their shifts; shifts without a need are "Weitere Schichten". */
export async function getEventPlanning(eventId: string): Promise<{
  days: EventPlanningDay[];
  loose: EventPlanningShift[];
  canApplyPreset: boolean;
  openTotal: number;
}> {
  const needs = await loadNeeds(eq(shiftNeed.eventId, eventId));
  const shifts = await loadShifts(eq(shift.eventId, eventId));
  const planningNeeds = withGaps(needs, shifts);
  const visible = (s: ShiftRowDb) => s.status !== "cancelled";
  const asEventShift = (s: ShiftRowDb): EventPlanningShift => ({
    ...toPlanningShift(s),
    displayName: s.displayName,
  });
  const byDay = new Map<string, EventPlanningDay>();
  for (const n of planningNeeds) {
    const day = byDay.get(n.workDate) ?? { workDate: n.workDate, needs: [] };
    day.needs.push({
      ...n,
      shifts: shifts.filter((s) => s.needId === n.id && visible(s)).map(asEventShift),
    });
    byDay.set(n.workDate, day);
  }
  const [preset] = await db
    .select({ staffing: eventPreset.staffing })
    .from(event)
    .innerJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(and(eq(event.id, eventId), isNull(event.archivedAt)));
  return {
    days: [...byDay.values()],
    loose: shifts.filter((s) => s.needId === null && visible(s)).map(asEventShift),
    canApplyPreset: needs.length === 0 && (preset?.staffing.length ?? 0) > 0,
    openTotal: planningNeeds.reduce((sum, n) => sum + n.open, 0),
  };
}

/** The picker for one need: ranked candidates with flags (spec §4.5). */
export async function listCandidates(needId: string): Promise<ShiftCandidate[]> {
  const [need] = await db.select().from(shiftNeed).where(eq(shiftNeed.id, needId));
  if (!need?.plannedStart || !need.plannedEnd) return [];
  const slot = {
    workDate: need.workDate,
    plannedStart: need.plannedStart.slice(0, 5),
    plannedEnd: need.plannedEnd.slice(0, 5),
  };
  const inputs = await loadCandidateInputs({
    ...slot,
    eventId: need.eventId,
    dutyRoleId: need.dutyRoleId,
  });
  return rankCandidates(slot, inputs);
}
