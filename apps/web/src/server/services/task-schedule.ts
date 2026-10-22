import "server-only";
import {
  CLOSED_TASK_STATUSES,
  dueDateFor,
  dueInstantFor,
  isOpenTask,
  wallClockTime,
} from "@marktwerk/core";
import { insertNotifications } from "@marktwerk/db";
import { auditLog, task } from "@marktwerk/db/schema";
import { and, count, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
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

/**
 * Anchor changes → tasks follow (data model principle 2): which open tasks of an event get a new due
 * date when the named dates become `anchors`. Open = not done/skipped/cancelled; tasks whose date was
 * edited by hand (`due_overridden`) and tasks without an anchor rule stay. A task keeps its time of day.
 * Nothing is written.
 */
export async function planTaskShift(
  x: Executor,
  eventId: string,
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
        eq(task.eventId, eventId),
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

/**
 * One grouped `dates_shifted` notification per assignee whose tasks moved (not for the person who made
 * the change). The key includes how often the event's dates were changed before, so a second move
 * back and forth is announced again while a repeated call of the same change is not.
 */
export async function notifyDatesShifted(
  tx: Pick<typeof db, "select" | "insert">,
  actor: Actor,
  current: { id: string; name: string; startsOn: string },
  next: { startsOn: string },
  shifted: ShiftedTask[],
) {
  const perPerson = new Map<string, number>();
  for (const s of shifted) {
    if (!s.assigneeId || s.assigneeId === actor.staffMemberId) continue;
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
  const key = `dates_shifted:${current.id}:${current.startsOn}:${next.startsOn}:${revision}`;
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
      link: `/veranstaltungen/${current.id}/board`,
      dedupeKey: key,
    })),
  );
}

/** Plans the shift and writes it (inside the caller's transaction). Returns the tasks that moved. */
export async function shiftTasks(
  tx: Executor,
  eventId: string,
  anchors: ReadonlyMap<string, string>,
): Promise<ShiftedTask[]> {
  const shifted = await planTaskShift(tx, eventId, anchors);
  for (const s of shifted) await tx.update(task).set({ dueAt: s.to }).where(eq(task.id, s.id));
  return shifted;
}
