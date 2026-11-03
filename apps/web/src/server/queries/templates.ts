import "server-only";
import {
  checklistTemplate,
  dutyRole,
  eventPreset,
  eventPresetTemplate,
  eventType,
  templateItem,
  templateVersion,
} from "@marktwerk/db/schema";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";

const UUID = /^[0-9a-f-]{36}$/i;

export type TemplateVersionInfo = {
  id: string;
  version: number;
  status: "draft" | "published" | "retired";
  publishedAt: Date | null;
  changeNote: string | null;
  itemCount: number;
};

async function versionsOf(templateIds: string[]): Promise<Map<string, TemplateVersionInfo[]>> {
  const result = new Map<string, TemplateVersionInfo[]>();
  if (templateIds.length === 0) return result;
  const versions = await db
    .select({
      id: templateVersion.id,
      templateId: templateVersion.templateId,
      version: templateVersion.version,
      status: templateVersion.status,
      publishedAt: templateVersion.publishedAt,
      changeNote: templateVersion.changeNote,
    })
    .from(templateVersion)
    .where(inArray(templateVersion.templateId, templateIds))
    .orderBy(desc(templateVersion.version));
  const counts = await db
    .select({ versionId: templateItem.versionId, n: count() })
    .from(templateItem)
    .where(
      inArray(
        templateItem.versionId,
        versions.map((v) => v.id),
      ),
    )
    .groupBy(templateItem.versionId);
  const countOf = new Map(counts.map((c) => [c.versionId, c.n]));
  for (const v of versions) {
    const list = result.get(v.templateId) ?? [];
    list.push({ ...v, itemCount: countOf.get(v.id) ?? 0 });
    result.set(v.templateId, list);
  }
  return result;
}

/** Presets that instantiate each template (not archived ones). */
async function linkedPresets(templateIds: string[]) {
  const result = new Map<string, { id: string; name: string; active: boolean }[]>();
  if (templateIds.length === 0) return result;
  const rows = await db
    .select({
      templateId: eventPresetTemplate.templateId,
      id: eventPreset.id,
      name: eventPreset.name,
      active: eventPreset.active,
    })
    .from(eventPresetTemplate)
    .innerJoin(eventPreset, eq(eventPreset.id, eventPresetTemplate.presetId))
    .where(
      and(inArray(eventPresetTemplate.templateId, templateIds), isNull(eventPreset.archivedAt)),
    )
    .orderBy(asc(eventPreset.name));
  for (const r of rows) {
    const list = result.get(r.templateId) ?? [];
    list.push({ id: r.id, name: r.name, active: r.active });
    result.set(r.templateId, list);
  }
  return result;
}

/**
 * "Weitere Ablaufvorlagen" in the Bibliothek: the per-type timeline templates with their published
 * version, draft and presets. Not the master and not the markets' own copies (those are listed with
 * the master and the markets).
 */
export async function listEventTemplates() {
  const templates = await db
    .select({
      id: checklistTemplate.id,
      name: checklistTemplate.name,
      description: checklistTemplate.description,
      typeKey: eventType.key,
      typeNameDe: eventType.nameDe,
      typeNameEn: eventType.nameEn,
    })
    .from(checklistTemplate)
    .leftJoin(eventType, eq(eventType.id, checklistTemplate.eventTypeId))
    .where(
      and(
        eq(checklistTemplate.kind, "event"),
        eq(checklistTemplate.isMaster, false),
        isNull(checklistTemplate.ownerPresetId),
        isNull(checklistTemplate.archivedAt),
      ),
    )
    .orderBy(asc(checklistTemplate.name));
  const ids = templates.map((t) => t.id);
  const [versions, presets] = await Promise.all([versionsOf(ids), linkedPresets(ids)]);
  return templates.map((t) => {
    const own = versions.get(t.id) ?? [];
    return {
      ...t,
      published: own.find((v) => v.status === "published") ?? null,
      draft: own.find((v) => v.status === "draft") ?? null,
      versionCount: own.length,
      presets: presets.get(t.id) ?? [],
    };
  });
}

export type EventTemplateRow = Awaited<ReturnType<typeof listEventTemplates>>[number];

/** The master event template ("Grundvorlage") with its versions; null if there is none yet. */
export async function getMasterTemplate() {
  const [row] = await db
    .select({ id: checklistTemplate.id, name: checklistTemplate.name })
    .from(checklistTemplate)
    .where(and(eq(checklistTemplate.isMaster, true), isNull(checklistTemplate.archivedAt)));
  if (!row) return null;
  const versions = (await versionsOf([row.id])).get(row.id) ?? [];
  return {
    ...row,
    published: versions.find((v) => v.status === "published") ?? null,
    draft: versions.find((v) => v.status === "draft") ?? null,
  };
}

