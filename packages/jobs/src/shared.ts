import { renderImmediate } from "@marktwerk/core";
import {
  type Database,
  notification,
  notificationPreference,
  outboundMessage,
  settings,
  staffMember,
  user,
} from "@marktwerk/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

/** Tasks that are still to be done. */
export const OPEN_TASK_STATUSES = ["todo", "in_progress", "waiting_external", "blocked"] as const;

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
  const mine = rows.filter((r) => wanted.has(`${r.recipientStaffMemberId}:${r.dedupeKey}`));
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
