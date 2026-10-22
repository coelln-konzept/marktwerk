/**
 * M2 seed, part 1: timeline templates. The synthetic dataset has one published template per event type;
 * each becomes a `checklist_template` with one published `template_version` (id derived from the template
 * id) and its items, and every preset is linked to its template. On top comes the one master event template
 * ("Grundvorlage", client decision 2026-10-22): the items every event type's template has in common, so the
 * basic tasks of any market. Presets keep their links to the per-type templates; the master is linked to
 * no preset (new markets get their own copy of it, `createMarket`).
 */

import { schema } from "@marktwerk/db";
import { ANCHOR_KEYS, derivedId, insertAll, type SeedContext, type Tx } from "./shared";

export const templateVersionId = (templateId: string) => derivedId("template_version", templateId);

export const MASTER_TEMPLATE_ID = derivedId("checklist_template", "master");
export const MASTER_TEMPLATE_NAME = "Grundvorlage";

/**
 * The master's items: those whose stable key exists in the template of every event type (the synthetic
 * blueprints marked for all four types). Taken from the first template, in its order.
 */
export function masterItems(templates: SeedContext["data"]["checklistTemplates"]) {
  const [first, ...rest] = templates;
  if (!first) return [];
  const common = rest.map((t) => new Set(t.items.map((i) => i.stableKey)));
  return first.items
    .filter((item) => common.every((keys) => keys.has(item.stableKey)))
    .map((item, index) => ({ ...item, sort: index + 1 }));
}

export async function seedTemplates(tx: Tx, { data, roleIdByKey }: SeedContext) {
  await insertAll(
    tx,
    schema.checklistTemplate,
    data.checklistTemplates.map((t) => ({
      id: t.id,
      kind: "event" as const,
      eventTypeId: t.eventTypeId,
      name: t.name,
    })),
    "checklist templates",
  );

  await insertAll(
    tx,
    schema.templateVersion,
    data.checklistTemplates.map((t) => ({
      id: templateVersionId(t.id),
      templateId: t.id,
      version: t.version,
      status: t.status,
      publishedAt: new Date(`${t.publishedOn}T08:00:00Z`),
      changeNote: "Erste Fassung (synthetische Daten)",
    })),
    "template versions",
  );

  await insertAll(
    tx,
    schema.templateItem,
    data.checklistTemplates.flatMap((t) =>
      t.items.map((item) => ({
        id: item.id,
        versionId: templateVersionId(t.id),
        stableKey: item.stableKey,
        sort: item.sort,
        title: item.title,
        phase: item.phase,
        category: item.category,
        anchorKey: ANCHOR_KEYS[item.anchorKey],
        offsetDays: item.offsetDays,
        dayMode: "calendar" as const,
        dueTime: item.dueTime,
        dutyRoleId: roleIdByKey.get(item.dutyRoleKey) ?? null,
        priority: item.priority,
        estimateMinutes: item.estimateMinutes,
        requiresPhoto: item.requiresPhoto,
        isKey: item.isKey,
        permitType: item.permitType,
      })),
    ),
    "template items",
  );

  await insertAll(
    tx,
    schema.eventPresetTemplate,
    data.eventPresets.map((p) => ({ presetId: p.id, templateId: p.checklistTemplateId, sort: 0 })),
    "preset templates",
  );

  const master = masterItems(data.checklistTemplates);
  if (master.length === 0) return;
  const versionId = templateVersionId(MASTER_TEMPLATE_ID);
  await insertAll(
    tx,
    schema.checklistTemplate,
    [
      {
        id: MASTER_TEMPLATE_ID,
        kind: "event" as const,
        eventTypeId: null,
        name: MASTER_TEMPLATE_NAME,
        description: "Die Aufgaben, mit denen jeder Markt startet.",
        isMaster: true,
      },
    ],
    "master template",
  );
  await insertAll(
    tx,
    schema.templateVersion,
    [
      {
        id: versionId,
        templateId: MASTER_TEMPLATE_ID,
        version: 1,
        status: "published" as const,
        publishedAt: new Date("2026-01-15T08:00:00Z"),
        changeNote: "Erste Fassung (aus den Ablaufvorlagen abgeleitet)",
      },
    ],
    "master version",
  );
  await insertAll(
    tx,
    schema.templateItem,
    master.map((item) => ({
      id: derivedId("template_item", `master:${item.stableKey}`),
      versionId,
      stableKey: item.stableKey,
      sort: item.sort,
      title: item.title,
      phase: item.phase,
      category: item.category,
      anchorKey: ANCHOR_KEYS[item.anchorKey],
      offsetDays: item.offsetDays,
      dayMode: "calendar" as const,
      dueTime: item.dueTime,
      dutyRoleId: roleIdByKey.get(item.dutyRoleKey) ?? null,
      priority: item.priority,
      estimateMinutes: item.estimateMinutes,
      requiresPhoto: item.requiresPhoto,
      permitType: item.permitType,
    })),
    "master items",
  );
}