/** One template with all its versions (newest first) and the presets it is linked to. */
export async function getTemplateForEditor(id: string) {
  if (!UUID.test(id)) return null;
  const [template] = await db
    .select({
      id: checklistTemplate.id,
      name: checklistTemplate.name,
      description: checklistTemplate.description,
      kind: checklistTemplate.kind,
      isMaster: checklistTemplate.isMaster,
      ownerPresetId: checklistTemplate.ownerPresetId,
      ownerPresetName: eventPreset.name,
      eventTypeId: checklistTemplate.eventTypeId,
      typeKey: eventType.key,
      typeNameDe: eventType.nameDe,
      typeNameEn: eventType.nameEn,
      updatedAt: checklistTemplate.updatedAt,
    })
    .from(checklistTemplate)
    .leftJoin(eventType, eq(eventType.id, checklistTemplate.eventTypeId))
    .leftJoin(eventPreset, eq(eventPreset.id, checklistTemplate.ownerPresetId))
    .where(and(eq(checklistTemplate.id, id), isNull(checklistTemplate.archivedAt)));
  if (!template) return null;
  const [versions, presets] = await Promise.all([versionsOf([id]), linkedPresets([id])]);
  return { ...template, versions: versions.get(id) ?? [], presets: presets.get(id) ?? [] };
}

export type TemplateEditorData = NonNullable<Awaited<ReturnType<typeof getTemplateForEditor>>>;

/** The items of a version in order. */
export async function getVersionItems(versionId: string) {
  return db
    .select()
    .from(templateItem)
    .where(eq(templateItem.versionId, versionId))
    .orderBy(asc(templateItem.sort), asc(templateItem.createdAt));
}

export type VersionItem = Awaited<ReturnType<typeof getVersionItems>>[number];

/** Choices for the item editor and the preset links. */
export async function getTemplateOptions() {
  const [roles, types, presets] = await Promise.all([
    db
      .select({
        id: dutyRole.id,
        key: dutyRole.key,
        nameDe: dutyRole.nameDe,
        nameEn: dutyRole.nameEn,
      })
      .from(dutyRole)
      .orderBy(asc(dutyRole.sort), asc(dutyRole.nameDe)),
    db
      .select({
        id: eventType.id,
        key: eventType.key,
        nameDe: eventType.nameDe,
        nameEn: eventType.nameEn,
        archived: eventType.archivedAt,
      })
      .from(eventType)
      .orderBy(asc(eventType.sort), asc(eventType.nameDe)),
    db
      .select({
        id: eventPreset.id,
        name: eventPreset.name,
        active: eventPreset.active,
        typeKey: eventType.key,
        typeNameDe: eventType.nameDe,
        typeNameEn: eventType.nameEn,
      })
      .from(eventPreset)
      .innerJoin(eventType, eq(eventType.id, eventPreset.eventTypeId))
      .where(isNull(eventPreset.archivedAt))
      .orderBy(asc(eventType.sort), asc(eventPreset.name)),
  ]);
  return {
    roles,
    types: types.filter((t) => !t.archived),
    typesWithArchived: types,
    presets,
  };
}

export type TemplateOptions = Awaited<ReturnType<typeof getTemplateOptions>>;

/** How many existing markets there are (none follows the Grundvorlage; they all use templates of their own). */
export async function countExistingMarkets(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(eventPreset)
    .where(isNull(eventPreset.archivedAt));
  return row?.n ?? 0;
}

export type TemplateSummary = {
  version: number | null;
  itemCount: number;
  hasDraft: boolean;
};

/** Published version number and task count per template, for the market table in the Bibliothek. */
export async function getTemplateSummaries(ids: string[]): Promise<Map<string, TemplateSummary>> {
  const versions = await versionsOf([...new Set(ids)]);
  const result = new Map<string, TemplateSummary>();
  for (const [id, list] of versions) {
    const published = list.find((v) => v.status === "published");
    const draft = list.find((v) => v.status === "draft");
    const shown = published ?? draft;
    result.set(id, {
      version: published?.version ?? null,
      itemCount: shown?.itemCount ?? 0,
      hasDraft: draft !== undefined,
    });
  }
  return result;
}
