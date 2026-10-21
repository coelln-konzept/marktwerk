import {
  berlinDay,
  escalatedText,
  escalationDedupeKey,
  OPEN_STATUSES,
  resolveRelativeDue,
  rolledOverText,
  rolloverDedupeKey,
  shouldEscalate,
  taskLink,
} from "@marktwerk/core";
import {
  type Database,
  escalationLog,
  event,
  insertNotifications,
  staffMember,
  task,
  user,
} from "@marktwerk/db";
import { and, eq, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";

/**
 * Carry-over ("Übertrag"), nightly at 00:05 Europe/Berlin (data model "Carry-over"): every unfinished
 * task whose due day has passed gets `rollover_count + 1` and `last_rolled_at`, its manual column
 * override lapses, and the assignee is told (`rolled_over`). When the count reaches 3 the managers
 * are told too (`escalated`, recipients: login role `manager`).
 *
 * Idempotent: a task is counted at most once per Berlin calendar day (the UPDATE only matches tasks
 * not yet rolled today), and notifications carry a dedupe key per task and count, so a second run the
 * same day, or a late one, changes nothing. Tasks of cancelled or archived events are left alone.
 * The rules themselves (`isRolloverCandidate`, `shouldEscalate`) are in @marktwerk/core.
 */
export async function taskRollover(
  db: Database,
  now: Date = new Date(),
): Promise<{ rolled: number; notified: number; escalated: number }> {
  const today = berlinDay(now);
  const todayStart = resolveRelativeDue(today, 0, "00:00");

  return db.transaction(async (tx) => {
    const rolled = await tx
      .update(task)
      .set({
        rolloverCount: sql`${task.rolloverCount} + 1`,
        lastRolledAt: now,
        // the manual-move override only lasts until the due date passes
        boardColumn: null,
      })
      .where(
        and(
          inArray(task.status, [...OPEN_STATUSES]),
          lt(task.dueAt, todayStart),
          or(isNull(task.lastRolledAt), lt(task.lastRolledAt, todayStart)),
          notExists(
            tx
              .select({ one: event.id })
              .from(event)
              .where(
                and(
                  eq(event.id, task.eventId),
                  or(eq(event.status, "cancelled"), sql`${event.archivedAt} is not null`),
                ),
              ),
          ),
        ),
      )
      .returning({
        id: task.id,
        title: task.title,
        eventId: task.eventId,
        assigneeId: task.assigneeId,
        count: task.rolloverCount,
      });
    if (rolled.length === 0) return { rolled: 0, notified: 0, escalated: 0 };

    const eventIds = [...new Set(rolled.flatMap((r) => (r.eventId ? [r.eventId] : [])))];
    const people = [...new Set(rolled.flatMap((r) => (r.assigneeId ? [r.assigneeId] : [])))];
    const [events, staff, managers] = await Promise.all([
      eventIds.length
        ? tx
            .select({ id: event.id, name: event.name })
            .from(event)
            .where(inArray(event.id, eventIds))
        : [],
      people.length
        ? tx
            .select({ id: staffMember.id, name: staffMember.displayName })
            .from(staffMember)
            .where(inArray(staffMember.id, people))
        : [],
      tx
        .select({ id: staffMember.id })
        .from(staffMember)
        .innerJoin(user, eq(user.id, staffMember.userId))
        .where(
          and(
            eq(user.role, "manager"),
            eq(staffMember.active, true),
            isNull(staffMember.archivedAt),
          ),
        ),
    ]);
    const eventName = new Map(events.map((e) => [e.id, e.name]));
    const staffName = new Map(staff.map((s) => [s.id, s.name]));
    const subject = (r: (typeof rolled)[number]) => ({
      title: r.title,
      eventName: r.eventId ? (eventName.get(r.eventId) ?? null) : null,
    });

    const notified = await insertNotifications(
      tx,
      rolled.flatMap((r) => {
        if (!r.assigneeId) return [];
        const text = rolledOverText(subject(r), r.count);
        return [
          {
            recipientStaffMemberId: r.assigneeId,
            reason: "rolled_over" as const,
            severity: r.count >= 2 ? ("warning" as const) : ("info" as const),
            subjectType: "task",
            subjectId: r.id,
            title: text.title,
            body: text.body,
            link: taskLink(r.id, r.eventId),
            dedupeKey: rolloverDedupeKey(r.id, r.count),
          },
        ];
      }),
    );

    const escalating = rolled.filter((r) => shouldEscalate(r.count));
    let escalated = 0;
    if (escalating.length > 0 && managers.length > 0) {
      escalated = await insertNotifications(
        tx,
        escalating.flatMap((r) => {
          const text = escalatedText(
            subject(r),
            r.count,
            r.assigneeId ? (staffName.get(r.assigneeId) ?? null) : null,
          );
          return managers.map((m) => ({
            recipientStaffMemberId: m.id,
            reason: "escalated" as const,
            severity: "warning" as const,
            subjectType: "task",
            subjectId: r.id,
            title: text.title,
            body: text.body,
            link: taskLink(r.id, r.eventId),
            dedupeKey: escalationDedupeKey(r.id, r.count),
          }));
        }),
      );
      await tx
        .insert(escalationLog)
        .values(
          escalating.flatMap((r) =>
            managers.map((m) => ({
              subjectType: "task",
              subjectId: r.id,
              level: 2,
              escalatedToStaffMemberId: m.id,
              reason: `rollover:${r.count}`,
              dedupeKey: `${escalationDedupeKey(r.id, r.count)}:${m.id}`,
            })),
          ),
        )
        .onConflictDoNothing({ target: escalationLog.dedupeKey });
    }
    console.log(
      `[task-rollover] ${today}: ${rolled.length} carried over, ${notified} assignees and ${escalated} managers notified`,
    );
    return { rolled: rolled.length, notified, escalated };
  });
}
