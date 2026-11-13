/**
 * M2 seed, part 2: one checklist per event and one per Saison record (both made from the market's own template
 * version, as the instantiation path does: `checklist.event_id` or `checklist.season_id`) and the tasks in them.
 * Event tasks carry `event_id`, season tasks (the template's `season` items) `season_id` (research 13 §6).
 * Subtasks (ADR 0021, `parent_task_id`) are inserted after all top-level tasks: the one-level trigger and the
 * foreign key then always find the parent. Checklist ids are derived from owner + template, so re-running never
 * duplicates them. Comments are not part of the synthetic dataset.
 */

import { schema } from "@marktwerk/db";
import { ANCHOR_KEYS, derivedId, insertAll, instant, type SeedContext, type Tx } from "./shared";
import { templateVersionId } from "./templates";

export async function seedTasks(tx: Tx, { data }: SeedContext) {
  const templateById = new Map(data.checklistTemplates.map((t) => [t.id, t]));
  const templateIdByPresetId = new Map(data.eventPresets.map((p) => [p.id, p.checklistTemplateId]));
  const itemSort = new Map(
    data.checklistTemplates.flatMap((t) => t.items.map((item) => [item.id, item.sort] as const)),
  );

  const eventChecklistId = (eventId: string, templateId: string) =>
    derivedId("checklist", `${eventId}:${templateId}`);
  const seasonChecklistId = (seasonId: string, templateId: string) =>
    derivedId("checklist", `season:${seasonId}:${templateId}`);
  const templateOf = (presetId: string) => {
    const template = templateById.get(templateIdByPresetId.get(presetId) ?? "");
    if (!template) throw new Error(`Preset ${presetId}: no task template`);
    return template;
  };

  const checklist = (owner: { eventId: string } | { seasonId: string }, presetId: string) => {
    const template = templateOf(presetId);
    return {
      id:
        "eventId" in owner
          ? eventChecklistId(owner.eventId, template.id)
          : seasonChecklistId(owner.seasonId, template.id),
      ...owner,
      templateId: template.id,
      templateVersionId: templateVersionId(template.id),
      name: template.name,
    };
  };
  // A season gets a checklist only when its template has season items (as `instantiateTemplatesForSeasons`).
  const seasonsWithItems = data.eventSeasons.filter((s) =>
    templateOf(s.presetId).items.some((item) => item.scope === "season"),
  );
  await insertAll(
    tx,
    schema.checklist,
    [
      ...data.events.map((event) => checklist({ eventId: event.id }, event.presetId)),
      ...seasonsWithItems.map((season) => checklist({ seasonId: season.id }, season.presetId)),
    ],
    "checklists (events and seasons)",
  );

  const presetIdByEventId = new Map(data.events.map((e) => [e.id, e.presetId]));
  const presetIdBySeasonId = new Map(data.eventSeasons.map((s) => [s.id, s.presetId]));
  const checklistOf = (task: (typeof data.tasks)[number]): string => {
    if (task.seasonId !== null)
      return seasonChecklistId(
        task.seasonId,
        templateOf(presetIdBySeasonId.get(task.seasonId) ?? "").id,
      );
    if (task.eventId !== null)
      return eventChecklistId(
        task.eventId,
        templateOf(presetIdByEventId.get(task.eventId) ?? "").id,
      );
    throw new Error(`Task ${task.id} has neither an event nor a season`);
  };
  const rows = data.tasks.map((task) => ({
    id: task.id,
    eventId: task.eventId,
    seasonId: task.seasonId,
    checklistId: checklistOf(task),
    templateItemId: task.templateItemId,
    templateStableKey: task.templateStableKey,
    parentTaskId: task.parentTaskId,
    source: "template" as const,
    title: task.title,
    description: task.description,
    phase: task.phase,
    category: task.category,
    priority: task.priority,
    dutyRoleId: task.dutyRoleId,
    assigneeId: task.assigneeId,
    anchorKey: ANCHOR_KEYS[task.anchorKey],
    offsetDays: task.offsetDays,
    dayMode: "calendar" as const,
    dueAt: instant(task.dueAt),
    estimateMinutes: task.estimateMinutes,
    effortFeedback: task.effortFeedback,
    requiresPhoto: task.requiresPhoto,
    isKey: task.isKey,
    status: task.status,
    waitingReason: task.waitingReason,
    skippedReason: task.skippedReason,
    completedAt: instant(task.completedAt),
    completedByStaffMemberId: task.completedById,
    // Keeps the template order inside a kanban column until someone drags cards around.
    boardSort: itemSort.get(task.templateItemId) ?? 0,
    rolloverCount: task.rolloverCount,
    lastRolledAt: instant(task.lastRolledAt),
  }));
  const seasonTasks = rows.filter((row) => row.seasonId !== null).length;
  await insertAll(
    tx,
    schema.task,
    rows.filter((row) => row.parentTaskId === null),
    "tasks",
  );
  await insertAll(
    tx,
    schema.task,
    rows.filter((row) => row.parentTaskId !== null),
    "subtasks",
  );
  console.log(`  of them on Saison records (tasks and subtasks): ${seasonTasks}`);
}
