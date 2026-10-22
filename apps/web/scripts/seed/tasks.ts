/**
 * M2 seed, part 2: one checklist per event (made from the event type's template version) and the tasks
 * in it. Checklist ids are derived from event + template, so re-running never duplicates them. Comments,
 * check items, dependencies and watchers are not part of the synthetic dataset and stay empty.
 */

import { schema } from "@marktwerk/db";
import { ANCHOR_KEYS, derivedId, insertAll, instant, type SeedContext, type Tx } from "./shared";
import { templateVersionId } from "./templates";

export async function seedTasks(tx: Tx, { data }: SeedContext) {
  const templateByItemId = new Map(
    data.checklistTemplates.flatMap((t) => t.items.map((item) => [item.id, t] as const)),
  );
  const templateByTypeId = new Map(data.checklistTemplates.map((t) => [t.eventTypeId, t]));
  const itemSort = new Map(
    data.checklistTemplates.flatMap((t) => t.items.map((item) => [item.id, item.sort] as const)),
  );

  const checklistId = (eventId: string, templateId: string) =>
    derivedId("checklist", `${eventId}:${templateId}`);

  const checklists = data.events.flatMap((event) => {
    const template = templateByTypeId.get(event.eventTypeId);
    if (!template) return [];
    return [
      {
        id: checklistId(event.id, template.id),
        eventId: event.id,
        templateId: template.id,
        templateVersionId: templateVersionId(template.id),
        name: template.name,
      },
    ];
  });
  await insertAll(tx, schema.checklist, checklists, "checklists");

  await insertAll(
    tx,
    schema.task,
    data.tasks.map((task) => {
      const template = templateByItemId.get(task.templateItemId);
      if (!template) throw new Error(`Task ${task.id}: unknown template item`);
      return {
        id: task.id,
        eventId: task.eventId,
        checklistId: checklistId(task.eventId, template.id),
        templateItemId: task.templateItemId,
        templateStableKey: task.templateStableKey,
        source: "template" as const,
        title: task.title,
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
    }),
    "tasks",
  );
}
