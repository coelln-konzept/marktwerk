"use server";

import { refresh } from "next/cache";
import { type Actor, getActor } from "@/server/actor";
import {
  type EventBasics,
  EventDetailsInputError,
  type EventFacts,
  type EventSchedulePreview,
  moveEvent,
  previewEventMove,
  previewEventSchedule,
  setEventBookingFlag,
  updateEventBasics,
  updateEventFacts,
} from "@/server/services/event-details";
import { EventDutyInputError, setEventDuty } from "@/server/services/event-duties";
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

/** Team tab: who fills a duty role at this event (null = nobody). Only this event changes. */
export async function assignDuty(
  eventId: string,
  dutyRoleId: string,
  staffMemberId: string | null,
): Promise<ActionResult<{ changed: boolean; from: string | null; to: string | null }>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  try {
    const data = await setEventDuty(actor, eventId, dutyRoleId, staffMemberId);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof EventDutyInputError) {
      refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** Undo toast of assignDuty: back to `previous` while the role still has `expected`. */
export async function undoDuty(
  eventId: string,
  dutyRoleId: string,
  expected: string | null,
  previous: string | null,
): Promise<ActionResult<{ changed: boolean }>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  try {
    const data = await setEventDuty(actor, eventId, dutyRoleId, previous, expected);
    refresh();
    return { ok: true, data: { changed: data.changed } };
  } catch (error) {
    if (error instanceof EventDutyInputError) {
      refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** Runs an event-details mutation; input errors become a result code, the page is refreshed. */
async function detailsAction<T>(
  run: (actor: Actor) => Promise<T>,
  refreshAfter = true,
): Promise<ActionResult<T>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  try {
    const data = await run(actor);
    if (refreshAfter) refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof EventDetailsInputError) {
      if (error.code === "conflict" || error.code === "not_movable") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** "Eckdaten bearbeiten": times and prices of this event. */
export async function saveFacts(eventId: string, facts: EventFacts) {
  return detailsAction((actor) => updateEventFacts(actor, eventId, facts));
}

/** Undo toast of saveFacts. */
export async function undoFacts(eventId: string, previous: EventFacts, saved: EventFacts) {
  return detailsAction((actor) => updateEventFacts(actor, eventId, previous, saved));
}

/** "Buchung": one booking flag on or off. */
export async function setBookingFlag(eventId: string, flag: string, value: boolean) {
  return detailsAction((actor) => setEventBookingFlag(actor, eventId, flag, value));
}

/** "Verschieben": the preview for a picked date (read only). */
export async function previewMove(
  eventId: string,
  startsOn: string,
): Promise<ActionResult<EventSchedulePreview>> {
  return detailsAction((actor) => previewEventMove(actor, eventId, startsOn), false);
}

/** "Verschieben": moves the event; `expectedStartsOn` is the date the dialog was opened with. */
export async function moveToDate(eventId: string, startsOn: string, expectedStartsOn: string) {
  return detailsAction((actor) => moveEvent(actor, eventId, startsOn, expectedStartsOn));
}

/** Undo toast of moveToDate. */
export async function undoMove(eventId: string, movedTo: string, back: string) {
  return detailsAction((actor) => moveEvent(actor, eventId, back, movedTo, { undo: true }));
}

/** "Name, Dauer, Ort": warnings for a new length or venue (read only). */
export async function previewBasics(
  eventId: string,
  change: { durationDays: number; venueId: string },
): Promise<ActionResult<EventSchedulePreview>> {
  return detailsAction((actor) => previewEventSchedule(actor, eventId, change), false);
}

/** "Name, Dauer, Ort": saves after the confirmation. */
export async function saveBasics(eventId: string, basics: EventBasics) {
  return detailsAction((actor) => updateEventBasics(actor, eventId, basics));
}

/** Undo toast of saveBasics. */
export async function undoBasics(eventId: string, previous: EventBasics, saved: EventBasics) {
  return detailsAction((actor) => updateEventBasics(actor, eventId, previous, saved));
}
