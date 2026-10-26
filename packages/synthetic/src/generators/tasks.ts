import { REFERENCE_DATE } from "../constants";
import {
  CHECKLIST_ITEM_BLUEPRINTS,
  ITEM_PERMIT_TYPES,
  KEY_ITEM_KEYS,
} from "../dictionaries/checklist-items";
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

/**
 * The team stays on top of its list: past tasks are done (or skipped), except a handful left open on purpose
 * so every view has something to show. Overdue tasks of current markets (not finished yet):
 */
export const OVERDUE_CURRENT = 4;
/** Forgotten tasks of the last market that ended more than a week ago (the Übersicht's "Aufräumen" line). */
export const OVERDUE_LEFTOVERS = 2;
/** Days before REFERENCE_DATE an overdue sample task may be due (a team catches up within days). */
const OVERDUE_WINDOW_DAYS = 10;
/** Markets that ended this many days ago or more count as past (`notOfPastEvent` in the app). */
const PAST_MARKET_DAYS = 7;

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
      isKey: KEY_ITEM_KEYS.has(blueprint.key),
      permitType: ITEM_PERMIT_TYPES[blueprint.key] ?? null,
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
 * Status relative to REFERENCE_DATE. Past tasks: done, a few skipped; permit tasks of current markets may still
 * wait on an authority. Future tasks: todo, a few in progress or waiting on an authority. The few overdue tasks
 * are picked afterwards (`leaveSomeOverdue`).
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
    // Waiting for an authority only makes sense while the market is still ahead.
    if (item.category === "permits" && eventEndsOn >= REFERENCE_DATE && rng.chance(0.1)) {
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

  if (item.category === "permits" && rng.chance(0.1)) {
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
  /** Berlin due day per task id (`dueAt` is a UTC instant). */
  const dueDates = new Map<string, string>();
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

      const id = rng.uuid();
      dueDates.set(id, dueDate);
      tasks.push({
        id,
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
        isKey: item.isKey,
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
  leaveSomeOverdue(rng, tasks, ctx.events, dueDates);
  return tasks;
}

/**
 * Reopens the few tasks the team has not caught up with yet: `OVERDUE_CURRENT` recently due tasks of markets
 * that are not over (they show as overdue), and `OVERDUE_LEFTOVERS` tasks of the last market that ended more
 * than a week ago (only the Übersicht's cleanup line shows them). Permit tasks stay as they are (they follow
 * their permit).
 */
function leaveSomeOverdue(
  rng: Rng,
  tasks: Task[],
  events: readonly Event[],
  dueDates: ReadonlyMap<string, string>,
): void {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const finished = (task: Task) => task.status === "done" || task.status === "skipped";
  const dueOn = (task: Task) => dueDates.get(task.id) ?? task.dueAt.slice(0, 10);
  const candidate = (task: Task) =>
    finished(task) && task.category !== "permits" && dueOn(task) < REFERENCE_DATE;

  const windowStart = addDays(REFERENCE_DATE, -OVERDUE_WINDOW_DAYS);
  const current = tasks.filter((task) => {
    const event = eventById.get(task.eventId);
    return (
      candidate(task) &&
      dueOn(task) >= windowStart &&
      event !== undefined &&
      event.status !== "cancelled" &&
      event.endsOn >= REFERENCE_DATE
    );
  });

  const pastCutoff = addDays(REFERENCE_DATE, -PAST_MARKET_DAYS);
  const lastPast = events
    .filter((event) => event.status !== "cancelled" && event.endsOn < pastCutoff)
    .sort((a, b) => (a.endsOn < b.endsOn ? 1 : a.endsOn > b.endsOn ? -1 : 0))[0];
  const leftovers = lastPast
    ? tasks.filter((task) => task.eventId === lastPast.id && candidate(task))
    : [];

  const reopen = (task: Task) => {
    const days = Math.max(
      1,
      Math.round((Date.parse(REFERENCE_DATE) - Date.parse(dueOn(task))) / 86_400_000),
    );
    task.status = rng.chance(0.3) ? "in_progress" : "todo";
    task.completedAt = null;
    task.completedById = null;
    task.skippedReason = null;
    task.effortFeedback = null;
    task.rolloverCount = Math.min(days, 5);
    task.lastRolledAt = berlinInstant(REFERENCE_DATE, "00:05");
  };
  for (const task of rng.shuffle(current).slice(0, OVERDUE_CURRENT)) reopen(task);
  for (const task of rng.shuffle(leftovers).slice(0, OVERDUE_LEFTOVERS)) reopen(task);
}
