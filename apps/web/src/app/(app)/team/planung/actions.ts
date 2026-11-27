"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  applyPresetStaffing,
  assignToNeed,
  clearUnavailability,
  PlanningInputError,
  setDefaultHourBudget,
  setShiftStatus,
  setUnavailability,
  updateNeed,
} from "@/server/services/shift-planning";
import { ShiftInputError } from "@/server/services/shifts";
import { requirePermission } from "@/server/session";
import type { ActionResult } from "../actions";

async function run<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T> | { ok: false; error: "needs_confirmation"; flags: string[] }> {
  await requirePermission("team", "manage");
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof PlanningInputError)
      return error.code === "needs_confirmation"
        ? { ok: false, error: "needs_confirmation", flags: error.flags }
        : { ok: false, error: error.code };
    if (error instanceof ShiftInputError) {
      if (error.code === "conflict" || error.code === "period_locked") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function assignToNeedAction(needId: string, staffMemberId: string, confirm = false) {
  return run(async () => assignToNeed(await getActor(), needId, staffMemberId, { confirm }));
}
export async function setShiftStatusAction(
  shiftId: string,
  status: "requested" | "confirmed" | "declined" | "cancelled",
  version: number,
) {
  return run(async () => setShiftStatus(await getActor(), shiftId, status, version));
}
export async function updateNeedAction(
  needId: string,
  patch: { headcount?: number; plannedStart?: string | null; plannedEnd?: string | null },
) {
  return run(async () => updateNeed(await getActor(), needId, patch));
}
export async function setUnavailabilityAction(
  staffMemberId: string,
  from: string,
  to: string,
  note: string | null,
) {
  return run(async () => setUnavailability(await getActor(), staffMemberId, from, to, note));
}
export async function clearUnavailabilityAction(staffMemberId: string, dates: string[]) {
  return run(async () => clearUnavailability(await getActor(), staffMemberId, dates));
}
export async function applyPresetStaffingAction(eventId: string) {
  return run(async () => applyPresetStaffing(await getActor(), eventId));
}
export async function setDefaultHourBudgetAction(hours: number) {
  await requirePermission("settings", "manage");
  return run(async () => setDefaultHourBudget(await getActor(), hours));
}
