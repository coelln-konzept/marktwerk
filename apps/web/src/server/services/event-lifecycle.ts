import "server-only";
import { can } from "@marktwerk/core";
import {
  allowedTransitions,
  type EventStatus,
  isEventStatus,
  requiresReason,
} from "@marktwerk/core/events/lifecycle";
import { event } from "@marktwerk/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

export type EventLifecycleError =
  | "not_found"
  | "invalid_status"
  | "invalid_transition"
  | "reason_required"
  | "conflict"
  | "notes_too_long";

export class EventLifecycleInputError extends Error {
  constructor(readonly code: EventLifecycleError) {
    super(code);
  }
}

export const MAX_NOTES_LENGTH = 20_000;
export const MAX_REASON_LENGTH = 500;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockEvent(tx: Tx, id: string) {
  const [row] = await tx
    .select({
      id: event.id,
      status: event.status,
      notes: event.notes,
      cancelledReason: event.cancelledReason,
    })
    .from(event)
    .where(and(eq(event.id, id), isNull(event.archivedAt)))
    .for("update");
  if (!row) throw new EventLifecycleInputError("not_found");
  return row;
}

/**
 * Moves an event through its lifecycle (packages/core events/lifecycle). Cancelling needs a reason.
 * Writes audit "event.status" with {from, to, reason?}.
 */
export async function changeEventStatus(
  actor: Actor,
  id: string,
  to: string,
  reason?: string | null,
): Promise<{ from: EventStatus; to: EventStatus; previousReason: string | null }> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!isEventStatus(to)) throw new EventLifecycleInputError("invalid_status");
  const trimmed = reason?.trim().slice(0, MAX_REASON_LENGTH) || null;
  if (requiresReason(to) && !trimmed) throw new EventLifecycleInputError("reason_required");

  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    if (!allowedTransitions(current.status).includes(to))
      throw new EventLifecycleInputError("invalid_transition");
    await tx
      .update(event)
      .set({ status: to, cancelledReason: requiresReason(to) ? trimmed : null })
      .where(eq(event.id, id));
    await audit(tx, actor.id, [
      {
        action: "event.status",
        entityType: "event",
        entityId: id,
        diff: { from: current.status, to, ...(requiresReason(to) ? { reason: trimmed } : {}) },
      },
    ]);
    return { from: current.status, to, previousReason: current.cancelledReason };
  });
}

/**
 * Undo of a status change (toast "Rückgängig"): sets the event back to `previous`, but only while it
 * still has the status the change produced (`expected`), so nobody else's newer change is overwritten.
 * Not limited to the forward table (e.g. "läuft" → "bestätigt"); audited as event.status with undo.
 */
export async function revertEventStatus(
  actor: Actor,
  id: string,
  expected: string,
  previous: string,
  previousReason?: string | null,
) {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!isEventStatus(expected) || !isEventStatus(previous))
    throw new EventLifecycleInputError("invalid_status");
  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    if (current.status !== expected) throw new EventLifecycleInputError("conflict");
    const reason = previous === "cancelled" ? previousReason?.trim() || null : null;
    await tx
      .update(event)
      .set({ status: previous, cancelledReason: reason })
      .where(eq(event.id, id));
    await audit(tx, actor.id, [
      {
        action: "event.status",
        entityType: "event",
        entityId: id,
        diff: { from: expected, to: previous, undo: true },
      },
    ]);
    return { from: expected, to: previous };
  });
}

/** Free-text notes of an event. The audit entry records that they changed, not the text itself. */
export async function updateEventNotes(actor: Actor, id: string, notes: string) {
  if (!can(actor.role, "event", "write")) forbidden();
  const text = notes.replace(/\r\n/g, "\n").trim();
  if (text.length > MAX_NOTES_LENGTH) throw new EventLifecycleInputError("notes_too_long");
  return db.transaction(async (tx) => {
    const current = await lockEvent(tx, id);
    const next = text === "" ? null : text;
    if ((current.notes ?? null) === next) return { changed: false };
    await tx.update(event).set({ notes: next }).where(eq(event.id, id));
    await audit(tx, actor.id, [
      {
        action: "event.update_notes",
        entityType: "event",
        entityId: id,
        diff: { from: current.notes?.length ?? 0, to: text.length, unit: "chars" },
      },
    ]);
    return { changed: true };
  });
}
