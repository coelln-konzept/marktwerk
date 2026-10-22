import { type DigestItem, digestUrgency, renderDigest } from "@marktwerk/core";
import {
  type Database,
  event,
  eventPermit,
  outboundMessage,
  permit,
  staffMember,
  task,
  user,
} from "@marktwerk/db";
import { and, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  appUrl,
  berlinDate,
  emailSettings,
  isEmailDisabled,
  notOfPastEvent,
  OPEN_TASK_STATUSES,
} from "./shared";

/** Logins that work in the office get the morning mail; the field crew does not (decision: office users). */
const OFFICE_ROLES = ["owner", "manager", "staff"];

export type DigestResult = { people: number; queued: number };

/**
 * 07:00 Europe/Berlin: one email per office user with their open items that are overdue, due today or due
 * in the next seven days (tasks assigned to them and permits they are responsible for). Nothing to report →
 * no email. Written as an `outbound_message` that the sender job delivers; keyed by person and day, so
 * running the job twice sends nothing twice. Does nothing unless `settings.email_enabled` and
 * `settings.daily_digest_enabled` are both on.
 */
export async function dailyDigest(db: Database, now: Date = new Date()): Promise<DigestResult> {
  // Master switch and digest switch: while either is off nothing is queued (no backlog builds up).
  const config = await emailSettings(db);
  if (!config.emailEnabled || !config.dailyDigestEnabled) return { people: 0, queued: 0 };
  const today = berlinDate(now);
  const people = await db
    .select({
      id: staffMember.id,
      firstName: staffMember.firstName,
      email: sql<string | null>`coalesce(nullif(trim(${staffMember.email}), ''), ${user.email})`,
    })
    .from(staffMember)
    .innerJoin(user, eq(user.id, staffMember.userId))
    .where(
      and(
        inArray(user.role, OFFICE_ROLES),
        eq(staffMember.active, true),
        isNull(staffMember.archivedAt),
      ),
    );
  let queued = 0;
  for (const person of people) {
    if (!person.email) continue;
    // Both reasons switched off for email → no digest either (preferences default to on).
    if (await isEmailDisabled(db, person.id, ["overdue", "due_soon"])) continue;
    const items = await itemsOf(db, person.id, today);
    const mail = renderDigest({ firstName: person.firstName, today, items, baseUrl: appUrl() });
    if (!mail) continue;
    const inserted = await db
      .insert(outboundMessage)
      .values({
        channel: "email",
        recipientStaffMemberId: person.id,
        recipientAddress: person.email,
        templateKey: "digest.daily",
        subject: mail.subject,
        renderedText: mail.text,
        sendAfter: now,
        dedupeKey: `digest:${person.id}:${today}`,
      })
      .onConflictDoNothing({ target: outboundMessage.dedupeKey })
      .returning({ id: outboundMessage.id });
    queued += inserted.length;
  }
  return { people: people.length, queued };
}

/** Open tasks (assigned to the person) and unfiled / undecided permits (they are responsible for). */
async function itemsOf(db: Database, staffMemberId: string, today: string): Promise<DigestItem[]> {
  const items: DigestItem[] = [];

  const tasks = await db
    .select({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      eventId: task.eventId,
      eventName: event.name,
    })
    .from(task)
    .leftJoin(event, eq(event.id, task.eventId))
    .where(
      and(
        eq(task.assigneeId, staffMemberId),
        inArray(task.status, [...OPEN_TASK_STATUSES]),
        isNotNull(task.dueAt),
        // Snoozed tasks stay out until their snooze date.
        or(isNull(task.snoozedUntil), lte(task.snoozedUntil, today)),
        // The permit's own line covers "beantragen".
        ne(task.source, "permit"),
        or(isNull(task.eventId), and(isNull(event.archivedAt), ne(event.status, "cancelled"))),
        // Open tasks of markets that are long over are left to the cleanup on the Übersicht.
        notOfPastEvent(today),
      ),
    );
  for (const t of tasks) {
    if (!t.dueAt) continue;
    const dueOn = berlinDate(t.dueAt);
    const urgency = digestUrgency(dueOn, today);
    if (!urgency) continue;
    items.push({
      kind: "task",
      title: t.title,
      dueOn,
      urgency,
      href: t.eventId
        ? `/veranstaltungen/${t.eventId}/board?detail=task:${t.id}`
        : `/board?detail=task:${t.id}`,
      context: t.eventName,
    });
  }

  const upcoming = sql<number>`(select count(*) from ${eventPermit} ep join ${event} e on e.id = ep.event_id
    where ep.permit_id = ${permit.id} and ep.required and e.archived_at is null and e.status <> 'cancelled' and e.ends_on >= ${today})`;
  const linked = sql<number>`(select count(*) from ${eventPermit} ep where ep.permit_id = ${permit.id})`;
  const permits = await db
    .select({
      id: permit.id,
      title: permit.title,
      status: permit.status,
      applyBy: permit.applyBy,
      expectedDecisionOn: permit.expectedDecisionOn,
    })
    .from(permit)
    .where(
      and(
        eq(permit.responsibleStaffMemberId, staffMemberId),
        isNull(permit.archivedAt),
        inArray(permit.status, ["not_started", "preparing", "applied"]),
        sql`(${linked} = 0 or ${upcoming} > 0)`,
      ),
    );
  for (const p of permits) {
    const unfiled = p.status === "not_started" || p.status === "preparing";
    const dueOn = unfiled ? p.applyBy : p.expectedDecisionOn;
    if (!dueOn) continue;
    const urgency = digestUrgency(dueOn, today);
    if (!urgency) continue;
    items.push({
      kind: "permit",
      title: unfiled ? p.title : `${p.title} (Entscheidung erwartet)`,
      dueOn,
      urgency,
      href: `/logbuch?genehmigung=${p.id}`,
    });
  }
  return items;
}
