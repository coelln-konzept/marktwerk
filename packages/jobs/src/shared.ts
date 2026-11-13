import {
  pastEventCutoff,
  renderImmediate,
  resolveRelativeDue,
  seasonContextName,
} from "@marktwerk/core";
import {
  type Database,
  event,
  eventPreset,
  eventSeason,
  notification,
  notificationPreference,
  outboundMessage,
  settings,
  staffMember,
  task,
  user,
} from "@marktwerk/db";
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, or, type SQL } from "drizzle-orm";

/** Tasks that are still to be done. */
export const OPEN_TASK_STATUSES = ["todo", "in_progress", "waiting_external", "blocked"] as const;

/**
 * The Saison of a season task with its market's name (research 13 §6.3), for a left join on `task.season_id`:
 * `.leftJoin(sc, eq(sc.seasonId, task.seasonId))` with `const sc = seasonContext(db)`.
 */
export function seasonContext(db: Database) {
  return db
    .select({
      seasonId: eventSeason.id,
      seasonYear: eventSeason.season,
      seasonName: eventPreset.name,
    })
    .from(eventSeason)
    .innerJoin(eventPreset, eq(eventPreset.id, eventSeason.presetId))
    .as("season_ctx");
}

/**
 * What a reminder, the digest or a carry-over names after the task: its event, or for a season task
 * "<Markt> · Saison <Jahr>" (`seasonContextName`); null for a task with neither.
 */
export function taskContextName(r: {
  eventName: string | null;
  seasonName: string | null;
  seasonYear: number | null;
}): string | null {
  if (r.eventName) return r.eventName;
  return r.seasonName !== null && r.seasonYear !== null
    ? seasonContextName(r.seasonName, r.seasonYear)
    : null;
}

/**
 * Leftovers of past markets (last day more than 7 days ago, task already due or undated) neither remind,
 * escalate nor appear in the digest; they are left to the cleanup on the Übersicht. Follow-up work due today
 * or later stays (`isPastMarketLeftover`). Needs the `event` table left-joined on `task.event_id`; tasks
 * without an event stay.
 */
export function notOfPastEvent(today: string): SQL {
  return or(
    isNull(event.id),
    gte(event.endsOn, pastEventCutoff(today)),
    gte(task.dueAt, resolveRelativeDue(today, 0, "00:00")),
  ) as SQL;
}

/**
 * Due instants of the open subtasks of these parents that can be overdue (not waiting for somebody else, not
 * snoozed on `today`), per parent. With `flaggedDueAt` (@marktwerk/core) an overdue subtask flags its parent, so
 * the jobs count it once, through the parent (ADR 0021).
 */
export async function openSubtaskDues(
  db: Database,
  parentIds: readonly string[],
  today: string,
): Promise<Map<string, Date[]>> {
  const result = new Map<string, Date[]>();
  if (parentIds.length === 0) return result;
  const rows = await db
    .select({ parentTaskId: task.parentTaskId, dueAt: task.dueAt })
    .from(task)
    .where(
      and(
        inArray(task.parentTaskId, [...new Set(parentIds)]),
        inArray(task.status, [...OPEN_TASK_STATUSES]),
        ne(task.status, "waiting_external"),
        isNotNull(task.dueAt),
        or(isNull(task.snoozedUntil), lte(task.snoozedUntil, today)),
      ),
    );
  for (const r of rows) {
    if (!r.parentTaskId || !r.dueAt) continue;
    const list = result.get(r.parentTaskId) ?? [];
    list.push(r.dueAt);
    result.set(r.parentTaskId, list);
  }
  return result;
}

