import "server-only";
import {
  can,
  checkDependencies,
  checkTemplateItem,
  clockTime,
  type ItemIssueCode,
  MAX_ITEMS_PER_VERSION,
  normalizeCondition,
  type TemplateItemFields,
  uniqueItemKey,
} from "@marktwerk/core";
import {
  checklistTemplate,
  dutyRole,
  eventPreset,
  eventPresetTemplate,
  eventType,
  templateItem,
  templateVersion,
} from "@marktwerk/db/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

export type TemplateError =
  | ItemIssueCode
  | "not_found"
  | "invalid_name"
  | "invalid_description"
  | "invalid_type"
  | "version_not_found"
  | "item_not_found"
  | "not_draft"
  | "draft_exists"
  | "empty"
  | "no_changes"
  | "too_many_items"
  | "invalid_role"
  | "invalid_preset"
  | "invalid_dependency"
  | "dependency_cycle"
  | "invalid_note"
  | "invalid_input";

/** `field` names the item field (or "name", "type") the error belongs to; `key` the item. */
export class TemplateInputError extends Error {
  constructor(
    readonly code: TemplateError,
    readonly field?: string,
    readonly key?: string,
  ) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;
export const TEMPLATE_NAME_MAX = 120;
export const TEMPLATE_DESCRIPTION_MAX = 1000;
export const CHANGE_NOTE_MAX = 500;
/** At most this many presets can be linked to one template. */
const MAX_PRESET_LINKS = 100;

type ItemRow = typeof templateItem.$inferSelect;

/** The editable fields of a stored item. */
export function itemFields(row: ItemRow): TemplateItemFields {
  return {
    title: row.title,
    description: row.description,
    phase: row.phase,
    category: row.category,
    anchorKey: row.anchorKey,
    offsetDays: row.offsetDays,
    dayMode: row.dayMode,
    dueTime: clockTime(row.dueTime),
    dutyRoleId: row.dutyRoleId,
    priority: row.priority,
    estimateMinutes: row.estimateMinutes,
    requiresPhoto: row.requiresPhoto,
    requiresNote: row.requiresNote,
    requiresAttachment: row.requiresAttachment,
    checkItems: row.checkItems,
    approverDutyRoleId: row.approverDutyRoleId,
    dependsOnKeys: row.dependsOnKeys,
    condition: row.condition ?? null,
  };
}

function assertShape(input: TemplateItemFields) {
  if (input === null || typeof input !== "object") throw new TemplateInputError("invalid_input");
}

/** Trims text, drops blank sub-steps and duplicate keys; validation happens afterwards. */
function normalizeItem(input: TemplateItemFields): TemplateItemFields {
  assertShape(input);
  const text = (value: string | null) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed === "" ? null : trimmed;
  };
  return {
    ...input,
    title: typeof input.title === "string" ? input.title.trim().replace(/\s+/g, " ") : "",
    description: text(input.description),
    // An unparsable time stays as typed so that validation reports it.
    dueTime:
      input.dueTime === null || input.dueTime === ""
        ? null
        : (clockTime(input.dueTime) ?? input.dueTime),
    checkItems: Array.isArray(input.checkItems)
      ? input.checkItems.map((c) => (typeof c === "string" ? c.trim() : c)).filter((c) => c !== "")
      : input.checkItems,
    dependsOnKeys: Array.isArray(input.dependsOnKeys) ? [...new Set(input.dependsOnKeys)] : [],
    dutyRoleId: input.dutyRoleId || null,
    approverDutyRoleId: input.approverDutyRoleId || null,
    condition: input.condition ? normalizeCondition(input.condition) : null,
  };
}

function checkFields(input: TemplateItemFields, key?: string) {
  const [issue] = checkTemplateItem(input);
  if (issue) throw new TemplateInputError(issue.code, issue.field, key);
}

async function checkRoles(tx: Tx, ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return;
  if (!wanted.every((id) => UUID.test(id))) throw new TemplateInputError("invalid_role");
  const found = await tx
    .select({ id: dutyRole.id })
    .from(dutyRole)
    .where(inArray(dutyRole.id, wanted));
  if (found.length !== wanted.length) throw new TemplateInputError("invalid_role");
}

