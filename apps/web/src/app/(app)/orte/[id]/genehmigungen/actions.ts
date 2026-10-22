"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  applyRequirementsToUpcomingEvents,
  archiveRequirement,
  createRequirement,
  type RequirementInput,
  restoreRequirement,
  updateRequirement,
} from "@/server/services/permit-requirements";
import { PermitInputError } from "@/server/services/permits";
import { requirePermission } from "@/server/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function guarded<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await run();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof PermitInputError) return { ok: false, error: error.code };
    throw error;
  }
}

export async function createRequirementAction(venueId: string, input: RequirementInput) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => createRequirement(actor, venueId, input));
}

/** `undo` is set by the undo toast, which writes the previous values back. */
export async function updateRequirementAction(id: string, input: RequirementInput, undo = false) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => updateRequirement(actor, id, input, { undo }));
}

export async function archiveRequirementAction(id: string) {
  await requirePermission("permit", "delete");
  const actor = await getActor();
  return guarded(() => archiveRequirement(actor, id));
}

export async function restoreRequirementAction(id: string) {
  await requirePermission("permit", "delete");
  const actor = await getActor();
  return guarded(() => restoreRequirement(actor, id));
}

/** Runs the logbook fill for the venue's upcoming events. */
export async function applyRequirementsAction(venueId: string) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => applyRequirementsToUpcomingEvents(actor, venueId));
}
