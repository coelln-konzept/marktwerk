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
import { auditLog, event, eventDuty, eventPermit, permit, task } from "@marktwerk/db/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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

/** Tasks that are still to be done (the statuses before done / skipped / cancelled). */
const OPEN_TASK = ["todo", "in_progress", "waiting_external", "blocked"] as const;
type OpenTaskStatus = (typeof OPEN_TASK)[number];
const isOpenTaskStatus = (v: unknown): v is OpenTaskStatus =>
  typeof v === "string" && (OPEN_TASK as readonly string[]).includes(v);

type CancelledTask = { id: string; from: OpenTaskStatus };

/**
 * THE one place that cancels the tasks of a cancelled event (product owner 2026-11-04): every open task of
 * the event becomes "cancelled" so it disappears from all lists; done / skipped / cancelled ones stay as
 * history. Returns `{id, from}` for the audit diff so the same tasks can be reopened later.
 * Call inside the transaction of every change that sets an event to "cancelled".
 */
async function cancelOpenTasksOfEvent(tx: Tx, eventId: string): Promise<CancelledTask[]> {
  const open = await tx
    .select({ id: task.id, from: task.status })
    .from(task)
    .where(and(eq(task.eventId, eventId), inArray(task.status, [...OPEN_TASK])))
    .orderBy(task.id)
    .for("update");
  if (open.length === 0) return [];
  await tx
    .update(task)
    .set({ status: "cancelled" })
    .where(
      inArray(
        task.id,
        open.map((o) => o.id),
      ),
    );
  return open.filter((o): o is CancelledTask => isOpenTaskStatus(o.from));
}

/**
 * Reopens the tasks recorded by the most recent cancellation of the event: the latest "event.status" audit
 * entry that carries `cancelledTasks` (a normal cancellation, an undo back to "abgesagt" or the migration
 * backfill) unless a newer entry already reopened them (`reopenedTaskIds`). Each task goes back to its
 * recorded status, but only while it is still "cancelled" (someone may have changed it since).
 */
async function reopenTasksOfEvent(tx: Tx, eventId: string): Promise<string[]> {
  const [last] = await tx
    .select({ diff: auditLog.diff })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "event.status"),
        eq(auditLog.entityId, eventId),
        sql`(${auditLog.diff} ? 'cancelledTasks' or ${auditLog.diff} ? 'reopenedTaskIds')`,
      ),
    )
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(1);
  const recorded = (last?.diff as { cancelledTasks?: unknown } | null)?.cancelledTasks;
  if (!Array.isArray(recorded)) return [];
  const reopened: string[] = [];
  for (const entry of recorded as { id?: unknown; from?: unknown }[]) {
    if (typeof entry?.id !== "string" || !isOpenTaskStatus(entry.from)) continue;
    const rows = await tx
      .update(task)
      .set({ status: entry.from })
      .where(and(eq(task.id, entry.id), eq(task.eventId, eventId), eq(task.status, "cancelled")))
      .returning({ id: task.id });
    reopened.push(...rows.map((r) => r.id));
  }
  return reopened;
}

/** The task side of a status change: cancel when entering "abgesagt", reopen when leaving it. */
async function cascadeToTasks(tx: Tx, eventId: string, from: EventStatus, to: EventStatus) {
  if (to === "cancelled" && from !== "cancelled")
    return { cancelledTasks: await cancelOpenTasksOfEvent(tx, eventId) };
  if (from === "cancelled" && to !== "cancelled")
    return { reopenedTaskIds: await reopenTasksOfEvent(tx, eventId) };
  return {};
}

/**
 * Moves an event through its lifecycle (packages/core events/lifecycle). Cancelling needs a reason.
 * Writes audit "event.status" with {from, to, reason?}. Cancelling also cancels the event's open tasks
 * (`cancelledTasks: [{id, from}]` in the diff); leaving "abgesagt" reopens them (`reopenedTaskIds`).
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
    const cascade = await cascadeToTasks(tx, id, current.status, to);
    await audit(tx, actor.id, [
      {
        action: "event.status",
        entityType: "event",
        entityId: id,
        diff: {
          from: current.status,
          to,
          ...(requiresReason(to) ? { reason: trimmed } : {}),
          ...cascade,
        },
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
    const cascade = await cascadeToTasks(tx, id, expected, previous);
    await audit(tx, actor.id, [
      {
        action: "event.status",
        entityType: "event",
        entityId: id,
        diff: { from: expected, to: previous, undo: true, ...cascade },
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
