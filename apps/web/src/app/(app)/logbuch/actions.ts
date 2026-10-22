"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  archivePermit,
  createPermit,
  linkEventsToPermit,
  type NewPermitInput,
  PermitInputError,
  type PermitPatch,
  type PermitStatusState,
  restorePermit,
  restorePermitStatus,
  setEventPermitRequired,
  setPermitStatus,
  unlinkEventFromPermit,
  updatePermit,
} from "@/server/services/permits";
import { requirePermission } from "@/server/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Typed input errors become codes the drawer shows; the page is refreshed so it never shows stale data. */
async function guarded<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await run();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof PermitInputError) {
      if (error.code === "conflict" || error.code === "not_found") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** "Genehmigung anlegen". */
export async function createPermitAction(input: NewPermitInput) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => createPermit(actor, input));
}

/** Drawer: fields of a permit; `undo` is set by the undo toast. */
export async function savePermitAction(id: string, patch: PermitPatch, undo = false) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => updatePermit(actor, id, patch, { undo }));
}

/** Drawer: next step of the status flow. */
export async function changePermitStatus(id: string, to: string) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => setPermitStatus(actor, id, to));
}

/** Undo toast of changePermitStatus. */
export async function undoPermitStatus(
  id: string,
  expected: PermitStatusState["status"],
  previous: PermitStatusState,
  closedTaskIds: string[],
) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => restorePermitStatus(actor, id, expected, previous, closedTaskIds));
}

export async function linkEventsAction(permitId: string, eventIds: string[]) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => linkEventsToPermit(actor, permitId, eventIds));
}

export async function unlinkEventAction(permitId: string, eventId: string) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => unlinkEventFromPermit(actor, permitId, eventId));
}

export async function setEventRequiredAction(permitId: string, eventId: string, required: boolean) {
  await requirePermission("permit", "write");
  const actor = await getActor();
  return guarded(() => setEventPermitRequired(actor, permitId, eventId, required));
}

/** Removes a permit from the logbook (undo toast restores it). */
export async function archivePermitAction(id: string) {
  await requirePermission("permit", "delete");
  const actor = await getActor();
  return guarded(() => archivePermit(actor, id));
}

export async function restorePermitAction(id: string) {
  await requirePermission("permit", "delete");
  const actor = await getActor();
  return guarded(() => restorePermit(actor, id));
}
