"use server";

import { refresh } from "next/cache";
import { type Actor, getActor } from "@/server/actor";
import {
  archiveObligation,
  archiveVehicle,
  CompanyInputError,
  type CompletionInput,
  type CompletionResult,
  completeObligation,
  createObligation,
  createVehicle,
  type IssueInput,
  type ObligationInput,
  type ObligationSchedule,
  type OdometerSnapshot,
  recordOdometer,
  reportVehicleIssue,
  restoreObligation,
  restoreVehicle,
  setVehicleIssueStatus,
  undoObligationCompletion,
  undoOdometer,
  updateObligation,
  updateVehicle,
  type VehicleInput,
} from "@/server/services/company";
import { requirePermission } from "@/server/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a service call; input errors become `{ ok: false, error: code }`, anything else is thrown. */
async function run<T>(
  call: (actor: Actor) => Promise<T>,
  { refreshPage = true }: { refreshPage?: boolean } = {},
): Promise<ActionResult<T>> {
  const actor = await getActor();
  try {
    const data = await call(actor);
    if (refreshPage) refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof CompanyInputError) {
      // The page may show something that is gone or changed; make it current again.
      if (error.code === "not_found" || error.code === "conflict") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

// Vehicles ------------------------------------------------------------------------------------

/** "Fahrzeug anlegen": the form navigates to the new vehicle afterwards, so no refresh here. */
export async function createVehicleAction(input: VehicleInput) {
  await requirePermission("company", "write");
  return run((actor) => createVehicle(actor, input), { refreshPage: false });
}

export async function updateVehicleAction(id: string, input: VehicleInput) {
  await requirePermission("company", "write");
  return run((actor) => updateVehicle(actor, id, input));
}

/** The detail page is gone afterwards and the caller navigates to the list. */
export async function archiveVehicleAction(id: string) {
  await requirePermission("company", "write");
  return run((actor) => archiveVehicle(actor, id), { refreshPage: false });
}

/** Undo toast of "Archivieren". */
export async function restoreVehicleAction(id: string) {
  await requirePermission("company", "write");
  return run((actor) => restoreVehicle(actor, id));
}

export async function recordOdometerAction(vehicleId: string, km: number, on: string | null) {
  await requirePermission("company", "write");
  return run((actor) => recordOdometer(actor, vehicleId, km, on));
}

/** Undo toast of "Kilometerstand eintragen". */
export async function undoOdometerAction(
  vehicleId: string,
  previous: OdometerSnapshot,
  next: OdometerSnapshot,
) {
  await requirePermission("company", "write");
  return run((actor) => undoOdometer(actor, vehicleId, previous, next));
}

// Obligations ---------------------------------------------------------------------------------

/** "Pflicht anlegen": the form navigates to the new obligation afterwards. */
export async function createObligationAction(input: ObligationInput) {
  await requirePermission("company", "write");
  return run((actor) => createObligation(actor, input), { refreshPage: false });
}

export async function updateObligationAction(id: string, input: ObligationInput) {
  await requirePermission("company", "write");
  return run((actor) => updateObligation(actor, id, input));
}

export async function archiveObligationAction(id: string) {
  await requirePermission("company", "write");
  return run((actor) => archiveObligation(actor, id), { refreshPage: false });
}

/** Undo toast of "Archivieren". */
export async function restoreObligationAction(id: string) {
  await requirePermission("company", "write");
  return run((actor) => restoreObligation(actor, id));
}

export async function completeObligationAction(id: string, input: CompletionInput) {
  await requirePermission("company", "write");
  return run((actor) => completeObligation(actor, id, input));
}

/** Undo toast of "Erledigt". */
export async function undoCompletionAction(
  completionId: string,
  previous: ObligationSchedule,
  odometer: CompletionResult["odometer"],
) {
  await requirePermission("company", "write");
  return run((actor) => undoObligationCompletion(actor, completionId, previous, odometer));
}

// Issues --------------------------------------------------------------------------------------

export async function reportIssueAction(input: IssueInput) {
  await requirePermission("company", "write");
  return run((actor) => reportVehicleIssue(actor, input));
}

/** `expected` makes it the undo of a status change: it applies only while the issue still has that status. */
export async function setIssueStatusAction(
  issueId: string,
  status: string,
  options: { resolutionNote?: string | null; expected?: "open" | "in_progress" | "resolved" } = {},
) {
  await requirePermission("company", "write");
  return run((actor) => setVehicleIssueStatus(actor, issueId, status, options));
}