/** Dependencies of one item against the other items of the version (unknown targets, loops). */
function checkItemDependencies(
  items: { stableKey: string; dependsOnKeys: readonly string[] }[],
  key?: string,
) {
  const [issue] = checkDependencies(items);
  if (!issue) return;
  if (issue.code === "dependency_cycle")
    throw new TemplateInputError("dependency_cycle", "dependsOnKeys", issue.key);
  throw new TemplateInputError("invalid_dependency", "dependsOnKeys", key ?? issue.key);
}

// ---------------------------------------------------------------------------------------------
// Templates

export type TemplateInput = {
  name: string;
  description: string | null;
  eventTypeId: string | null;
};

async function checkTemplateInput(tx: Tx, input: TemplateInput, currentTypeId?: string | null) {
  if (input === null || typeof input !== "object") throw new TemplateInputError("invalid_input");
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (name === "" || name.length > TEMPLATE_NAME_MAX)
    throw new TemplateInputError("invalid_name", "name");
  const description =
    typeof input.description === "string" && input.description.trim() !== ""
      ? input.description.trim()
      : null;
  if (description !== null && description.length > TEMPLATE_DESCRIPTION_MAX)
    throw new TemplateInputError("invalid_description", "description");
  let eventTypeId: string | null = null;
  if (input.eventTypeId) {
    const [type] = UUID.test(input.eventTypeId)
      ? await tx
          .select({ id: eventType.id, archivedAt: eventType.archivedAt })
          .from(eventType)
          .where(eq(eventType.id, input.eventTypeId))
      : [];
    if (!type || (type.archivedAt && type.id !== currentTypeId))
      throw new TemplateInputError("invalid_type", "type");
    eventTypeId = type.id;
  }
  return { name, description, eventTypeId };
}

async function lockTemplate(tx: Tx, id: string, options: { archived?: boolean } = {}) {
  if (!UUID.test(id)) throw new TemplateInputError("not_found");
  const [row] = await tx
    .select()
    .from(checklistTemplate)
    .where(eq(checklistTemplate.id, id))
    .for("update");
  if (!row || (row.archivedAt && !options.archived)) throw new TemplateInputError("not_found");
  return row;
}

/** "Neue Ablaufvorlage": the template and an empty first draft. */
export async function createTemplate(
  actor: Actor,
  input: TemplateInput,
): Promise<{ id: string; versionId: string }> {
  if (!can(actor.role, "template", "write")) forbidden();
  return db.transaction(async (tx) => {
    const fields = await checkTemplateInput(tx, input);
    const [created] = await tx
      .insert(checklistTemplate)
      .values({ kind: "event", ...fields })
      .returning({ id: checklistTemplate.id });
    if (!created) throw new Error("insert failed");
    const [version] = await tx
      .insert(templateVersion)
      .values({ templateId: created.id, version: 1, status: "draft" })
      .returning({ id: templateVersion.id });
    if (!version) throw new Error("insert failed");
    await audit(tx, actor.id, [
      {
        action: "template.create",
        entityType: "checklist_template",
        entityId: created.id,
        diff: { name: fields.name, eventTypeId: fields.eventTypeId },
      },
    ]);
    return { id: created.id, versionId: version.id };
  });
}

/** Name, description and event type of a template (not its content: that lives in versions). */
export async function updateTemplate(
  actor: Actor,
  id: string,
  input: TemplateInput,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "template", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockTemplate(tx, id);
    const next = await checkTemplateInput(tx, input, current.eventTypeId);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (next.name !== current.name) changes.name = { from: current.name, to: next.name };
    if (next.description !== current.description)
      changes.description = { from: current.description, to: next.description };
    if (next.eventTypeId !== current.eventTypeId)
      changes.eventTypeId = { from: current.eventTypeId, to: next.eventTypeId };
    if (Object.keys(changes).length === 0) return { changed: false };
    await tx.update(checklistTemplate).set(next).where(eq(checklistTemplate.id, id));
    await audit(tx, actor.id, [
      {
        action: "template.update",
        entityType: "checklist_template",
        entityId: id,
        diff: { changes },
      },
    ]);
    return { changed: true };
  });
}

/** Archives (or restores) a template. Archived templates are no longer instantiated or listed. */
export async function setTemplateArchived(
  actor: Actor,
  id: string,
  archived: boolean,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "template", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockTemplate(tx, id, { archived: true });
    if (Boolean(current.archivedAt) === archived) return { changed: false };
    await tx
      .update(checklistTemplate)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(checklistTemplate.id, id));
    await audit(tx, actor.id, [
      {
        action: archived ? "template.archive" : "template.restore",
        entityType: "checklist_template",
        entityId: id,
        diff: { name: current.name },
      },
    ]);
    return { changed: true };
  });
}

