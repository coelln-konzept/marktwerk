"use server";

import { refresh } from "next/cache";
import type { NotificationGroup } from "@/lib/notification-reasons";
import { getActor } from "@/server/actor";
import {
  markAllRead,
  markUnread,
  NotificationInputError,
  type NotificationSnapshot,
  restoreNotification,
  setNotificationState,
  snoozeNotification,
} from "@/server/services/notifications";
import { requireUser } from "@/server/session";

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
