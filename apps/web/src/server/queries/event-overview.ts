import "server-only";
import {
  berlinDay,
  can,
  type EventCountdown,
  eventCountdown,
  type KeyTaskRow,
  keyTasks,
  type MissingTask,
  missingPermits,
  missingTasks,
  type OverviewPermit,
  type OverviewTask,
  type PermitProgress,
  permitProgress,
  type TaskProgress,
  taskProgress,
} from "@marktwerk/core";
import { eventPermit, permit, task } from "@marktwerk/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import type { Actor } from "../actor";
import { db } from "../db";
import { visibleTasks } from "../task-scope";

export type EventOverview = {
  countdown: EventCountdown;
  /** Null when the actor may not read tasks. */
  tasks: {
    progress: TaskProgress;
    missing: MissingTask[];
    key: KeyTaskRow[];
  } | null;
  /** Null when the actor may not read permits. */
  permits: {
    progress: PermitProgress;
    missing: OverviewPermit[];
  } | null;
};

/**
 * Everything the event's Überblick needs in one go: the status line numbers, "Was fehlt" (tasks and
 * permits), the Kernaufgaben checklist. The selection rules are pure and live in `@marktwerk/core`
 * (`events/overview.ts`); this only loads the event's tasks (within the actor's row scope) and permits.
 */
export async function getEventOverview(
  actor: Actor,
  event: { id: string; startsOn: string; endsOn: string },
  today: string,
): Promise<EventOverview> {
  const [taskRows, permitRows] = await Promise.all([
    can(actor.role, "task", "read")
      ? db
          .select({
            id: task.id,
            title: task.title,
            status: task.status,
            dueAt: task.dueAt,
            isKey: task.isKey,
            snoozedUntil: task.snoozedUntil,
          })
          .from(task)
          .where(and(visibleTasks(actor), eq(task.eventId, event.id), ne(task.status, "cancelled")))
      : null,
    can(actor.role, "permit", "read")
      ? db
          .select({
            id: permit.id,
            title: permit.title,
            status: permit.status,
            applyBy: permit.applyBy,
            validUntil: permit.validUntil,
            required: eventPermit.required,
          })
          .from(eventPermit)
          .innerJoin(permit, eq(permit.id, eventPermit.permitId))
          .where(and(eq(eventPermit.eventId, event.id), isNull(permit.archivedAt)))
      : null,
  ]);

  const tasks: OverviewTask[] | null =
    taskRows?.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      dueOn: r.dueAt ? berlinDay(r.dueAt) : null,
      isKey: r.isKey,
      snoozedUntil: r.snoozedUntil,
    })) ?? null;

  return {
    countdown: eventCountdown(event, today),
    tasks: tasks && {
      progress: taskProgress(tasks),
      missing: missingTasks(tasks, today),
      key: keyTasks(tasks, today),
    },
    permits: permitRows && {
      progress: permitProgress(permitRows, event.startsOn, today, event.endsOn),
      missing: missingPermits(permitRows, event.startsOn, today, event.endsOn),
    },
  };
}
