/**
 * M2 seed, part 1: timeline templates. The synthetic dataset has one published template per event type;
 * each becomes a `checklist_template` with one published `template_version` (id derived from the template
 * id) and its items, and every preset is linked to its template.
 */

import { schema } from "@marktwerk/db";
import { ANCHOR_KEYS, derivedId, insertAll, type SeedContext, type Tx } from "./shared";

export const templateVersionId = (templateId: string) => derivedId("template_version", templateId);

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
}
