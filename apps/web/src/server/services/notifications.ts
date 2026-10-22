import "server-only";
import { mondayOf, resolveRelativeDue } from "@marktwerk/core";
import { notification } from "@marktwerk/db/schema";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { todayIn } from "@/lib/format";
import {
  NOTIFICATION_REASON_GROUPS,
  type NotificationGroup,
  SNOOZE_CHOICES,
  type SnoozeChoice,
} from "@/lib/notification-reasons";
import type { Actor } from "../actor";
import { db } from "../db";

export type NotificationErrorCode = "not_found" | "invalid_state" | "invalid_snooze" | "forbidden";

export class NotificationInputError extends Error {
  constructor(readonly code: NotificationErrorCode) {
    super(code);
  }
}

type NotificationReason = (typeof notification.reason.enumValues)[number];
export type NotificationState = (typeof notification.state.enumValues)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notifications belong to a staff member (ADR 0012). The actor acts on their own inbox only; a login
 * without a staff record has none, so every id is "not found". State changes are personal bookkeeping and
 * not business data, so they are not written to the audit log (like the UI preferences).
 */
function ownedBy(actor: Actor, id: string) {
  if (!actor.staffMemberId || !UUID.test(id)) throw new NotificationInputError("not_found");
  return and(eq(notification.id, id), eq(notification.recipientStaffMemberId, actor.staffMemberId));
}

export type NotificationSnapshot = {
  state: NotificationState;
  readAt: string | null;
  snoozedUntil: string | null;
};

const snapshot = (row: typeof notification.$inferSelect): NotificationSnapshot => ({
  state: row.state,
  readAt: row.readAt?.toISOString() ?? null,
  snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
});

/**
 * unread · read · done · saved. Reading or finishing also ends a snooze. Returns the previous state for
 * the undo toast (`restoreNotification`).
 */
export async function setNotificationState(
  actor: Actor,
  id: string,
  state: string,
  now: Date = new Date(),
): Promise<{ changed: boolean; previous: NotificationSnapshot }> {
  if (!(notification.state.enumValues as readonly string[]).includes(state))
    throw new NotificationInputError("invalid_state");
  const next = state as NotificationState;
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(notification).where(ownedBy(actor, id)).for("update");
    if (!row) throw new NotificationInputError("not_found");
    const previous = snapshot(row);
    if (row.state === next && row.snoozedUntil === null) return { changed: false, previous };
    await tx
      .update(notification)
      .set({
        state: next,
        snoozedUntil: null,
        readAt: next === "unread" ? null : (row.readAt ?? now),
      })
      .where(eq(notification.id, id));
    return { changed: true, previous };
  });
}

/** Undo toast: writes a snapshot back. */
export async function restoreNotification(
  actor: Actor,
  id: string,
  previous: NotificationSnapshot,
): Promise<void> {
  if (!(notification.state.enumValues as readonly string[]).includes(previous.state))
    throw new NotificationInputError("invalid_state");
  await db
    .update(notification)
    .set({
      state: previous.state,
      readAt: previous.readAt ? new Date(previous.readAt) : null,
      snoozedUntil: previous.snoozedUntil ? new Date(previous.snoozedUntil) : null,
    })
    .where(ownedBy(actor, id));
}

/** Time of day a snoozed notification comes back ("morgen früh"). */
const SNOOZE_WAKE_TIME = "08:00";

/** When a snooze choice ends: in an hour, tomorrow 08:00, or next Monday 08:00 (company time zone). */
export function snoozeUntil(choice: SnoozeChoice, now: Date = new Date()): Date {
  if (choice === "hour") return new Date(now.getTime() + 60 * 60 * 1000);
  const today = todayIn("Europe/Berlin", now);
  if (choice === "tomorrow") return resolveRelativeDue(today, 1, SNOOZE_WAKE_TIME);
  const monday = mondayOf(today);
  return resolveRelativeDue(monday, 7, SNOOZE_WAKE_TIME);
}

/**
 * "Später": hides the notification until the chosen time, then it is unread again. The state becomes
 * `unread` so it counts and shows up again by itself, without a job.
 */
export async function snoozeNotification(
  actor: Actor,
  id: string,
  choice: string,
  now: Date = new Date(),
): Promise<{ until: Date; previous: NotificationSnapshot }> {
  if (!(SNOOZE_CHOICES as readonly string[]).includes(choice))
    throw new NotificationInputError("invalid_snooze");
  const until = snoozeUntil(choice as SnoozeChoice, now);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(notification).where(ownedBy(actor, id)).for("update");
    if (!row) throw new NotificationInputError("not_found");
    await tx
      .update(notification)
      .set({ state: "unread", readAt: null, snoozedUntil: until })
      .where(eq(notification.id, id));
    return { until, previous: snapshot(row) };
  });
}

/** "Alle gelesen": every unread (not snoozed) notification, optionally only of one reason group. */
export async function markAllRead(
  actor: Actor,
  group?: NotificationGroup,
  now: Date = new Date(),
): Promise<{ ids: string[] }> {
  if (!actor.staffMemberId) return { ids: [] };
  const reasons = group ? NOTIFICATION_REASON_GROUPS[group] : null;
  const rows = await db
    .update(notification)
    .set({ state: "read", readAt: now })
    .where(
      and(
        eq(notification.recipientStaffMemberId, actor.staffMemberId),
        eq(notification.state, "unread"),
        or(isNull(notification.snoozedUntil), lte(notification.snoozedUntil, now)),
        reasons ? inArray(notification.reason, [...reasons] as NotificationReason[]) : undefined,
      ),
    )
    .returning({ id: notification.id });
  return { ids: rows.map((r) => r.id) };
}

/** Undo of "Alle gelesen": the notifications that were unread become unread again. */
export async function markUnread(actor: Actor, ids: string[]): Promise<{ count: number }> {
  if (!actor.staffMemberId || ids.length === 0) return { count: 0 };
  const rows = await db
    .update(notification)
    .set({ state: "unread", readAt: null })
    .where(
      and(
        eq(notification.recipientStaffMemberId, actor.staffMemberId),
        inArray(
          notification.id,
          ids.filter((i) => UUID.test(i)),
        ),
        eq(notification.state, "read"),
      ),
    )
    .returning({ id: notification.id });
  return { count: rows.length };
}
