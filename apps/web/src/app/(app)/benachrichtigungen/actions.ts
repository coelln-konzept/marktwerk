"use server";

import { refresh } from "next/cache";
import type { NotificationGroup } from "@/lib/notification-reasons";
import { getActor } from "@/server/actor";
import { isCompanyArt } from "@/server/queries/notifications";
import {
  markAllRead,
  markUnread,
  NotificationInputError,
  type NotificationSnapshot,
  restoreNotification,
  setNotificationState,
  snoozeNotification,
} from "@/server/services/notifications";
import {
  markAllCompanyRead,
  markCompanyUnread,
  restoreCompanyNotification,
  setCompanyNotificationState,
  snoozeCompanyNotification,
} from "@/server/services/notifications-company";
import { requirePermission, requireUser } from "@/server/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Everybody works on their own inbox, so a login is enough (the service checks the recipient). */
async function guarded<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  await requireUser();
  try {
    const data = await run();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof NotificationInputError) {
      if (error.code === "not_found") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** unread · read · done · saved. */
export async function setNotificationStateAction(id: string, state: string) {
  return guarded(async () => setNotificationState(await getActor(), id, state));
}

/** "Später": snooze until the chosen time. */
export async function snoozeNotificationAction(id: string, choice: string) {
  return guarded(async () => {
    const result = await snoozeNotification(await getActor(), id, choice);
    return { until: result.until.toISOString(), previous: result.previous };
  });
}

/** Undo toast: writes a snapshot back. */
export async function restoreNotificationAction(id: string, previous: NotificationSnapshot) {
  return guarded(async () => {
    await restoreNotification(await getActor(), id, previous);
    return null;
  });
}

export async function markAllReadAction(group?: NotificationGroup) {
  return guarded(async () => markAllRead(await getActor(), group));
}

export async function markUnreadAction(ids: string[]) {
  return guarded(async () => markUnread(await getActor(), ids));
}

// ---------------------------------------------------------------------------------------------
// Company-wide notification center (owner and manager)

async function guardedCompany<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  await requirePermission("notification", "manage");
  return guarded(run);
}

/** done · unread (reopen) · read. */
export async function setCompanyStateAction(id: string, state: string) {
  return guardedCompany(async () => setCompanyNotificationState(await getActor(), id, state));
}

/** "Zurückstellen" until a date (`YYYY-MM-DD`, after today). */
export async function snoozeCompanyAction(id: string, until: string) {
  return guardedCompany(async () => {
    const result = await snoozeCompanyNotification(await getActor(), id, until);
    return { until: result.until.toISOString(), previous: result.previous };
  });
}

export async function restoreCompanyAction(id: string, previous: NotificationSnapshot) {
  return guardedCompany(async () => {
    await restoreCompanyNotification(await getActor(), id, previous);
    return null;
  });
}

export async function markAllCompanyReadAction(art?: string, markt?: string) {
  return guardedCompany(async () =>
    markAllCompanyRead(await getActor(), {
      art: isCompanyArt(art) ? art : undefined,
      markt: markt || undefined,
    }),
  );
}

export async function markCompanyUnreadAction(ids: string[]) {
  return guardedCompany(async () => markCompanyUnread(await getActor(), ids));
}
