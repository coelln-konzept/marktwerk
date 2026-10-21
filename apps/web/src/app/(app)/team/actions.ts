"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import { type ContractInput, ContractInputError, saveContract } from "@/server/services/contracts";
import {
  approvePeriod,
  exportPeriod,
  lockPeriod,
  PayrollInputError,
  saveOverrunJustification,
  unlockPeriod,
} from "@/server/services/payroll";
import {
  createShift,
  listShiftRevisions,
  recordShiftTimes,
  type ShiftInput,
  ShiftInputError,
  updateShift,
} from "@/server/services/shifts";
import { requirePermission } from "@/server/session";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; detail?: string; blockers?: string[] };

/** Every action here needs `team:manage`; typed input errors become result codes, the page refreshes. */
async function run<T>(fn: () => Promise<T>, refreshOnError = false): Promise<ActionResult<T>> {
  await requirePermission("team", "manage");
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ContractInputError) {
      return { ok: false, error: error.code, detail: error.detail };
    }
    if (error instanceof ShiftInputError) {
      if (error.code === "conflict" || error.code === "period_locked") refresh();
      return { ok: false, error: error.code };
    }
    if (error instanceof PayrollInputError) {
      if (refreshOnError || error.code === "invalid_status") refresh();
      return { ok: false, error: error.code, blockers: error.blockers.map((b) => b.code) };
    }
    throw error;
  }
}

/** Contract of a person: create (no `contractId`) or edit. */
export async function saveContractAction(
  staffMemberId: string,
  input: ContractInput,
  contractId?: string,
  endPrevious?: boolean,
) {
  return run(async () => {
    const actor = await getActor();
    return saveContract(actor, staffMemberId, input, contractId, { endPrevious });
  });
}

/** A new shift record (with or without event). */
export async function createShiftAction(input: ShiftInput) {
  return run(async () => {
    const actor = await getActor();
    return createShift(actor, input);
  });
}

/** Change of an existing shift; the reason is kept in the revision. */
export async function updateShiftAction(
  shiftId: string,
  patch: Partial<ShiftInput>,
  reason: string,
  expectedVersion: number,
) {
  return run(async () => {
    const actor = await getActor();
    return updateShift(actor, shiftId, patch, reason, expectedVersion);
  });
}

/** Enter the actual times (first time without reason, later with one). */
export async function recordTimesAction(
  shiftId: string,
  times: { actualStart: string; actualEnd: string; breakMinutes: number },
  expectedVersion: number,
  reason?: string,
) {
  return run(async () => {
    const actor = await getActor();
    return recordShiftTimes(actor, shiftId, times, expectedVersion, reason);
  });
}

/** Revisions of one shift (read only, no refresh). */
export async function shiftHistoryAction(shiftId: string) {
  await requirePermission("team", "read");
  if (!/^[0-9a-f-]{36}$/i.test(shiftId)) return [];
  const rows = await listShiftRevisions(shiftId);
  return rows.map((r) => ({
    version: r.version,
    reason: r.reason,
    changedAt: r.changedAt.toISOString(),
    changedBy: r.changedBy,
    before: r.before,
  }));
}

export async function saveJustificationAction(
  staffMemberId: string,
  month: string,
  reason: string,
) {
  return run(async () => {
    const actor = await getActor();
    return saveOverrunJustification(actor, staffMemberId, month, reason);
  });
}

export async function lockPeriodAction(month: string) {
  return run(async () => {
    const actor = await getActor();
    return lockPeriod(actor, month);
  }, true);
}

export async function approvePeriodAction(month: string) {
  return run(async () => {
    const actor = await getActor();
    return approvePeriod(actor, month);
  });
}

export async function unlockPeriodAction(month: string, reason: string) {
  return run(async () => {
    const actor = await getActor();
    return unlockPeriod(actor, month, reason);
  });
}

/** The CSV as text (with BOM); the browser saves it as a file. */
export async function exportPeriodAction(month: string) {
  return run(async () => {
    const actor = await getActor();
    return exportPeriod(actor, month);
  });
}
