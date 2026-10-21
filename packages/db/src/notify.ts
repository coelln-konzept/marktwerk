import type { Database } from "./index";
import { notification } from "./schema";

/** A transaction or the database itself. */
type Executor = Pick<Database, "insert">;

export type NewNotification = {
  recipientStaffMemberId: string;
  reason: (typeof notification.$inferInsert)["reason"];
  severity?: (typeof notification.$inferInsert)["severity"];
  /** What it is about, e.g. "task" + id (no FK, it spans many tables). */
  subjectType?: string;
  subjectId?: string;
  title: string;
  body?: string;
  /** App-relative link, e.g. `/veranstaltungen/<id>/board`. */
  link?: string;
  /**
   * Makes reminders idempotent: the same key for the same person is stored once. Include what changes the
   * meaning, e.g. `task:<id>:overdue:<due date>` (see `reminderDedupeKey` in @marktwerk/core).
   */
  dedupeKey: string;
};

/**
 * The one way to create in-app notifications, from web services (inside their transaction) and from
 * scheduled jobs (packages/jobs). Duplicates by (recipient, dedupe key) are skipped. Returns how many were new.
 * E-mail delivery and the daily digest read these rows (M3).
 */
export async function insertNotifications(db: Executor, items: NewNotification[]): Promise<number> {
  if (items.length === 0) return 0;
  const inserted = await db
    .insert(notification)
    .values(items.map((item) => ({ severity: "info" as const, ...item })))
    .onConflictDoNothing({ target: [notification.recipientStaffMemberId, notification.dedupeKey] })
    .returning({ id: notification.id });
  return inserted.length;
}
