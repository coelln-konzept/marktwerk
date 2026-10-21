"use server";

import { refresh } from "next/cache";
import { type Actor, getActor } from "@/server/actor";
import {
  archiveVenue,
  createRow,
  createVenue,
  createZone,
  deleteRow,
  deleteZone,
  moveZone,
  type RowInput,
  renameZone,
  restoreRow,
  restoreVenue,
  restoreZone,
  updateRow,
  updateVenue,
  type VenueInput,
  VenueInputError,
} from "@/server/services/venues";
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
    if (error instanceof VenueInputError) {
      // The page may show something that is gone or changed; make it current again.
      if (error.code === "not_found" || error.code === "conflict") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

// Venue ---------------------------------------------------------------------------------------

/** "Neuer Ort": the form navigates to the new venue afterwards, so no refresh here. */
export async function createVenueAction(input: VenueInput) {
  await requirePermission("venue", "write");
  return run((actor) => createVenue(actor, input), { refreshPage: false });
}

export async function updateVenueAction(id: string, input: VenueInput) {
  await requirePermission("venue", "write");
  return run((actor) => updateVenue(actor, id, input));
}

/** "Archivieren": the detail page is gone afterwards and the caller navigates to the list. */
export async function archiveVenueAction(id: string) {
  await requirePermission("venue", "delete");
  return run((actor) => archiveVenue(actor, id), { refreshPage: false });
}

/** Undo toast of "Archivieren". */
export async function restoreVenueAction(id: string) {
  await requirePermission("venue", "delete");
  return run((actor) => restoreVenue(actor, id));
}

// Zones ---------------------------------------------------------------------------------------

export async function addZoneAction(venueId: string, name: string) {
  await requirePermission("venue", "write");
  return run((actor) => createZone(actor, venueId, name));
}

export async function renameZoneAction(zoneId: string, name: string) {
  await requirePermission("venue", "write");
  return run((actor) => renameZone(actor, zoneId, name));
}

export async function moveZoneAction(zoneId: string, direction: "up" | "down") {
  await requirePermission("venue", "write");
  return run((actor) => moveZone(actor, zoneId, direction));
}

export async function deleteZoneAction(zoneId: string) {
  await requirePermission("venue", "write");
  return run((actor) => deleteZone(actor, zoneId));
}

/** Undo toast of "Zone löschen". */
export async function restoreZoneAction(zoneId: string) {
  await requirePermission("venue", "write");
  return run((actor) => restoreZone(actor, zoneId));
}

// Rows ----------------------------------------------------------------------------------------

export async function addRowAction(zoneId: string, input: RowInput) {
  await requirePermission("venue", "write");
  return run((actor) => createRow(actor, zoneId, input));
}

export async function updateRowAction(rowId: string, input: RowInput) {
  await requirePermission("venue", "write");
  return run((actor) => updateRow(actor, rowId, input));
}

export async function deleteRowAction(rowId: string) {
  await requirePermission("venue", "write");
  return run((actor) => deleteRow(actor, rowId));
}

/** Undo toast of "Reihe löschen". */
export async function restoreRowAction(rowId: string) {
  await requirePermission("venue", "write");
  return run((actor) => restoreRow(actor, rowId));
}
