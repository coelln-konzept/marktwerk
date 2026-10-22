import "server-only";
import { can, shouldAutoConfirm } from "@marktwerk/core";
import {
  allowedTransitions,
  canTransition,
  type EventStatus,
  isEventStatus,
  requiresReason,
} from "@marktwerk/core/events/lifecycle";
import { insertNotifications } from "@marktwerk/db";
import { event, eventDuty, eventPermit, permit } from "@marktwerk/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "@/lib/format";
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

/** The reason written to the audit entry and the notification of an automatic confirmation. */
export const AUTO_CONFIRM_REASON = "alle Genehmigungen erteilt";

export type AutoConfirmSource =
  | "permit_status"
  | "permit_link"
  | "permit_required"
  | "logbook_fill";

/**
 * THE one place that confirms events automatically (client decision 2026-10-22): planned events whose
 * required permits are all granted move to "bestätigt" (rule: `shouldAutoConfirm` in packages/core).
 * Called inside the transaction of every change that can complete an event's permits: a permit set to
 * granted, an event linked to a permit or marked "not needed" for a permit, and the logbook fill on
 * creation. The transition respects the lifecycle table like a manual one, is audited as
 * "event.status" with `auto: true` (actor = the user whose change triggered it) and notifies the
 * event's team in-app. Never moves an event back.
 *
 * `source` is written to the audit diff; the generation undo accepts only "logbook_fill".
 */
export async function autoConfirmEvents(
  tx: Tx,
  actor: Pick<Actor, "id" | "staffMemberId">,
  eventIds: readonly string[],
  source: AutoConfirmSource,
): Promise<string[]> {
  const ids = [...new Set(eventIds)];
  if (ids.length === 0) return [];
  const planned = await tx
    .select({ id: event.id, name: event.name, startsOn: event.startsOn, status: event.status })
    .from(event)
    .where(and(inArray(event.id, ids), eq(event.status, "planned"), isNull(event.archivedAt)))
    .orderBy(event.startsOn, event.id)
    .for("update");
  if (planned.length === 0) return [];
  const rows = await tx
    .select({
      eventId: eventPermit.eventId,
      required: eventPermit.required,
      status: permit.status,
      applyBy: permit.applyBy,
      validUntil: permit.validUntil,
    })
    .from(eventPermit)
    .innerJoin(permit, eq(permit.id, eventPermit.permitId))
    .where(
      and(
        inArray(
          eventPermit.eventId,
          planned.map((e) => e.id),
        ),
        isNull(permit.archivedAt),
      ),
    );
  const today = todayIn();
  const confirmed = planned.filter(
    (e) =>
      canTransition(e.status, "confirmed") &&
      shouldAutoConfirm(
        e,
        rows.filter((r) => r.eventId === e.id),
        today,
      ),
  );
  if (confirmed.length === 0) return [];
  const confirmedIds = confirmed.map((e) => e.id);
  await tx.update(event).set({ status: "confirmed" }).where(inArray(event.id, confirmedIds));
  await audit(
    tx,
    actor.id,
    confirmed.map((e) => ({
      action: "event.status",
      entityType: "event",
      entityId: e.id,
      diff: { from: "planned", to: "confirmed", auto: true, reason: AUTO_CONFIRM_REASON, source },
    })),
  );
  // In-app only (the e-mail master switch decides about mail separately). The event's team is told,
  // except the person who is creating events right now (they see the result on screen).
  const team = await tx
    .select({ eventId: eventDuty.eventId, staffMemberId: eventDuty.staffMemberId })
    .from(eventDuty)
    .where(inArray(eventDuty.eventId, confirmedIds));
  const stamp = Date.now();
  await insertNotifications(
    tx,
    confirmed.flatMap((e) => {
      const people = new Set(team.filter((t) => t.eventId === e.id).map((t) => t.staffMemberId));
      if (source === "logbook_fill" && actor.staffMemberId) people.delete(actor.staffMemberId);
      return [...people].map((recipientStaffMemberId) => ({
        recipientStaffMemberId,
        reason: "event_confirmed" as const,
        subjectType: "event",
        subjectId: e.id,
        // Notification text is data in German, like the other server-written titles.
        title: `${e.name} bestätigt`,
        body: `Automatisch bestätigt: ${AUTO_CONFIRM_REASON}.`,
        link: `/veranstaltungen/${e.id}/genehmigungen`,
        dedupeKey: `event_confirmed:${e.id}:${stamp}`,
      }));
    }),
  );
  return confirmedIds;
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
