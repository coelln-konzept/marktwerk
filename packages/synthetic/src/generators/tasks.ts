import { REFERENCE_DATE } from "../constants";
import { CHECKLIST_ITEM_BLUEPRINTS } from "../dictionaries/checklist-items";
import { addDays, berlinInstant } from "../lib/dates";
import type { Rng } from "../lib/rng";
import type {
  AnchorKey,
  ChecklistTemplate,
  EffortFeedback,
  Event,
  EventAnchor,
  EventType,
  Task,
  TaskStatus,
  TemplateItem,
} from "../types";

/** Share of past tasks left open on purpose (overdue, carried over). The rest is done or skipped. */
export const OVERDUE_SAMPLE_SHARE = 0.05;

export function buildChecklistTemplates(rng: Rng, eventTypes: EventType[]): ChecklistTemplate[] {
  return eventTypes.map((type) => {
    const items: TemplateItem[] = CHECKLIST_ITEM_BLUEPRINTS.filter((blueprint) =>
      blueprint.appliesTo.includes(type.key),
    ).map((blueprint, index) => ({
      id: rng.uuid(),
      stableKey: blueprint.key,
      sort: index + 1,
      title: blueprint.title,
      phase: blueprint.phase,
      category: blueprint.category,
      anchorKey: blueprint.anchorKey,
      offsetDays: blueprint.offsetDays,
      dueTime: blueprint.dueTime,
      dutyRoleKey: blueprint.dutyRoleKey,
      priority: blueprint.priority,
      estimateMinutes: blueprint.estimateMinutes,
      requiresPhoto: blueprint.requiresPhoto,
    }));
    return {
      id: rng.uuid(),
      eventTypeId: type.id,
      name: `Ablauf ${type.nameDe}`,
      version: 1,
      status: "published",
      publishedOn: "2026-01-15",
      items,
    };
  });
}

export interface TaskContext {
  events: Event[];
  eventAnchors: EventAnchor[];
  templates: ChecklistTemplate[];
  dutyRoleIdByKey: Map<string, string>;
}

function effortFeedback(rng: Rng): EffortFeedback {
  return rng.pickWeighted([
    { value: "as_planned" as const, weight: 70 },
    { value: "longer" as const, weight: 20 },
    { value: "shorter" as const, weight: 10 },
  ]);
}

interface StatusDecision {
  status: TaskStatus;
  waitingReason: string | null;
  skippedReason: string | null;
  rolloverCount: number;
  lastRolledAt: string | null;
}

/**
 * Status relative to REFERENCE_DATE. Past tasks: mostly done, some skipped, about 5 % open and overdue
 * (rolled over 1–5 times). Future tasks: todo, a few in progress or waiting on an authority.
 */
function decideStatus(
  rng: Rng,
  item: TemplateItem,
  dueDate: string,
  eventStatus: Event["status"],
  eventEndsOn: string,
): StatusDecision {
  const none = { waitingReason: null, skippedReason: null, rolloverCount: 0, lastRolledAt: null };
  if (eventStatus === "cancelled") return { ...none, status: "cancelled" };

  if (dueDate < REFERENCE_DATE) {
    if (rng.chance(OVERDUE_SAMPLE_SHARE)) {
      return {
        ...none,
        status: rng.chance(0.3) ? "in_progress" : "todo",
        rolloverCount: rng.int(1, 5),
        lastRolledAt: berlinInstant(REFERENCE_DATE, "00:05"),
      };
    }
    // Waiting for an authority only makes sense while the event is still recent (or upcoming).
    const recentEvent = eventEndsOn >= addDays(REFERENCE_DATE, -30);
    if (item.category === "permits" && recentEvent && rng.chance(0.4)) {
      return {
        ...none,
        status: "waiting_external",
        waitingReason: "Antwort der Behörde ausstehend",
      };
    }
    if (rng.chance(0.03)) {
      return { ...none, status: "skipped", skippedReason: "Entfällt bei dieser Veranstaltung" };
    }
    return { ...none, status: "done" };
  }

  if (item.category === "permits" && rng.chance(0.2)) {
    return { ...none, status: "waiting_external", waitingReason: "Antwort der Behörde ausstehend" };
  }
  if (dueDate <= addDays(REFERENCE_DATE, 7) && rng.chance(0.25))
    return { ...none, status: "in_progress" };
  return { ...none, status: "todo" };
}

export function buildTasks(rng: Rng, ctx: TaskContext): Task[] {
  const templateByTypeId = new Map(
    ctx.templates.map((template) => [template.eventTypeId, template]),
  );
  const anchorsByEvent = new Map<string, Map<AnchorKey, string>>();
  for (const anchor of ctx.eventAnchors) {
    const byKey = anchorsByEvent.get(anchor.eventId) ?? new Map<AnchorKey, string>();
    byKey.set(anchor.key, anchor.date);
    anchorsByEvent.set(anchor.eventId, byKey);
  }

  const tasks: Task[] = [];
  for (const event of ctx.events) {
    const template = templateByTypeId.get(event.eventTypeId);
    const anchors = anchorsByEvent.get(event.id);
    if (!template || !anchors) throw new Error(`Event ${event.id} has no template or anchors`);

    for (const item of template.items) {
      const anchorDate = anchors.get(item.anchorKey);
      if (anchorDate === undefined)
        throw new Error(`Missing anchor ${item.anchorKey} for event ${event.id}`);
      const dueDate = addDays(anchorDate, item.offsetDays);
      const dueAt = berlinInstant(dueDate, item.dueTime ?? "09:00");
      const assigneeId = event.duties[item.dutyRoleKey];
      const dutyRoleId = ctx.dutyRoleIdByKey.get(item.dutyRoleKey);
      if (dutyRoleId === undefined) throw new Error(`Unknown duty role ${item.dutyRoleKey}`);

      const decision = decideStatus(rng, item, dueDate, event.status, event.endsOn);
      const isDone = decision.status === "done" || decision.status === "skipped";
      const completedAt = isDone
        ? new Date(Date.parse(dueAt) + rng.int(-3, 5) * 3_600_000).toISOString()
        : null;

      tasks.push({
        id: rng.uuid(),
        eventId: event.id,
        templateItemId: item.id,
        templateStableKey: item.stableKey,
        phase: item.phase,
        category: item.category,
        title: item.title,
        anchorKey: item.anchorKey,
        offsetDays: item.offsetDays,
        dueAt,
        dutyRoleId,
        assigneeId,
        priority: item.priority,
        estimateMinutes: item.estimateMinutes,
        requiresPhoto: item.requiresPhoto,
        status: decision.status,
        waitingReason: decision.waitingReason,
        completedAt,
        completedById: decision.status === "done" ? assigneeId : null,
        skippedReason: decision.skippedReason,
        effortFeedback: decision.status === "done" && rng.chance(0.15) ? effortFeedback(rng) : null,
        rolloverCount: decision.rolloverCount,
        lastRolledAt: decision.lastRolledAt,
      });
    }
  }
  return tasks;
}
