"use server";

import type { TemplateItemFields } from "@marktwerk/core";
import { refresh } from "next/cache";
import { type Actor, getActor } from "@/server/actor";
import { applyTemplateVersion, TemplateApplyError } from "@/server/services/template-propagation";
import {
  addTemplateItem,
  createDraft,
  createMasterTemplate,
  createTemplate,
  deleteTemplateItem,
  discardDraft,
  duplicateTemplateItem,
  moveTemplateItem,
  publishDraft,
  setTemplateArchived,
  setTemplatePresets,
  type TemplateInput,
  TemplateInputError,
  updateTemplate,
  updateTemplateItem,
} from "@/server/services/templates";
import { requirePermission } from "@/server/session";

export type TemplateActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string; key?: string };

/** Runs a template mutation: permission first, input errors become result codes, the page refreshes. */
async function run<T>(work: (actor: Actor) => Promise<T>): Promise<TemplateActionResult<T>> {
  await requirePermission("template", "write");
  const actor = await getActor();
  try {
    const data = await work(actor);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof TemplateInputError) {
      // The page may show an outdated state (another person published or deleted): show it again.
      if (["not_found", "version_not_found", "not_draft", "draft_exists"].includes(error.code))
        refresh();
      return { ok: false, error: error.code, field: error.field, key: error.key };
    }
    if (error instanceof TemplateApplyError) {
      refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** "Neue Ablaufvorlage". */
export async function createTemplateAction(input: TemplateInput) {
  return run((actor) => createTemplate(actor, input));
}

/** "Grundvorlage anlegen": the master event template, for a database that has none yet. */
export async function createMasterAction() {
  return run((actor) => createMasterTemplate(actor));
}

/** Name, description and event type of a template. */
export async function updateTemplateAction(id: string, input: TemplateInput) {
  return run((actor) => updateTemplate(actor, id, input));
}

/** Archive / restore (undo of the archive toast). */
export async function archiveTemplateAction(id: string, archived: boolean) {
  return run((actor) => setTemplateArchived(actor, id, archived));
}

/** "Entwurf anlegen": copy of the published version. */
export async function createDraftAction(templateId: string) {
  return run((actor) => createDraft(actor, templateId));
}

export async function discardDraftAction(versionId: string) {
  return run((actor) => discardDraft(actor, versionId));
}

/** "Veröffentlichen". Existing events stay as they are. */
export async function publishDraftAction(versionId: string, changeNote: string | null) {
  return run((actor) => publishDraft(actor, versionId, changeNote));
}

export async function addItemAction(
  versionId: string,
  fields: TemplateItemFields,
  afterKey: string | null,
) {
  return run((actor) => addTemplateItem(actor, versionId, fields, afterKey));
}

export async function updateItemAction(versionId: string, key: string, fields: TemplateItemFields) {
  return run((actor) => updateTemplateItem(actor, versionId, key, fields));
}

export async function deleteItemAction(versionId: string, key: string) {
  return run((actor) => deleteTemplateItem(actor, versionId, key));
}

export async function moveItemAction(versionId: string, key: string, direction: "up" | "down") {
  return run((actor) => moveTemplateItem(actor, versionId, key, direction));
}

export async function duplicateItemAction(versionId: string, key: string) {
  return run((actor) => duplicateTemplateItem(actor, versionId, key));
}

/** "Gilt für Vorlagen": which presets instantiate this template. */
export async function setPresetsAction(templateId: string, presetIds: string[]) {
  return run((actor) => setTemplatePresets(actor, templateId, presetIds));
}

/** "Auf Veranstaltungen anwenden…": the chosen events take over the published version. */
export async function applyVersionAction(templateId: string, eventIds: string[]) {
  return run((actor) => applyTemplateVersion(actor, templateId, eventIds));
}
