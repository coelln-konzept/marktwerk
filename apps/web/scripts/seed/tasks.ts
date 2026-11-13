/**
 * M2 seed, part 2: one checklist per event (made from its market's own template version) and the tasks in it.
 * Subtasks (ADR 0021, `parent_task_id`) are inserted after all top-level tasks: the one-level trigger and the
 * foreign key then always find the parent. Checklist ids are derived from event + template, so re-running never
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

  const checklistId = (eventId: string, templateId: string) =>
    derivedId("checklist", `${eventId}:${templateId}`);
  const templateOf = (presetId: string) => {
    const template = templateById.get(templateIdByPresetId.get(presetId) ?? "");
    if (!template) throw new Error(`Preset ${presetId}: no task template`);
    return template;
  };

  const checklists = data.events.map((event) => {
    const template = templateOf(event.presetId);
    return {
      id: checklistId(event.id, template.id),
      eventId: event.id,
      templateId: template.id,
      templateVersionId: templateVersionId(template.id),
      name: template.name,
    };
  });
  await insertAll(tx, schema.checklist, checklists, "checklists");

  const presetIdByEventId = new Map(data.events.map((e) => [e.id, e.presetId]));
  const rows = data.tasks.map((task) => {
    const template = templateOf(presetIdByEventId.get(task.eventId) ?? "");
    return {
      id: task.id,
      eventId: task.eventId,
      checklistId: checklistId(task.eventId, template.id),
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
    };
  });
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
}
