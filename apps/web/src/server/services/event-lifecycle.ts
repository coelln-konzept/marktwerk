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
import {
  auditLog,
  checklist,
  document,
  event,
  eventAnchor,
  eventBudgetLine,
  eventDuty,
  eventIncome,
  eventPermit,
  expense,
  payable,
  permit,
  shift,
  task,
} from "@marktwerk/db/schema";
import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "@/lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { syncSeasonsTx } from "./seasons";

export type EventLifecycleError =
  | "not_found"
  | "invalid_status"
  | "invalid_transition"
  | "reason_required"
  | "conflict"
  | "notes_too_long"
  | "name_mismatch"
  | "blocked";

export class EventLifecycleInputError extends Error {
  constructor(
    readonly code: EventLifecycleError,
    /** `blocked`: the {@link EventDeleteBlockers} that stop the deletion. */
    readonly detail?: EventDeleteBlockers,
  ) {
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
      presetId: event.presetId,
      season: event.season,
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

/**
 * The task side of a status change: cancel when entering "abgesagt", reopen when leaving it. Either way the
 * event's Saison record recomputes its dates (a cancelled date does not count, R10) and its open season tasks
 * follow.
 */
async function cascadeToTasks(
  tx: Tx,
  actor: Actor,
  current: { id: string; presetId: string | null; season: number },
  from: EventStatus,
  to: EventStatus,
) {
  const cancelling = to === "cancelled" && from !== "cancelled";
  const reopening = from === "cancelled" && to !== "cancelled";
  if (!cancelling && !reopening) return {};
  const cascade = cancelling
    ? { cancelledTasks: await cancelOpenTasksOfEvent(tx, current.id) }
    : { reopenedTaskIds: await reopenTasksOfEvent(tx, current.id) };
  await syncSeasonsTx(tx, actor, [current], "event_status");
  return cascade;
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
    const cascade = await cascadeToTasks(tx, actor, current, current.status, to);
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
    const cascade = await cascadeToTasks(tx, actor, current, expected, previous);
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

/** What keeps an event from being deleted: rows whose foreign key to the event (or to one of its tasks) restricts. */
export type EventDeleteBlockers = {
  payables: number;
  expenses: number;
  shifts: number;
  documents: number;
};

export const hasDeleteBlockers = (b: EventDeleteBlockers) =>
  b.payables + b.expenses + b.shifts + b.documents > 0;

/**
 * Counts the blockers (archived rows included: they still hold the foreign key). Documents count when
 * attached to the event or to one of its tasks (`document.task_id` restricts the task cascade).
 */
export async function countEventDeleteBlockers(
  tx: Pick<typeof db, "select">,
  eventId: string,
): Promise<EventDeleteBlockers> {
  const one = async (q: PromiseLike<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [payables, expenses, shifts, documents] = await Promise.all([
    one(tx.select({ n: count() }).from(payable).where(eq(payable.eventId, eventId))),
    one(tx.select({ n: count() }).from(expense).where(eq(expense.eventId, eventId))),
    one(tx.select({ n: count() }).from(shift).where(eq(shift.eventId, eventId))),
    one(
      tx
        .select({ n: count() })
        .from(document)
        .where(
          or(
            eq(document.eventId, eventId),
            inArray(
              document.taskId,
              tx.select({ id: task.id }).from(task).where(eq(task.eventId, eventId)),
            ),
          ),
        ),
    ),
  ]);
  return { payables, expenses, shifts, documents };
}

/** For the delete dialog: the event's name and what blocks deleting it. */
export async function getEventDeleteInfo(
  actor: Actor,
  id: string,
): Promise<{ name: string; blockers: EventDeleteBlockers }> {
  if (!can(actor.role, "event", "delete")) forbidden();
  const [row] = await db.select({ name: event.name }).from(event).where(eq(event.id, id));
  if (!row) throw new EventLifecycleInputError("not_found");
  return { name: row.name, blockers: await countEventDeleteBlockers(db, id) };
}

/**
 * Deletes an event for good (product owner 2026-11-04): the caller must type the event's exact name
 * (surrounding spaces ignored, case-sensitive). Refused while payments, expenses, shifts or documents hang
 * on it. Everything that only belongs to the event goes with it through the foreign-key cascades (tasks and
 * their comments / check items, checklists, duties, permit links, anchors, budget lines, income); the
 * permit itself stays. The audit entry is written first and keeps a snapshot, since the event is gone after.
 */
export async function deleteEvent(
  actor: Actor,
  id: string,
  confirmName: string,
): Promise<{ name: string }> {
  if (!can(actor.role, "event", "delete")) forbidden();
  try {
    return await deleteEventTx(actor, id, confirmName);
  } catch (error) {
    // A row that appeared between the blocker check and the delete (RESTRICT foreign key, SQLSTATE 23503):
    // the transaction is rolled back, report it as "blocked" with fresh counts.
    if (isForeignKeyViolation(error)) {
      throw new EventLifecycleInputError("blocked", await countEventDeleteBlockers(db, id));
    }
    throw error;
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 4; depth++) {
    if (typeof e === "object" && (e as { code?: unknown }).code === "23503") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

async function deleteEventTx(actor: Actor, id: string, confirmName: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(event).where(eq(event.id, id)).for("update");
    if (!row) throw new EventLifecycleInputError("not_found");
    if (confirmName.trim() !== row.name.trim()) throw new EventLifecycleInputError("name_mismatch");
    const blockers = await countEventDeleteBlockers(tx, id);
    if (hasDeleteBlockers(blockers)) throw new EventLifecycleInputError("blocked", blockers);
    const n = async (q: PromiseLike<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const cascaded = {
      tasks: await n(tx.select({ n: count() }).from(task).where(eq(task.eventId, id))),
      checklists: await n(
        tx.select({ n: count() }).from(checklist).where(eq(checklist.eventId, id)),
      ),
      duties: await n(tx.select({ n: count() }).from(eventDuty).where(eq(eventDuty.eventId, id))),
      permitLinks: await n(
        tx.select({ n: count() }).from(eventPermit).where(eq(eventPermit.eventId, id)),
      ),
      anchors: await n(
        tx.select({ n: count() }).from(eventAnchor).where(eq(eventAnchor.eventId, id)),
      ),
      budgetLines: await n(
        tx.select({ n: count() }).from(eventBudgetLine).where(eq(eventBudgetLine.eventId, id)),
      ),
      income: await n(
        tx.select({ n: count() }).from(eventIncome).where(eq(eventIncome.eventId, id)),
      ),
    };
    await audit(tx, actor.id, [
      {
        action: "event.delete",
        entityType: "event",
        entityId: id,
        diff: {
          name: row.name,
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          venueId: row.venueId,
          eventTypeId: row.eventTypeId,
          presetId: row.presetId,
          status: row.status,
          cancelledReason: row.cancelledReason,
          archived: row.archivedAt !== null,
          cascaded,
        },
      },
    ]);
    await tx.delete(event).where(eq(event.id, id));
    // The date no longer counts for its season (R10).
    await syncSeasonsTx(tx, actor, [row], "event_delete");
    return { name: row.name };
  });
}
