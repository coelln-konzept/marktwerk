"use server";

import { addDays } from "@marktwerk/core";
import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  archiveDraftEvents,
  createEventsFromPreset,
  EventInputError,
  scheduledEventsBetween,
} from "@/server/services/events";
import { requirePermission } from "@/server/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Existing events around the months shown in "Aus Vorlage erzeugen", for markers and preview warnings. */
export async function loadScheduleContext(from: string, to: string) {
  await requirePermission("event", "write");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];
  return scheduledEventsBetween(addDays(from, -7), addDays(to, 7));
}

export async function createEvents(presetId: string, dates: string[]): Promise<Result<string[]>> {
  const actor = await getActor();
  try {
    const created = await createEventsFromPreset(actor, presetId, dates);
    refresh();
    return { ok: true, data: created.map((c) => c.id) };
  } catch (error) {
    if (error instanceof EventInputError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function undoCreateEvents(ids: string[]): Promise<Result<number>> {
  const actor = await getActor();
  try {
    const n = await archiveDraftEvents(actor, ids);
    refresh();
    return { ok: true, data: n };
  } catch (error) {
    if (error instanceof EventInputError) return { ok: false, error: error.message };
    throw error;
  }
}