// ---------------------------------------------------------------------------------------------
// Versions

/** The draft of a version id, locked; everything that edits items goes through this. */
async function lockDraft(tx: Tx, versionId: string) {
  if (!UUID.test(versionId)) throw new TemplateInputError("version_not_found");
  const [version] = await tx
    .select()
    .from(templateVersion)
    .where(eq(templateVersion.id, versionId))
    .for("update");
  if (!version) throw new TemplateInputError("version_not_found");
  const template = await lockTemplate(tx, version.templateId);
  // Published versions are immutable (data model principle): only the draft is edited.
  if (version.status !== "draft") throw new TemplateInputError("not_draft");
  return { version, template };
}

/**
 * "Entwurf anlegen": a new draft version, a copy of the newest published version (or empty for a new
 * template). There is at most one draft per template (database index).
 */
export async function createDraft(
  actor: Actor,
  templateId: string,
): Promise<{ versionId: string; version: number }> {
  if (!can(actor.role, "template", "write")) forbidden();
  return db.transaction(async (tx) => {
    const template = await lockTemplate(tx, templateId);
    const versions = await tx
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.templateId, template.id))
      .orderBy(desc(templateVersion.version));
    if (versions.some((v) => v.status === "draft")) throw new TemplateInputError("draft_exists");
    const base = versions.find((v) => v.status === "published") ?? versions[0];
    const number = (versions[0]?.version ?? 0) + 1;
    const [draft] = await tx
      .insert(templateVersion)
      .values({ templateId: template.id, version: number, status: "draft" })
      .returning({ id: templateVersion.id });
    if (!draft) throw new Error("insert failed");
    let copied = 0;
    if (base) {
      const items = await tx
        .select()
        .from(templateItem)
        .where(eq(templateItem.versionId, base.id))
        .orderBy(asc(templateItem.sort));
      if (items.length > 0) {
        await tx.insert(templateItem).values(
          items.map(({ id: _id, versionId: _version, createdAt: _c, updatedAt: _u, ...rest }) => ({
            ...rest,
            versionId: draft.id,
          })),
        );
        copied = items.length;
      }
    }
    await audit(tx, actor.id, [
      {
        action: "template.draft",
        entityType: "template_version",
        entityId: draft.id,
        diff: {
          templateId: template.id,
          version: number,
          copiedFrom: base?.version ?? null,
          items: copied,
        },
      },
    ]);
    return { versionId: draft.id, version: number };
  });
}

/** "Entwurf verwerfen": deletes the draft with its items. Published versions are never deleted. */
export async function discardDraft(
  actor: Actor,
  versionId: string,
): Promise<{ templateId: string }> {
  if (!can(actor.role, "template", "write")) forbidden();
  return db.transaction(async (tx) => {
    const { version } = await lockDraft(tx, versionId);
    await tx.delete(templateVersion).where(eq(templateVersion.id, version.id));
    await audit(tx, actor.id, [
      {
        action: "template.draft_discard",
        entityType: "template_version",
        entityId: version.id,
        diff: { templateId: version.templateId, version: version.version },
      },
    ]);
    return { templateId: version.templateId };
  });
}

/** What makes two versions "the same": items in order, all fields. */
const signature = (rows: ItemRow[]) =>
  JSON.stringify(
    [...rows]
      .sort((a, b) => a.sort - b.sort)
      .map((r) => ({ key: r.stableKey, ...itemFields(r), dueTime: clockTime(r.dueTime) })),
  );

/**
 * "Veröffentlichen": the draft becomes the published version (immutable from now on) and the previously
 * published version is retired. Changes nothing at existing events (they only get it through "Auf
 * Veranstaltungen anwenden…"). Needs at least one item and a difference to the published version.
 */
