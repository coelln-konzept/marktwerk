import "server-only";
import { can, isValidSnoozeDate, resolveRelativeDue } from "@marktwerk/core";
import { notification } from "@marktwerk/db/schema";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { todayIn } from "@/lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import {
  type CompanyArt,
  type CompanyNotificationRow,
  listCompanyNotifications,
} from "../queries/notifications";
import { audit } from "./audit";
import {
  NotificationInputError,
  type NotificationSnapshot,
  type NotificationState,
} from "./notifications";

/*
 * Company-wide notification center (decision 2026-10-22). One shared state per notification; every change
 * is permission-checked (owner and manager), runs in a transaction and is written to the audit log. The
 * undo toasts write the previous snapshot back (`restoreCompanyNotification`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Time of day a snoozed notification comes back. */
const SNOOZE_WAKE_TIME = "08:00";

function need(actor: Actor) {
  if (!can(actor.role, "notification", "manage")) throw new NotificationInputError("forbidden");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadOwn(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new NotificationInputError("not_found");
  const [row] = await tx
    .select()
    .from(notification)
    .where(
      and(
        eq(notification.id, id),
        isNull(notification.recipientStaffMemberId),
        like(notification.dedupeKey, "company:%"),
      ),
    )
    .for("update");
  if (!row) throw new NotificationInputError("not_found");
  return row;
}

const snapshot = (row: typeof notification.$inferSelect): NotificationSnapshot => ({
  state: row.state,
  readAt: row.readAt?.toISOString() ?? null,
  snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
});

/**
 * Erledigt (`done`), wieder öffnen (`unread`) or gelesen (`read`). Done and read set the read time; opening
 * again clears a snooze. Returns the previous state for the undo toast.
 */
export async function setCompanyNotificationState(
  actor: Actor,
  id: string,
  state: string,
  now: Date = new Date(),
): Promise<{ changed: boolean; previous: NotificationSnapshot }> {
  need(actor);
  if (state !== "done" && state !== "unread" && state !== "read")
    throw new NotificationInputError("invalid_state");
  const next: NotificationState = state;
  return db.transaction(async (tx) => {
    const row = await loadOwn(tx, id);
    const previous = snapshot(row);
    // Reading never ends a snooze; finishing or reopening does.
    const keepSnooze = next === "read";
    if (row.state === next && (keepSnooze || row.snoozedUntil === null))
      return { changed: false, previous };
    const after = {
      state: next,
      snoozedUntil: keepSnooze ? row.snoozedUntil : null,
      readAt: next === "unread" ? null : (row.readAt ?? now),
    };
    await tx.update(notification).set(after).where(eq(notification.id, id));
    await audit(tx, actor.id, [
      {
        action: `notification.${next === "done" ? "done" : next === "unread" ? "reopen" : "read"}`,
        entityType: "notification",
        entityId: id,
        diff: {
          before: previous,
          after: { ...after, readAt: after.readAt?.toISOString() ?? null },
        },
      },
    ]);
    return { changed: true, previous };
  });
}

/**
 * "Zurückstellen": hides the notification until 08:00 on `until` (`YYYY-MM-DD`, after today, Berlin); then
 * it is open and unread again by itself. The subject (task, permit) is not touched.
 */
export async function snoozeCompanyNotification(
  actor: Actor,
  id: string,
  until: string,
  now: Date = new Date(),
): Promise<{ until: Date; previous: NotificationSnapshot }> {
  need(actor);
  if (!isValidSnoozeDate(until, todayIn("Europe/Berlin", now)))
    throw new NotificationInputError("invalid_snooze");
  const wake = resolveRelativeDue(until, 0, SNOOZE_WAKE_TIME);
  return db.transaction(async (tx) => {
    const row = await loadOwn(tx, id);
    const previous = snapshot(row);
    await tx
      .update(notification)
      .set({ state: "unread", readAt: null, snoozedUntil: wake })
      .where(eq(notification.id, id));
    await audit(tx, actor.id, [
      {
        action: "notification.snooze",
        entityType: "notification",
        entityId: id,
        diff: { before: previous, until },
      },
    ]);
    return { until: wake, previous };
  });
}

/** Undo toast: writes the snapshot back. */
export async function restoreCompanyNotification(
  actor: Actor,
  id: string,
  previous: NotificationSnapshot,
): Promise<void> {
  need(actor);
  if (!(notification.state.enumValues as readonly string[]).includes(previous.state))
    throw new NotificationInputError("invalid_state");
  await db.transaction(async (tx) => {
    const row = await loadOwn(tx, id);
    await tx
      .update(notification)
      .set({
        state: previous.state,
        readAt: previous.readAt ? new Date(previous.readAt) : null,
        snoozedUntil: previous.snoozedUntil ? new Date(previous.snoozedUntil) : null,
      })
      .where(eq(notification.id, id));
    await audit(tx, actor.id, [
      {
        action: "notification.restore",
        entityType: "notification",
        entityId: id,
        diff: { before: snapshot(row), after: previous },
      },
    ]);
  });
}

/** "Alle als gelesen": every unread open item in the current filter (Art, Markt). */
export async function markAllCompanyRead(
  actor: Actor,
  filter: { art?: CompanyArt; markt?: string } = {},
  now: Date = new Date(),
): Promise<{ ids: string[] }> {
  need(actor);
  const center = await listCompanyNotifications(
    actor,
    { status: "open", sort: "urgency", ...filter },
    now,
  );
  const wanted = center.rows.filter((r: CompanyNotificationRow) => r.unread).map((r) => r.id);
  if (wanted.length === 0) return { ids: [] };
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(notification)
      .set({ state: "read", readAt: now })
      .where(
        and(
          inArray(notification.id, wanted),
          isNull(notification.recipientStaffMemberId),
          eq(notification.state, "unread"),
        ),
      )
      .returning({ id: notification.id });
    const ids = rows.map((r) => r.id);
    await audit(tx, actor.id, [
      {
        action: "notification.read_all",
        entityType: "notification",
        entityId: null,
        diff: { ids },
      },
    ]);
    return { ids };
  });
}

/** Undo of "Alle als gelesen". */
export async function markCompanyUnread(actor: Actor, ids: string[]): Promise<{ count: number }> {
  need(actor);
  const valid = ids.filter((i) => UUID.test(i));
  if (valid.length === 0) return { count: 0 };
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(notification)
      .set({ state: "unread", readAt: null })
      .where(
        and(
          inArray(notification.id, valid),
          isNull(notification.recipientStaffMemberId),
          eq(notification.state, "read"),
        ),
      )
      .returning({ id: notification.id });
    await audit(tx, actor.id, [
      {
        action: "notification.unread_all",
        entityType: "notification",
        entityId: null,
        diff: { ids: rows.map((r) => r.id) },
      },
    ]);
    return { count: rows.length };
  });
}
