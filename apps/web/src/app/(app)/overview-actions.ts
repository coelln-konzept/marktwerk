"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import { skipPastEventTasks, TaskInputError, undoTaskChanges } from "@/server/services/tasks";
import { requirePermission } from "@/server/session";

export type CleanupResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(call: () => Promise<T>): Promise<CleanupResult<T>> {
  try {
    const data = await call();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof TaskInputError) {
      refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/**
 * Übersicht "Aufräumen": skips the open tasks of the given past markets (omitted = all past markets) in
 * one transaction. The returned audit ids feed the undo toast.
 */
export async function skipPastMarkets(eventIds?: string[]) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => skipPastEventTasks(actor, eventIds));
}

/** Undo toast of {@link skipPastMarkets}: restores the previous statuses of all those tasks at once. */
export async function undoPastMarketCleanup(auditIds: string[]) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => undoTaskChanges(actor, auditIds));
}
