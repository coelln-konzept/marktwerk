"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  createPreset,
  type PresetInput,
  PresetInputError,
  updatePreset,
} from "@/server/services/presets";
import { requirePermission } from "@/server/session";

export type PresetActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

/** "Neue Vorlage": validated on the server; errors name the form field they belong to. */
export async function createPresetAction(
  input: PresetInput,
): Promise<PresetActionResult<{ id: string }>> {
  await requirePermission("template", "write");
  const actor = await getActor();
  try {
    const { id } = await createPreset(actor, input);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    if (error instanceof PresetInputError)
      return { ok: false, error: error.code, field: error.field };
    throw error;
  }
}

/** "Vorlage bearbeiten": `expectedUpdatedAt` is the version the form was loaded with. */
export async function updatePresetAction(
  id: string,
  input: PresetInput,
  expectedUpdatedAt: string,
): Promise<PresetActionResult<{ changed: boolean }>> {
  await requirePermission("template", "write");
  const actor = await getActor();
  try {
    const { changed } = await updatePreset(actor, id, input, expectedUpdatedAt);
    refresh();
    return { ok: true, data: { changed } };
  } catch (error) {
    if (error instanceof PresetInputError) {
      // Somebody else saved first or the preset is gone: show the current state next time.
      if (error.code === "conflict" || error.code === "not_found") refresh();
      return { ok: false, error: error.code, field: error.field };
    }
    throw error;
  }
}
