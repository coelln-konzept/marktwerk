import "server-only";
import { can, isMonthStart, monthEnd, type PayrollCsvRow, payrollCsv } from "@marktwerk/core";
import { overrunJustification, payrollPeriod, shift } from "@marktwerk/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { loadLegalRows } from "../legal-params";
import {
  type CloseCheck,
  closeChecksOf,
  loadMonthFigures,
  type PeriodStatus,
} from "../queries/hours";
import { audit } from "./audit";

export type PayrollError =
  | "invalid_month"
  | "invalid_status"
  | "checks_failed"
  | "reason_required"
  | "invalid_person"
  | "no_overrun"
  | "reason_too_short"
  | "period_locked";

export class PayrollInputError extends Error {
  constructor(
    readonly code: PayrollError,
    /** For `checks_failed`: the blockers that stopped the lock. */
    readonly blockers: CloseCheck[] = [],
  ) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;

/** Today in Berlin, overridable in tests. */
function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

/**
 * Makes sure the payroll period row of a month exists and locks it: `share` for edits of that month's
 * shifts (many at once), `update` for changing the period itself. This serialises "lock the month"
 * against concurrent edits, so no edit slips into a month while it is being locked.
 */
export async function lockPeriodRow(tx: Tx, month: string, mode: "share" | "update") {
  await tx.insert(payrollPeriod).values({ month }).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(payrollPeriod)
    .where(eq(payrollPeriod.month, month))
    .for(mode);
  if (!row) throw new Error("payroll period vanished");
  return row;
}

/** Throws `period_locked` unless the month of `date` is still open. */
export async function assertMonthOpen(tx: Tx, date: string): Promise<void> {
  const row = await lockPeriodRow(tx, `${date.slice(0, 7)}-01`, "share");
  if (row.status !== "open") throw new PayrollInputError("period_locked");
}

function assertManage(actor: Actor) {
  if (!can(actor.role, "team", "manage")) forbidden();
}

function assertMonth(month: string) {
  if (!isMonthStart(month)) throw new PayrollInputError("invalid_month");
}

/**
 * Step 2 "Sperren": freezes the hours of a finished month. Refused while blockers exist (shifts
 * without times, Minijob overruns without a justification, work without a contract, month not over).
 */
export async function lockPeriod(
  actor: Actor,
  month: string,
  opts: { today?: string } = {},
): Promise<{ status: PeriodStatus }> {
  assertManage(actor);
  assertMonth(month);
  const today = opts.today ?? berlinToday();
  return db.transaction(async (tx) => {
    const period = await lockPeriodRow(tx, month, "update");
    if (period.status !== "open") throw new PayrollInputError("invalid_status");
    const figures = await loadMonthFigures(tx, month, today, await loadLegalRows(tx));
    const blockers = closeChecksOf(figures, today).filter((c) => c.level === "blocker");
    if (blockers.length > 0) throw new PayrollInputError("checks_failed", blockers);
    await tx
      .update(payrollPeriod)
      .set({
        status: "locked",
        lockedAt: new Date(),
        lockedByStaffMemberId: actor.staffMemberId,
      })
      .where(eq(payrollPeriod.id, period.id));
    await audit(tx, actor.id, [
      {
        action: "payroll.lock",
        entityType: "payroll_period",
        entityId: period.id,
        diff: { month, from: "open", to: "locked" },
      },
    ]);
    return { status: "locked" as const };
  });
}

/** Step 3 "Freigeben": the management approves the locked month for the payroll office. */
export async function approvePeriod(
  actor: Actor,
  month: string,
): Promise<{ status: PeriodStatus }> {
  assertManage(actor);
  assertMonth(month);
  return db.transaction(async (tx) => {
    const period = await lockPeriodRow(tx, month, "update");
    if (period.status !== "locked") throw new PayrollInputError("invalid_status");
    const now = new Date();
    await tx
      .update(payrollPeriod)
      .set({ status: "approved", approvedAt: now, approvedByStaffMemberId: actor.staffMemberId })
      .where(eq(payrollPeriod.id, period.id));
    // Worked shifts of the month carry the approval (§17 MiLoG: who confirmed the hours, when).
    await tx
      .update(shift)
      .set({ approvedAt: now, approvedByStaffMemberId: actor.staffMemberId })
      .where(
        and(
          eq(shift.status, "worked"),
          gte(shift.workDate, month),
          lte(shift.workDate, monthEnd(month)),
        ),
      );
    await audit(tx, actor.id, [
      {
        action: "payroll.approve",
        entityType: "payroll_period",
        entityId: period.id,
        diff: { month, from: "locked", to: "approved" },
      },
    ]);
    return { status: "approved" as const };
  });
}

/** Back to `open` with a reason, so hours can be corrected. Every correction stays versioned. */
export async function unlockPeriod(
  actor: Actor,
  month: string,
  reason: string,
): Promise<{ status: PeriodStatus; from: PeriodStatus }> {
  assertManage(actor);
  assertMonth(month);
  const why = reason.trim();
  if (why.length < 3) throw new PayrollInputError("reason_required");
  return db.transaction(async (tx) => {
    const period = await lockPeriodRow(tx, month, "update");
    if (period.status === "open") throw new PayrollInputError("invalid_status");
    await tx
      .update(payrollPeriod)
      .set({
        status: "open",
        lockedAt: null,
        lockedByStaffMemberId: null,
        approvedAt: null,
        approvedByStaffMemberId: null,
        exportedAt: null,
      })
      .where(eq(payrollPeriod.id, period.id));
    await tx
      .update(shift)
      .set({ approvedAt: null, approvedByStaffMemberId: null })
      .where(and(gte(shift.workDate, month), lte(shift.workDate, monthEnd(month))));
    await audit(tx, actor.id, [
      {
        action: "payroll.unlock",
        entityType: "payroll_period",
        entityId: period.id,
        diff: { month, from: period.status, to: "open", reason: why },
      },
    ]);
    return { status: "open" as const, from: period.status };
  });
}

export type PayrollExport = { filename: string; csv: string; rows: number };

/**
 * Step 4 "Exportieren": the CSV of an approved month (generated on the fly; the first export marks the
 * month exported, later ones are only audited). One row per person with hours, gross and contract type.
 */
export async function exportPeriod(actor: Actor, month: string): Promise<PayrollExport> {
  assertManage(actor);
  assertMonth(month);
  return db.transaction(async (tx) => {
    const period = await lockPeriodRow(tx, month, "update");
    if (period.status !== "approved" && period.status !== "exported")
      throw new PayrollInputError("invalid_status");
    const figures = await loadMonthFigures(tx, month, berlinToday(), await loadLegalRows(tx));
    const rows: PayrollCsvRow[] = figures.rows
      .filter((r) => r.month.workedMinutes > 0 || r.month.grossCents > 0)
      .map((r) => ({
        name: r.displayName,
        contractType: r.contractType,
        workedMinutes: r.month.workedMinutes,
        hourlyRateCents: r.month.fixedPayCents > 0 ? null : r.month.lastRateCents,
        grossCents: r.month.grossCents,
        justification: r.justification?.reason ?? null,
      }));
    const first = period.status === "approved";
    if (first) {
      await tx
        .update(payrollPeriod)
        .set({ status: "exported", exportedAt: new Date() })
        .where(eq(payrollPeriod.id, period.id));
    }
    await audit(tx, actor.id, [
      {
        action: first ? "payroll.export" : "payroll.reexport",
        entityType: "payroll_period",
        entityId: period.id,
        diff: { month, rows: rows.length },
      },
    ]);
    return { filename: `lohn_${month.slice(0, 7)}.csv`, csv: payrollCsv(rows), rows: rows.length };
  });
}

/**
 * Why a Minijob person went over the monthly limit ("unforeseeable", at most 2 months in 12). Needed
 * before the month can be locked; stored once per person and month and exported with the CSV.
 */
export async function saveOverrunJustification(
  actor: Actor,
  staffMemberId: string,
  month: string,
  reason: string,
  opts: { today?: string } = {},
): Promise<{ created: boolean }> {
  assertManage(actor);
  assertMonth(month);
  if (!UUID.test(staffMemberId)) throw new PayrollInputError("invalid_person");
  const text = reason.trim();
  if (text.length < 5) throw new PayrollInputError("reason_too_short");
  const today = opts.today ?? berlinToday();
  return db.transaction(async (tx) => {
    const period = await lockPeriodRow(tx, month, "share");
    if (period.status !== "open") throw new PayrollInputError("period_locked");
    const figures = await loadMonthFigures(tx, month, today, await loadLegalRows(tx));
    const row = figures.rows.find((r) => r.staffMemberId === staffMemberId);
    if (!row) throw new PayrollInputError("invalid_person");
    if (!row.minijob || row.minijob.status.earnedCents <= row.minijob.params.limitCents)
      throw new PayrollInputError("no_overrun");
    const [existing] = await tx
      .select({ id: overrunJustification.id, reason: overrunJustification.reason })
      .from(overrunJustification)
      .where(
        and(
          eq(overrunJustification.staffMemberId, staffMemberId),
          eq(overrunJustification.month, month),
        ),
      );
    if (existing) {
      await tx
        .update(overrunJustification)
        .set({ reason: text, recordedById: actor.staffMemberId })
        .where(eq(overrunJustification.id, existing.id));
    } else {
      await tx.insert(overrunJustification).values({
        staffMemberId,
        month,
        reason: text,
        recordedById: actor.staffMemberId,
      });
    }
    await audit(tx, actor.id, [
      {
        action: "payroll.justify",
        entityType: "staff_member",
        entityId: staffMemberId,
        diff: {
          month,
          reason: text,
          ...(existing ? { previous: existing.reason } : {}),
          earnedCents: row.minijob.status.earnedCents,
        },
      },
    ]);
    return { created: !existing };
  });
}
