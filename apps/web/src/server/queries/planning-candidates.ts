// apps/web/src/server/queries/planning-candidates.ts
import "server-only";
import {
  addDays,
  budgetStatus,
  type CandidateInput,
  DEFAULT_MONTHLY_HOUR_BUDGET,
  hourBudget,
  monthEnd,
  monthStart,
  monthUsage,
} from "@marktwerk/core";
import {
  employmentContract,
  eventDuty,
  settings,
  shift,
  staffMember,
  staffUnavailability,
} from "@marktwerk/db/schema";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** The default budget in hours from settings (company policy, 40 h unless changed). */
export async function defaultHourBudget(): Promise<number> {
  const [row] = await db.select({ hours: settings.defaultMonthlyHourBudget }).from(settings);
  return row?.hours ?? DEFAULT_MONTHLY_HOUR_BUDGET;
}

/**
 * Everything `rankCandidates` needs for one slot: active staff (or only `only`), whether they are "usual" for this
 * role here, budget left this month, nicht verfügbar that day, and their shifts around the day.
 */
export async function loadCandidateInputs(
  slot: { workDate: string; eventId: string; dutyRoleId: string },
  only?: readonly string[],
): Promise<CandidateInput[]> {
  const month = monthStart(slot.workDate);
  const monthTo = monthEnd(month);
  const people = await db
    .select({
      id: staffMember.id,
      displayName: staffMember.displayName,
      preferred: staffMember.preferredDutyRoleIds,
    })
    .from(staffMember)
    .where(
      and(
        eq(staffMember.active, true),
        isNull(staffMember.archivedAt),
        only ? inArray(staffMember.id, [...only]) : undefined,
      ),
    )
    .orderBy(asc(staffMember.displayName));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);
  const duty = await db
    .select({ staffMemberId: eventDuty.staffMemberId })
    .from(eventDuty)
    .where(and(eq(eventDuty.eventId, slot.eventId), eq(eventDuty.dutyRoleId, slot.dutyRoleId)));
  const shifts = await db
    .select()
    .from(shift)
    .where(
      and(
        inArray(shift.staffMemberId, ids),
        gte(shift.workDate, addDays(month, -1)),
        lte(shift.workDate, addDays(monthTo, 1)),
      ),
    );
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
        inArray(employmentContract.staffMemberId, ids),
        lte(employmentContract.validFrom, monthTo),
        or(isNull(employmentContract.validUntil), gte(employmentContract.validUntil, month)),
      ),
    );
  const away = await db
    .select({ staffMemberId: staffUnavailability.staffMemberId, note: staffUnavailability.note })
    .from(staffUnavailability)
    .where(
      and(
        inArray(staffUnavailability.staffMemberId, ids),
        eq(staffUnavailability.date, slot.workDate),
      ),
    );
  const fallback = await defaultHourBudget();
  const usual = new Set(duty.map((d) => d.staffMemberId));
  const awayNote = new Map(away.map((a) => [a.staffMemberId, a.note]));
  return people.map((p) => {
    const own = shifts
      .filter((s) => s.staffMemberId === p.id)
      .map((s) => ({
        ...s,
        plannedStart: hhmm(s.plannedStart),
        plannedEnd: hhmm(s.plannedEnd),
        actualStart: hhmm(s.actualStart),
        actualEnd: hhmm(s.actualEnd),
      }));
    const budget = hourBudget(
      contracts.filter((c) => c.staffMemberId === p.id),
      month,
      fallback,
    );
    const status = budgetStatus(monthUsage(own, month), budget.minutes);
    return {
      staffMemberId: p.id,
      displayName: p.displayName,
      usual: usual.has(p.id) || p.preferred.includes(slot.dutyRoleId),
      leftMinutes: status.leftMinutes,
      unavailableNote: awayNote.has(p.id) ? (awayNote.get(p.id) ?? null) : undefined,
      dayShifts: own.filter((s) => s.workDate === slot.workDate),
      recentShifts: own.filter(
        (s) => s.workDate >= addDays(slot.workDate, -1) && s.workDate <= addDays(slot.workDate, 1),
      ),
    };
  });
}
