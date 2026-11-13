/**
 * M2 seed, part 1: task templates (research 13). The synthetic dataset has the one master template
 * ("Grundvorlage", `is_master`, linked to no market) and every market's own copy (`owner_preset_id`, as
 * `createMarket` makes them): the client's sheet for the markets that sent one, a copy of the Grundvorlage with
 * marked assumptions for the others. Each template gets one published `template_version` (id derived from the
 * template id) with its items; child items (`parent_key`, ADR 0021) are inserted after all parents, so the
 * `template_item_parent` foreign key always finds its parent. Every preset is linked to its own template.
 *
 * INTERIM season items (stable key `saison_…`, see packages/synthetic dictionaries/checklist-items.ts) are
 * ordinary items here: the database has no `scope` column until the Saison record exists.
 */

import { schema } from "@marktwerk/db";
import type { ChecklistTemplate } from "@marktwerk/synthetic";
import { ANCHOR_KEYS, derivedId, insertAll, type SeedContext, type Tx } from "./shared";

export const templateVersionId = (templateId: string) => derivedId("template_version", templateId);

const CHANGE_NOTES: Record<ChecklistTemplate["source"], string> = {
  master: "Erste Fassung: gemeinsamer Kern der Checklisten (synthetische Daten)",
  client_checklist: "Erste Fassung nach der Checkliste des Markts (synthetische Daten)",
  master_copy: "Kopie der Grundvorlage mit angenommenen Zusatzaufgaben (synthetische Daten)",
};

export async function seedTemplates(tx: Tx, { data, roleIdByKey }: SeedContext) {
  await insertAll(
    tx,
    schema.checklistTemplate,
    data.checklistTemplates.map((t) => ({
      id: t.id,
      kind: "event" as const,
      eventTypeId: t.eventTypeId,
      name: t.name,
      description: t.description,
      isMaster: t.isMaster,
      ownerPresetId: t.ownerPresetId,
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
      changeNote: CHANGE_NOTES[t.source],
    })),
    "template versions",
  );

  const items = data.checklistTemplates.flatMap((t) =>
    t.items.map((item) => ({
      id: item.id,
      versionId: templateVersionId(t.id),
      stableKey: item.stableKey,
      sort: item.sort,
      title: item.title,
      description: item.description,
      phase: item.phase,
      category: item.category,
      anchorKey: ANCHOR_KEYS[item.anchorKey],
      offsetDays: item.offsetDays,
      dayMode: "calendar" as const,
      dueTime: item.dueTime,
      // null on a child item = the parent's duty role (ADR 0021)
      dutyRoleId: item.dutyRoleKey ? (roleIdByKey.get(item.dutyRoleKey) ?? null) : null,
      priority: item.priority,
      estimateMinutes: item.estimateMinutes,
      requiresPhoto: item.requiresPhoto,
      isKey: item.isKey,
      permitType: item.permitType,
      parentKey: item.parentKey,
      ownDue: item.ownDue,
    })),
  );
  await insertAll(
    tx,
    schema.templateItem,
    items.filter((item) => item.parentKey === null),
    "template items",
  );
  await insertAll(
    tx,
    schema.templateItem,
    items.filter((item) => item.parentKey !== null),
    "template child items",
  );

  await insertAll(
    tx,
    schema.eventPresetTemplate,
    data.eventPresets.map((p) => ({ presetId: p.id, templateId: p.checklistTemplateId, sort: 0 })),
    "preset templates",
  );
}
