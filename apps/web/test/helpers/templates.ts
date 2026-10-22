import type { TemplateItemFields } from "@marktwerk/core";
import { eventPresetTemplate } from "@marktwerk/db/schema";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import {
  addTemplateItem,
  createTemplate,
  publishDraft,
  setTemplatePresets,
} from "@/server/services/templates";
import type { seedCatalogue } from "./fixtures";

export const baseItem = (patch: Partial<TemplateItemFields> = {}): TemplateItemFields => ({
  title: "Aufgabe",
  description: null,
  phase: "pre",
  category: "general",
  anchorKey: "event_day",
  offsetDays: -7,
  dayMode: "calendar",
  dueTime: null,
  dutyRoleId: null,
  priority: "normal",
  estimateMinutes: 15,
  requiresPhoto: false,
  requiresNote: false,
  requiresAttachment: false,
  isKey: false,
  checkItems: [],
  approverDutyRoleId: null,
  dependsOnKeys: [],
  condition: null,
  ...patch,
});

/** A small timeline: permit, posters (business days, 17:30), setup, settlement, and a Stadtfest-only item. */
export function flohmarktItems(cat: Awaited<ReturnType<typeof seedCatalogue>>) {
  return [
    baseItem({
      title: "Marktgenehmigung beantragen",
      category: "permits",
      offsetDays: -60,
      dutyRoleId: cat.roles.lead.id,
      estimateMinutes: 30,
      priority: "high",
      isKey: true,
      checkItems: ["Formular ausfüllen", "Gebühr prüfen"],
    }),
    baseItem({
      title: "Plakate aufhängen",
      category: "communication",
      offsetDays: -14,
      dayMode: "business",
      dueTime: "17:30",
      dutyRoleId: cat.roles.setup.id,
      dependsOnKeys: ["marktgenehmigung_beantragen"],
      requiresPhoto: true,
    }),
    baseItem({
      title: "Aufbau",
      phase: "live",
      anchorKey: "setup_day",
      offsetDays: 0,
      estimateMinutes: 120,
    }),
    baseItem({
      title: "Abrechnung",
      phase: "post",
      category: "finance",
      offsetDays: 3,
      dayMode: "business",
    }),
    baseItem({
      title: "Absperrung Stadtfest",
      condition: { eventTypeKeys: ["street_fair"] },
    }),
  ];
}

/**
 * A published template with the given items, linked to the given presets (default: none). Returns the
 * ids; the draft/publish route is the real service path, so the data is what the editor would produce.
 */
export async function seedPublishedTemplate(
  actor: Actor,
  items: TemplateItemFields[],
  options: { name?: string; presetIds?: string[]; eventTypeId?: string | null } = {},
) {
  const { id, versionId } = await createTemplate(actor, {
    name: options.name ?? "Ablauf Flohmarkt",
    description: null,
    eventTypeId: options.eventTypeId ?? null,
  });
  for (const item of items) await addTemplateItem(actor, versionId, item);
  await publishDraft(actor, versionId, "Erste Fassung");
  if (options.presetIds && options.presetIds.length > 0)
    await setTemplatePresets(actor, id, options.presetIds);
  return { templateId: id, versionId };
}

export const presetLinks = () => db.select().from(eventPresetTemplate);
