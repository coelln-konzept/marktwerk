"use server";

import { addDays, clampToLookupRange } from "@marktwerk/core";
import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import { type GenerationPreview, previewGeneration } from "@/server/queries/generation-preview";
import {
  createEventsFromPreset,
  createManualEvent,
  EventInputError,
  type ManualEventInput,
  scheduledEventsBetween,
  undoGeneratedEvents,
} from "@/server/services/events";
import { createMarket, type MarketInput, PresetInputError } from "@/server/services/presets";
import { requirePermission } from "@/server/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Existing events around the months shown in "Markt planen", for markers and preview warnings. */
export async function loadScheduleContext(from: string, to: string) {
  await requirePermission("event", "write");
  // "9999-12-31" + 7 days would be year 10000, which Postgres rejects (HTTP 500 in the hints, UX-041).
  // Only that is cut: "Markt planen" and agreements may look at years outside the plannable ones.
  const range = clampToLookupRange(from, to);
  if (!range) return [];
  return scheduledEventsBetween(addDays(range.from, -7), addDays(range.to, 7));
}

/**
 * Step 3 of "Markt planen": what the chosen dates would bring (tasks, tasks due on day one, permits
 * covered or new). Read-only; the same calculation the creation uses.
 */
export async function previewGeneratedEvents(
  presetId: string,
  dates: string[],
  merge = false,
): Promise<Result<GenerationPreview>> {
  await requirePermission("event", "write");
  try {
    return { ok: true, data: await previewGeneration(presetId, dates, { merge }) };
  } catch (error) {
    if (error instanceof EventInputError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function createEvents(
  presetId: string,
  dates: string[],
  merge = false,
): Promise<Result<string[]>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  try {
    const created = await createEventsFromPreset(actor, presetId, dates, { merge });
    refresh();
    return { ok: true, data: created.map((c) => c.id) };
  } catch (error) {
    if (error instanceof EventInputError) return { ok: false, error: error.message };
    throw error;
  }
}

/** "Neue Veranstaltung ohne Vorlage": one planned event from typed data. */
export async function createSingleEvent(
  input: ManualEventInput & { startsOn: string },
): Promise<Result<{ id: string; name: string }>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  try {
    const created = await createManualEvent(actor, input);
    refresh();
    return { ok: true, data: { id: created.id, name: input.name.trim() } };
  } catch (error) {
    if (error instanceof EventInputError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function undoCreateEvents(ids: string[]): Promise<Result<number>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  try {
    const n = await undoGeneratedEvents(actor, ids);
    refresh();
    return { ok: true, data: n };
  } catch (error) {
    if (error instanceof EventInputError) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * "Neuen Markt anlegen" in the planning flow: the market (preset) with its own task template copied
 * from the master. `template` is null when there is no master, so the UI can say the market has no
 * tasks yet.
 */
export async function createMarketAction(
  input: MarketInput,
  /** Archiv: "Als Vorlage speichern" from this past event (its market's tasks are copied). */
  fromEventId?: string,
): Promise<Result<{ id: string; color: string | null; template: { items: number } | null }>> {
  await requirePermission("template", "write");
  const actor = await getActor();
  try {
    const created = await createMarket(actor, input, fromEventId ? { fromEventId } : {});
    refresh();
    return {
      ok: true,
      data: {
        id: created.id,
        color: created.color,
        template: created.template ? { items: created.template.items } : null,
      },
    };
  } catch (error) {
    if (error instanceof PresetInputError)
      return {
        ok: false,
        error: error.code === "invalid_type" ? "invalid_event_type" : error.code,
      };
    throw error;
  }
}
