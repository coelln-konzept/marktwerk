"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  changeEventStatus,
  EventLifecycleInputError,
  revertEventStatus,
  updateEventNotes,
} from "@/server/services/event-lifecycle";
import { requirePermission } from "@/server/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; from?: string };

/** "Status ändern": validated transition, cancelling needs a reason. */
export async function changeStatus(
  eventId: string,
  to: string,
  reason?: string,
): Promise<ActionResult<{ from: string; to: string; previousReason: string | null }>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  try {
    const data = await changeEventStatus(actor, eventId, to, reason);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof EventLifecycleInputError) {
      // The page may show an outdated status; make it current again.
      if (error.code === "invalid_transition" || error.code === "conflict") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** Undo toast: back to the previous status. */
export async function undoStatus(
  eventId: string,
  expected: string,
  previous: string,
  previousReason: string | null,
): Promise<ActionResult<{ to: string }>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  try {
    const data = await revertEventStatus(actor, eventId, expected, previous, previousReason);
    refresh();
    return { ok: true, data: { to: data.to } };
  } catch (error) {
    if (error instanceof EventLifecycleInputError) {
      refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function saveNotes(
  eventId: string,
  notes: string,
): Promise<ActionResult<{ changed: boolean }>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  try {
    const data = await updateEventNotes(actor, eventId, notes);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof EventLifecycleInputError) return { ok: false, error: error.code };
    throw error;
  }
}