/** The business date (YYYY-MM-DD) of an instant in the company's time zone. */
export function berlinDate(instant: Date, timeZone = "Europe/Berlin"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function appUrl(): string {
  return process.env.APP_URL?.trim() || "http://localhost:3000";
}

export type Recipient = { id: string; displayName: string; email: string | null };

/**
 * Who escalations go to: active staff members whose login role is `manager` (decision 2026-10-21: the
 * manager only, not the assignee, not the owner). Without any manager the owners are told instead, so an
 * escalation never disappears silently.
 */
export async function escalationRecipients(db: Database): Promise<Recipient[]> {
  const find = (role: string) =>
    db
      .select({
        id: staffMember.id,
        displayName: staffMember.displayName,
        email: staffMember.email,
      })
      .from(staffMember)
      .innerJoin(user, eq(user.id, staffMember.userId))
      .where(
        and(eq(user.role, role), eq(staffMember.active, true), isNull(staffMember.archivedAt)),
      );
  const managers = await find("manager");
  return managers.length > 0 ? managers : find("owner");
}

/** Reasons for which a person switched the email channel off (no row = on). */
async function emailOptOuts(db: Database, staffIds: string[]) {
  if (staffIds.length === 0) return new Set<string>();
  const rows = await db
    .select({
      staffMemberId: notificationPreference.staffMemberId,
      reason: notificationPreference.reason,
    })
    .from(notificationPreference)
    .where(
      and(
        inArray(notificationPreference.staffMemberId, staffIds),
        eq(notificationPreference.channel, "email"),
        eq(notificationPreference.enabled, false),
      ),
    );
  return new Set(rows.map((r) => `${r.staffMemberId}:${r.reason}`));
}

/** Company settings that gate email (no settings row yet → everything off). */
export async function emailSettings(db: Database) {
  const [row] = await db
    .select({
      emailEnabled: settings.emailEnabled,
      dailyDigestEnabled: settings.dailyDigestEnabled,
    })
    .from(settings)
    .where(eq(settings.id, 1));
  return {
    emailEnabled: row?.emailEnabled ?? false,
    dailyDigestEnabled: row?.dailyDigestEnabled ?? false,
  };
}

export async function isEmailDisabled(db: Database, staffId: string, reasons: string[]) {
  const off = await emailOptOuts(db, [staffId]);
  return reasons.every((r) => off.has(`${staffId}:${r}`));
}

/**
 * Immediate email for notifications that must not wait for the digest (escalations, overdue critical
 * items): one `outbound_message` per notification, keyed by the notification so a repeated sweep adds
 * nothing. Queues nothing while the company master switch (`settings.email_enabled`) is off. Skipped for people without an address or who switched this reason off. Returns how many were queued.
 */
export async function queueImmediateEmails(
  db: Database,
  sent: { recipientStaffMemberId: string; dedupeKey: string }[],
  now: Date,
): Promise<number> {
  if (sent.length === 0) return 0;
  if (!(await emailSettings(db)).emailEnabled) return 0;
  const rows = await db
    .select({
      id: notification.id,
      recipientStaffMemberId: notification.recipientStaffMemberId,
      dedupeKey: notification.dedupeKey,
      reason: notification.reason,
      title: notification.title,
      body: notification.body,
      link: notification.link,
    })
    .from(notification)
    .where(
      inArray(
        notification.dedupeKey,
        sent.map((s) => s.dedupeKey),
      ),
    );
  const wanted = new Set(sent.map((s) => `${s.recipientStaffMemberId}:${s.dedupeKey}`));
  // Immediate mails go to a person; company-wide notifications (no recipient) are in-app only.
  const mine = rows.flatMap((r) =>
    r.recipientStaffMemberId !== null && wanted.has(`${r.recipientStaffMemberId}:${r.dedupeKey}`)
      ? [{ ...r, recipientStaffMemberId: r.recipientStaffMemberId }]
      : [],
  );
  if (mine.length === 0) return 0;
  const people = await db
    .select({ id: staffMember.id, email: staffMember.email })
    .from(staffMember)
    .where(
      inArray(
        staffMember.id,
        mine.map((r) => r.recipientStaffMemberId),
      ),
    );
  const emailOf = new Map(people.map((p) => [p.id, p.email?.trim() || null]));
  const optOut = await emailOptOuts(
    db,
    mine.map((r) => r.recipientStaffMemberId),
  );
  const values = mine.flatMap((r) => {
    const to = emailOf.get(r.recipientStaffMemberId);
    if (!to || optOut.has(`${r.recipientStaffMemberId}:${r.reason}`)) return [];
    const mail = renderImmediate({
      title: r.title,
      body: r.body,
      link: r.link,
      baseUrl: appUrl(),
    });
    return [
      {
        channel: "email" as const,
        recipientStaffMemberId: r.recipientStaffMemberId,
        recipientAddress: to,
        notificationId: r.id,
        templateKey: "notification.immediate",
        subject: mail.subject,
        renderedText: mail.text,
        sendAfter: now,
        dedupeKey: `email:notification:${r.id}`,
      },
    ];
  });
  if (values.length === 0) return 0;
  const inserted = await db
    .insert(outboundMessage)
    .values(values)
    .onConflictDoNothing({ target: outboundMessage.dedupeKey })
    .returning({ id: outboundMessage.id });
  return inserted.length;
}