export async function publishDraft(
  actor: Actor,
  versionId: string,
  changeNote?: string | null,
): Promise<{ templateId: string; version: number; retired: number | null }> {
  if (!can(actor.role, "template", "write")) forbidden();
  const note =
    typeof changeNote === "string" && changeNote.trim() !== "" ? changeNote.trim() : null;
  if (note !== null && note.length > CHANGE_NOTE_MAX) throw new TemplateInputError("invalid_note");

  return db.transaction(async (tx) => {
    const { version, template } = await lockDraft(tx, versionId);
    const items = await tx
      .select()
      .from(templateItem)
      .where(eq(templateItem.versionId, version.id))
      .orderBy(asc(templateItem.sort));
    if (items.length === 0) throw new TemplateInputError("empty");
    for (const item of items) {
      checkFields(itemFields(item), item.stableKey);
    }
    await checkRoles(
      tx,
      items.flatMap((i) => [i.dutyRoleId, i.approverDutyRoleId]),
    );
    checkItemDependencies(items);

    const [published] = await tx
      .select()
      .from(templateVersion)
      .where(
        and(eq(templateVersion.templateId, template.id), eq(templateVersion.status, "published")),
      );
    if (published) {
      const before = await tx
        .select()
        .from(templateItem)
        .where(eq(templateItem.versionId, published.id));
      if (signature(before) === signature(items)) throw new TemplateInputError("no_changes");
      await tx
        .update(templateVersion)
        .set({ status: "retired" })
        .where(eq(templateVersion.id, published.id));
    }
    await tx
      .update(templateVersion)
      .set({
        status: "published",
        publishedAt: new Date(),
        publishedById: actor.staffMemberId,
        changeNote: note,
      })
      .where(eq(templateVersion.id, version.id));
    await audit(tx, actor.id, [
      {
        action: "template.publish",
        entityType: "template_version",
        entityId: version.id,
        diff: {
          templateId: template.id,
          templateName: template.name,
          version: version.version,
          items: items.length,
          retiredVersion: published?.version ?? null,
          ...(note ? { changeNote: note } : {}),
        },
      },
    ]);
    return {
      templateId: template.id,
      version: version.version,
      retired: published?.version ?? null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Items of the draft

/** Writes `sort` 0…n-1 in the given order (only rows whose position changed). */
async function resequence(tx: Tx, versionId: string, orderedIds: string[]) {
  const rows = await tx
    .select({ id: templateItem.id, sort: templateItem.sort })
    .from(templateItem)
    .where(eq(templateItem.versionId, versionId));
  const current = new Map(rows.map((r) => [r.id, r.sort]));
  for (const [index, id] of orderedIds.entries()) {
    if (current.get(id) !== index)
      await tx.update(templateItem).set({ sort: index }).where(eq(templateItem.id, id));
  }
}

const itemsOf = (tx: Tx, versionId: string) =>
  tx
    .select()
    .from(templateItem)
    .where(eq(templateItem.versionId, versionId))
    .orderBy(asc(templateItem.sort), asc(templateItem.createdAt));

async function lockItem(tx: Tx, versionId: string, key: string) {
  const [row] = await tx
    .select()
    .from(templateItem)
    .where(and(eq(templateItem.versionId, versionId), eq(templateItem.stableKey, key)))
    .for("update");
  if (!row) throw new TemplateInputError("item_not_found", undefined, key);
  return row;
}

/**
 * New row in the draft, after `afterKey` (at the end if omitted or unknown). The stable key comes from
 * the title and identifies the item across versions.
 */
export async function addTemplateItem(
  actor: Actor,
  versionId: string,
  input: TemplateItemFields,
  afterKey?: string | null,
): Promise<{ key: string }> {
  if (!can(actor.role, "template", "write")) forbidden();
  const fields = normalizeItem(input);
  checkFields(fields);
  return db.transaction(async (tx) => {
    const { version } = await lockDraft(tx, versionId);
    const items = await itemsOf(tx, version.id);
    if (items.length >= MAX_ITEMS_PER_VERSION) throw new TemplateInputError("too_many_items");
    await checkRoles(tx, [fields.dutyRoleId, fields.approverDutyRoleId]);
    const key = uniqueItemKey(fields.title, new Set(items.map((i) => i.stableKey)));
    checkItemDependencies([
      ...items.map((i) => ({ stableKey: i.stableKey, dependsOnKeys: i.dependsOnKeys })),
      { stableKey: key, dependsOnKeys: fields.dependsOnKeys },
    ]);
    const [row] = await tx
      .insert(templateItem)
      .values({
        versionId: version.id,
        stableKey: key,
        sort: items.length,
        ...fields,
        dueTime: fields.dueTime,
      })
      .returning({ id: templateItem.id });
    if (!row) throw new Error("insert failed");
    const order = items.map((i) => i.id);
    const at = afterKey ? items.findIndex((i) => i.stableKey === afterKey) : -1;
    order.splice(at >= 0 ? at + 1 : order.length, 0, row.id);
    await resequence(tx, version.id, order);
    await audit(tx, actor.id, [
      {
        action: "template.item_add",
        entityType: "template_version",
        entityId: version.id,
        diff: { version: version.version, key, title: fields.title },
      },
    ]);
    return { key };
  });
}

/** Changes one row of the draft. The stable key never changes (it ties the item to its tasks). */
export async function updateTemplateItem(
  actor: Actor,
  versionId: string,
  key: string,
  input: TemplateItemFields,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "template", "write")) forbidden();
  const fields = normalizeItem(input);
  checkFields(fields, key);
  return db.transaction(async (tx) => {
    const { version } = await lockDraft(tx, versionId);
    const row = await lockItem(tx, version.id, key);
    await checkRoles(tx, [fields.dutyRoleId, fields.approverDutyRoleId]);
    const items = await itemsOf(tx, version.id);
    checkItemDependencies(
      items.map((i) => ({
        stableKey: i.stableKey,
        dependsOnKeys: i.stableKey === key ? fields.dependsOnKeys : i.dependsOnKeys,
      })),
      key,
    );
    const before = itemFields(row);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of Object.keys(fields) as (keyof TemplateItemFields)[]) {
      if (JSON.stringify(before[field]) !== JSON.stringify(fields[field]))
        changes[field] = { from: before[field], to: fields[field] };
    }
    if (Object.keys(changes).length === 0) return { changed: false };
    await tx.update(templateItem).set(fields).where(eq(templateItem.id, row.id));
    await audit(tx, actor.id, [
      {
        action: "template.item_update",
        entityType: "template_version",
        entityId: version.id,
        diff: { version: version.version, key, title: fields.title, changes },
      },
    ]);
    return { changed: true };
  });
}

/** Removes a row from the draft; other rows no longer depend on it. */
export async function deleteTemplateItem(
  actor: Actor,
  versionId: string,
  key: string,
): Promise<{ title: string }> {
  if (!can(actor.role, "template", "write")) forbidden();
  return db.transaction(async (tx) => {
    const { version } = await lockDraft(tx, versionId);
    const row = await lockItem(tx, version.id, key);
    await tx.delete(templateItem).where(eq(templateItem.id, row.id));
    const rest = await itemsOf(tx, version.id);
    for (const item of rest) {
      if (item.dependsOnKeys.includes(key))
        await tx
          .update(templateItem)
          .set({ dependsOnKeys: item.dependsOnKeys.filter((k) => k !== key) })
          .where(eq(templateItem.id, item.id));
    }
    await resequence(
      tx,
      version.id,
      rest.map((i) => i.id),
    );
    await audit(tx, actor.id, [
      {
        action: "template.item_delete",
        entityType: "template_version",
        entityId: version.id,
        diff: { version: version.version, key, title: row.title },
      },
    ]);
    return { title: row.title };
  });
}

/** Moves a row one position up or down ("Nach oben/unten"). */
export async function moveTemplateItem(
  actor: Actor,
  versionId: string,
  key: string,
  direction: "up" | "down",
): Promise<{ moved: boolean }> {
  if (!can(actor.role, "template", "write")) forbidden();
  if (direction !== "up" && direction !== "down") throw new TemplateInputError("invalid_input");
  return db.transaction(async (tx) => {
    const { version } = await lockDraft(tx, versionId);
    const items = await itemsOf(tx, version.id);
    const index = items.findIndex((i) => i.stableKey === key);
    if (index < 0) throw new TemplateInputError("item_not_found", undefined, key);
    // The editor shows rows grouped by phase, so "one up" means past the next row of the same phase.
    const step = direction === "up" ? -1 : 1;
    let target = index + step;
    while (items[target] && items[target]?.phase !== items[index]?.phase) target += step;
    if (!items[target]) return { moved: false };
    const order = items.map((i) => i.id);
    const [moving] = order.splice(index, 1);
    order.splice(target, 0, moving as string);
    await resequence(tx, version.id, order);
    await audit(tx, actor.id, [
      {
        action: "template.item_move",
        entityType: "template_version",
        entityId: version.id,
        diff: { version: version.version, key, direction },
      },
    ]);
    return { moved: true };
  });
}

/** Copy of a row right below it ("Duplizieren"); the title gets " (Kopie)", the key a fresh suffix. */
export async function duplicateTemplateItem(
  actor: Actor,
  versionId: string,
  key: string,
): Promise<{ key: string }> {
  if (!can(actor.role, "template", "write")) forbidden();
  return db.transaction(async (tx) => {
    const { version } = await lockDraft(tx, versionId);
    const items = await itemsOf(tx, version.id);
    if (items.length >= MAX_ITEMS_PER_VERSION) throw new TemplateInputError("too_many_items");
    const row = items.find((i) => i.stableKey === key);
    if (!row) throw new TemplateInputError("item_not_found", undefined, key);
    const title = `${row.title} (Kopie)`.slice(0, 200);
    const copyKey = uniqueItemKey(row.title, new Set(items.map((i) => i.stableKey)));
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row;
    const [copy] = await tx
      .insert(templateItem)
      .values({ ...rest, stableKey: copyKey, title, sort: items.length })
      .returning({ id: templateItem.id });
    if (!copy) throw new Error("insert failed");
    const order = items.map((i) => i.id);
    order.splice(items.indexOf(row) + 1, 0, copy.id);
    await resequence(tx, version.id, order);
    await audit(tx, actor.id, [
      {
        action: "template.item_add",
        entityType: "template_version",
        entityId: version.id,
        diff: { version: version.version, key: copyKey, title, duplicateOf: key },
      },
    ]);
    return { key: copyKey };
  });
}

// ---------------------------------------------------------------------------------------------
// Links to event presets ("gilt für Vorlagen: …")

/**
 * Which event presets instantiate this template. Replaces the links of this template; links of the
 * presets to other templates stay. New links go last in the preset's order. Only affects events created
 * from now on.
 */
export async function setTemplatePresets(
  actor: Actor,
  templateId: string,
  presetIds: string[],
): Promise<{ added: number; removed: number }> {
  if (!can(actor.role, "template", "write")) forbidden();
  if (!Array.isArray(presetIds) || presetIds.length > MAX_PRESET_LINKS)
    throw new TemplateInputError("invalid_preset");
  const wanted = [...new Set(presetIds)];
  if (!wanted.every((id) => typeof id === "string" && UUID.test(id)))
    throw new TemplateInputError("invalid_preset");

  return db.transaction(async (tx) => {
    const template = await lockTemplate(tx, templateId);
    if (template.kind !== "event") throw new TemplateInputError("invalid_input");
    if (wanted.length > 0) {
      const found = await tx
        .select({ id: eventPreset.id })
        .from(eventPreset)
        .where(and(inArray(eventPreset.id, wanted), isNull(eventPreset.archivedAt)));
      if (found.length !== wanted.length) throw new TemplateInputError("invalid_preset");
    }
    const existing = await tx
      .select({ presetId: eventPresetTemplate.presetId })
      .from(eventPresetTemplate)
      .where(eq(eventPresetTemplate.templateId, template.id));
    const have = new Set(existing.map((e) => e.presetId));
    const toAdd = wanted.filter((id) => !have.has(id));
    const toRemove = [...have].filter((id) => !wanted.includes(id));
    if (toAdd.length === 0 && toRemove.length === 0) return { added: 0, removed: 0 };
    if (toRemove.length > 0)
      await tx
        .delete(eventPresetTemplate)
        .where(
          and(
            eq(eventPresetTemplate.templateId, template.id),
            inArray(eventPresetTemplate.presetId, toRemove),
          ),
        );
    for (const presetId of toAdd) {
      const siblings = await tx
        .select({ sort: eventPresetTemplate.sort })
        .from(eventPresetTemplate)
        .where(eq(eventPresetTemplate.presetId, presetId));
      await tx.insert(eventPresetTemplate).values({
        presetId,
        templateId: template.id,
        sort: siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.sort)) + 1,
      });
    }
    await audit(tx, actor.id, [
      {
        action: "template.presets",
        entityType: "checklist_template",
        entityId: template.id,
        diff: { added: toAdd, removed: toRemove },
      },
    ]);
    return { added: toAdd.length, removed: toRemove.length };
  });
}
