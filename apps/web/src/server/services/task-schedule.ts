import "server-only";
import {
  CLOSED_TASK_STATUSES,
  dueDateFor,
  dueInstantFor,
  isOpenTask,
  wallClockTime,
} from "@marktwerk/core";
import { insertNotifications } from "@marktwerk/db";
import { auditLog, notification, task } from "@marktwerk/db/schema";
import { and, count, eq, inArray, isNotNull, like, notInArray } from "drizzle-orm";
import { formatDate } from "../../lib/format";
import type { Actor } from "../actor";
import type { db } from "../db";
import { holidaysForAnchors, loadDueDefaults } from "./task-instantiation";

type Executor = Pick<typeof db, "select" | "update">;

export type ShiftedTask = {
  id: string;
  title: string;
  assigneeId: string | null;
  from: Date | null;
  to: Date;
};

/** Whose tasks follow the anchors: an event's, or a Saison record's (research 13 §6.2). */
export type ShiftOwner = { eventId: string } | { seasonId: string };

/**
 * Anchor changes → tasks follow (data model principle 2): which open tasks of an event or a season get a new
 * due date when the named dates become `anchors`. Open = not done/skipped/cancelled; tasks whose date was
 * edited by hand (`due_overridden`) and tasks without an anchor rule stay, and so does a task whose anchor is
 * missing from `anchors`. A task keeps its time of day. Nothing is written.
 */
export async function planTaskShift(
  x: Executor,
  owner: ShiftOwner,
  anchors: ReadonlyMap<string, string>,
): Promise<ShiftedTask[]> {
  const rows = await x
    .select({
      id: task.id,
      title: task.title,
      status: task.status,
      assigneeId: task.assigneeId,
      anchorKey: task.anchorKey,
      offsetDays: task.offsetDays,
      dayMode: task.dayMode,
      dueAt: task.dueAt,
    })
    .from(task)
    .where(
      and(
        "eventId" in owner ? eq(task.eventId, owner.eventId) : eq(task.seasonId, owner.seasonId),
        eq(task.dueOverridden, false),
        isNotNull(task.anchorKey),
        isNotNull(task.offsetDays),
        notInArray(task.status, [...CLOSED_TASK_STATUSES]),
      ),
    );
  const defaults = await loadDueDefaults(x);
  const open = rows.filter((r) => isOpenTask(r.status));
  const business = open.filter((r) => r.dayMode === "business");
  const holidays =
    business.length > 0
      ? holidaysForAnchors(anchors, Math.max(...business.map((r) => Math.abs(r.offsetDays ?? 0))))
      : new Map<string, unknown>();

  const shifted: ShiftedTask[] = [];
  for (const row of open) {
    const anchorDate = row.anchorKey ? anchors.get(row.anchorKey) : undefined;
    if (!anchorDate || row.offsetDays === null) continue;
    const date = dueDateFor(anchorDate, row.offsetDays, row.dayMode, holidays);
    const time = row.dueAt ? wallClockTime(row.dueAt, defaults.timeZone) : null;
    const to = dueInstantFor(date, time, defaults.defaultDueTime, defaults.timeZone);
    if (row.dueAt && row.dueAt.getTime() === to.getTime()) continue;
    shifted.push({ id: row.id, title: row.title, assigneeId: row.assigneeId, from: row.dueAt, to });
  }
  return shifted;
}

/** The staff members a `dates_shifted` notice goes to: assignees of moved tasks, never the actor. */
export function shiftedTaskRecipients(
  actor: Pick<Actor, "staffMemberId">,
  shifted: ShiftedTask[],
): string[] {
  const ids = new Set<string>();
  for (const s of shifted)
    if (s.assigneeId && s.assigneeId !== actor.staffMemberId) ids.add(s.assigneeId);
  return [...ids];
}

const datesShiftedKeyPrefix = (eventId: string, from: string, to: string) =>
  `dates_shifted:${eventId}:${from}:${to}:`;

/**
 * Undo of a move (UX-046): removes the still unread `dates_shifted` notices of the move `from` → `to`, so
 * nobody is told twice about a move that did not stick. Returns whose notice was removed; read ones stay.
 */
export async function retractDatesShifted(
  tx: Pick<typeof db, "delete">,
  move: { id: string; from: string; to: string },
): Promise<Set<string>> {
  const rows = await tx
    .delete(notification)
    .where(
      and(
        eq(notification.reason, "dates_shifted"),
        eq(notification.subjectId, move.id),
        eq(notification.state, "unread"),
        like(notification.dedupeKey, `${datesShiftedKeyPrefix(move.id, move.from, move.to)}%`),
      ),
    )
    .returning({ recipient: notification.recipientStaffMemberId });
  return new Set(rows.flatMap((r) => (r.recipient ? [r.recipient] : [])));
}

/**
 * One grouped `dates_shifted` notification per assignee whose tasks moved (not for the person who made
 * the change, nor for the people in `skip`). The key includes how often the event's dates were changed
 * before, so a second move back and forth is announced again while a repeated call of the same change is not.
 */
export async function notifyDatesShifted(
  tx: Pick<typeof db, "select" | "insert">,
  actor: Actor,
  current: { id: string; name: string; startsOn: string },
  next: { startsOn: string },
  shifted: ShiftedTask[],
  skip: ReadonlySet<string> = new Set(),
) {
  const recipients = new Set(shiftedTaskRecipients(actor, shifted));
  const perPerson = new Map<string, number>();
  for (const s of shifted) {
    if (!s.assigneeId || !recipients.has(s.assigneeId) || skip.has(s.assigneeId)) continue;
    perPerson.set(s.assigneeId, (perPerson.get(s.assigneeId) ?? 0) + 1);
  }
  if (perPerson.size === 0) return;
  const [{ revision } = { revision: 0 }] = await tx
    .select({ revision: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityId, current.id),
        inArray(auditLog.action, ["event.move", "event.update"]),
      ),
    );
  const key = `${datesShiftedKeyPrefix(current.id, current.startsOn, next.startsOn)}${revision}`;
  await insertNotifications(
    tx,
    [...perPerson].map(([recipientStaffMemberId, tasks]) => ({
      recipientStaffMemberId,
      reason: "dates_shifted" as const,
      subjectType: "event",
      subjectId: current.id,
      // Stored text is German (the company's default language); the link opens the event's board.
      title: `Termine verschoben: ${current.name}`,
      body:
        (next.startsOn === current.startsOn
          ? "Die Dauer der Veranstaltung wurde geändert. "
          : `Die Veranstaltung findet jetzt am ${formatDate(next.startsOn, "de")} statt ` +
            `(vorher ${formatDate(current.startsOn, "de")}). `) +
        `${tasks === 1 ? "1 deiner Aufgaben hat" : `${tasks} deiner Aufgaben haben`} eine neue Fälligkeit.`,
      link: `/veranstaltungen/${current.id}`,
      dedupeKey: key,
    })),
  );
}

/** Plans the shift and writes it (inside the caller's transaction). Returns the tasks that moved. */
export async function shiftTasks(
  tx: Executor,
  owner: ShiftOwner,
  anchors: ReadonlyMap<string, string>,
): Promise<ShiftedTask[]> {
  const shifted = await planTaskShift(tx, owner, anchors);
  for (const s of shifted) await tx.update(task).set({ dueAt: s.to }).where(eq(task.id, s.id));
  return shifted;
}
