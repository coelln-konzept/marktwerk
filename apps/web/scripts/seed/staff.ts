/**
 * M4 seed: employment contracts, shifts (the synthetic 2026 field-crew records), payroll months and Minijob
 * overrun justifications.
 *
 * Derived here (not in the synthetic dataset), deterministically:
 *  - `payroll_period`: one row per month from the first shift to the reference month. Past months are
 *    `exported` (locked on the 3rd, approved on the 10th, exported on the 12th of the following month),
 *    the reference month is `open`.
 *  - `overrun_justification`: for every Minijob person-month whose recorded earnings exceed the legal
 *    limit of that month (the generator plants two in 2026-08).
 *  - the Minijob parameters of the data model are inserted if the legal values are missing.
 */

import { schema } from "@marktwerk/db";
import { REFERENCE_DATE } from "@marktwerk/synthetic";
import { derivedId, insertAll, instant, minutesOf, type SeedContext, type Tx } from "./shared";

/** The M4 keys from docs/architecture/data-model.md (2026: 1390 / 60300; 2027: 1460 / 63300). */
const MINIJOB_PARAMETERS = [
  ["minimum_wage_cents_per_hour", 1390, "2026-01-01"],
  ["minijob_limit_cents_per_month", 60300, "2026-01-01"],
  ["minimum_wage_cents_per_hour", 1460, "2027-01-01"],
  ["minijob_limit_cents_per_month", 63300, "2027-01-01"],
  ["minijob_overrun_ceiling_factor", 2, "2026-01-01"],
  ["minijob_max_overrun_months_12", 2, "2026-01-01"],
] as const;

export async function seedStaff(tx: Tx, { data, officeStaffId }: SeedContext) {
  // Legal values are normally already there (the synthetic dataset carries them); this only fills gaps.
  const have = new Set(data.legalParameters.map((p) => `${p.key}|${p.validFrom}`));
  const missing = MINIJOB_PARAMETERS.filter(([key, , from]) => !have.has(`${key}|${from}`));
  if (missing.length > 0) {
    await insertAll(
      tx,
      schema.legalParameter,
      missing.map(([key, value, validFrom]) => ({ key, value, validFrom })),
      "legal parameters (M4 gaps)",
    );
  }

  await insertAll(
    tx,
    schema.employmentContract,
    data.employmentContracts.map((c) => ({
      id: c.id,
      staffMemberId: c.staffMemberId,
      type: c.type,
      hourlyRateCents: c.hourlyRateCents,
      contractedHoursPerWeek: c.contractedHoursPerWeek,
      fixedMonthlyPayCents: c.fixedMonthlyPayCents,
      workingTimeAccount: c.workingTimeAccount,
      otherMinijobDeclared: c.otherMinijobDeclared,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
    })),
    "employment contracts",
  );

  const validDutyRoleIds = new Set(data.dutyRoles.map((r) => r.id));
  await insertAll(
    tx,
    schema.shift,
    data.shifts.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      staffMemberId: s.staffMemberId,
      // The generator falls back to "" when a person has no preferred duty role.
      dutyRoleId: validDutyRoleIds.has(s.dutyRoleId) ? s.dutyRoleId : null,
      workDate: s.workDate,
      plannedStart: s.plannedStart,
      plannedEnd: s.plannedEnd,
      actualStart: s.actualStart,
      actualEnd: s.actualEnd,
      breakMinutes: s.breakMinutes,
      status: s.status,
      recordedByStaffMemberId: s.recordedById,
      recordedAt: instant(s.recordedAt),
    })),
    "shifts",
  );

  // Payroll months: from the first shift's month up to the reference month.
  const months = [...new Set(data.shifts.map((s) => s.workDate.slice(0, 7)))].sort();
  const currentMonth = REFERENCE_DATE.slice(0, 7);
  const first = months[0];
  const monthList: string[] = [];
  if (first) {
    let [y = 0, m = 0] = first.split("-").map(Number);
    const [cy = 0, cm = 0] = currentMonth.split("-").map(Number);
    while (y < cy || (y === cy && m <= cm)) {
      monthList.push(`${y}-${String(m).padStart(2, "0")}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  const nextMonthDay = (month: string, day: number, hour: number) => {
    const [y = 0, m = 0] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m, day, hour));
  };
  await insertAll(
    tx,
    schema.payrollPeriod,
    monthList.map((month) => {
      const open = month === currentMonth;
      return {
        id: derivedId("payroll_period", month),
        month: `${month}-01`,
        status: open ? ("open" as const) : ("exported" as const),
        lockedAt: open ? null : nextMonthDay(month, 3, 9),
        lockedByStaffMemberId: open ? null : officeStaffId,
        approvedAt: open ? null : nextMonthDay(month, 10, 9),
        approvedByStaffMemberId: open ? null : officeStaffId,
        exportedAt: open ? null : nextMonthDay(month, 12, 9),
      };
    }),
    "payroll periods",
  );

  // Overrun justifications for Minijob person-months above the monthly limit.
  const limitFor = (month: string) =>
    data.legalParameters
      .filter((p) => p.key === "minijob_limit_cents_per_month" && p.validFrom <= `${month}-01`)
      .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0]?.value ?? Number.POSITIVE_INFINITY;
  const contractByStaff = new Map(data.employmentContracts.map((c) => [c.staffMemberId, c]));
  const earned = new Map<string, number>();
  for (const s of data.shifts) {
    if (s.status !== "worked") continue;
    const contract = contractByStaff.get(s.staffMemberId);
    if (contract?.type !== "minijob" || !contract.hourlyRateCents) continue;
    const start = s.actualStart ?? s.plannedStart;
    const end = s.actualEnd ?? s.plannedEnd;
    const minutes = Math.max(0, minutesOf(end) - minutesOf(start) - s.breakMinutes);
    const key = `${s.staffMemberId}|${s.workDate.slice(0, 7)}`;
    earned.set(key, (earned.get(key) ?? 0) + Math.round((minutes * contract.hourlyRateCents) / 60));
  }
  const overruns = [...earned.entries()].filter(([key, cents]) => {
    const month = key.split("|")[1] ?? "";
    return cents > limitFor(month);
  });
  await insertAll(
    tx,
    schema.overrunJustification,
    overruns.map(([key]) => {
      const [staffMemberId = "", month = ""] = key.split("|");
      return {
        id: derivedId("overrun_justification", key),
        staffMemberId,
        month: `${month}-01`,
        reason: "Unvorhersehbarer Mehrbedarf: kurzfristiger Ausfall im Aufbauteam.",
        recordedById: officeStaffId,
      };
    }),
    "overrun justifications",
  );
}
