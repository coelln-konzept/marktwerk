import {
  assumedChecklist,
  CLIENT_CHECKLISTS,
  CLIENT_MARKET_PRESET_KEYS,
  type ClientMarketKey,
  GRUNDVORLAGE,
  type ItemBlueprint,
} from "../dictionaries/checklist-items";
import type { Clock } from "../lib/clock";
import { addDays, berlinInstant } from "../lib/dates";
import type { Rng } from "../lib/rng";
import type {
  AnchorKey,
  ChecklistTemplate,
  DutyRoleKey,
  EffortFeedback,
  Event,
  EventAnchor,
  EventPreset,
  EventSeason,
  EventSeasonAnchor,
  EventType,
  Permit,
  Task,
  TaskStatus,
  TemplateItem,
  TemplateSource,
} from "../types";
import { permitIsFiled } from "./permits";

/**
 * The team stays on top of its list: past tasks are done (or skipped), except a handful left open on purpose
 * so every view has something to show. Overdue tasks of current markets (not finished yet):
 */
export const OVERDUE_CURRENT = 4;
/** Forgotten tasks of the last market that ended more than a week ago (the Übersicht's "Aufräumen" line). */
export const OVERDUE_LEFTOVERS = 1;
/** Days before today an overdue sample task may be due (a team catches up within days). */
const OVERDUE_WINDOW_DAYS = 10;
/** The window grows by `OVERDUE_WINDOW_DAYS` up to this while it holds fewer than `OVERDUE_CURRENT` tasks. */
const MAX_OVERDUE_WINDOW_DAYS = 30;
/** Off-season fallback: upcoming tasks of the next this many days stay where they are ("Nächste Tage"). */
const KEEP_AHEAD_DAYS = 14;
/** Past-due permit tasks that still wait on an authority (their market is ahead), picked in `leaveSomeOverdue`. */
const WAITING_PAST = 2;
/** Markets that ended this many days ago or more count as past (`notOfPastEvent` in the app). */
const PAST_MARKET_DAYS = 7;
/** An open season task due within this many days is being worked on (`in_progress`); later ones are `todo`. */
const SEASON_ACTIVE_DAYS = 30;

export const MASTER_TEMPLATE_NAME = "Grundvorlage";

/* -------------------------------------------------------------------------------------- templates */

/**
 * Template items from blueprints: each parent, then its child items right below it (ADR 0021). A child without
 * its own due date carries the parent's anchor, offset and time (`ownDue` false); without its own duty role it
 * has none (`dutyRoleKey` null = the parent's).
 */
function templateItems(rng: Rng, blueprints: readonly ItemBlueprint[]): TemplateItem[] {
  const items: TemplateItem[] = [];
  for (const blueprint of blueprints) {
    const scope = blueprint.scope ?? "event";
    items.push({
      id: rng.uuid(),
      stableKey: blueprint.key,
      sort: items.length + 1,
      title: blueprint.title,
      description: blueprint.description ?? null,
      phase: blueprint.phase,
      category: blueprint.category,
      anchorKey: blueprint.anchorKey,
      offsetDays: blueprint.offsetDays,
      dueTime: blueprint.dueTime,
      dutyRoleKey: blueprint.dutyRoleKey,
      priority: blueprint.priority,
      estimateMinutes: blueprint.estimateMinutes,
      requiresPhoto: blueprint.requiresPhoto ?? false,
      isKey: blueprint.isKey ?? false,
      permitType: blueprint.permitType ?? null,
      parentKey: null,
      ownDue: false,
      scope,
    });
    for (const child of blueprint.children ?? []) {
      items.push({
        id: rng.uuid(),
        stableKey: `${blueprint.key}__${child.key}`,
        sort: items.length + 1,
        title: child.title,
        description: child.description ?? null,
        phase: blueprint.phase,
        category: blueprint.category,
        anchorKey: child.due?.anchorKey ?? blueprint.anchorKey,
        offsetDays: child.due?.offsetDays ?? blueprint.offsetDays,
        dueTime: child.due ? child.due.dueTime : blueprint.dueTime,
        dutyRoleKey: child.dutyRoleKey ?? null,
        priority: blueprint.priority,
        estimateMinutes: child.estimateMinutes,
        requiresPhoto: false,
        isKey: false,
        permitType: child.permitType ?? null,
        parentKey: blueprint.key,
        ownDue: child.due !== undefined,
        scope,
      });
    }
  }
  return items;
}

function template(
  rng: Rng,
  clock: Clock,
  fields: Pick<
    ChecklistTemplate,
    "eventTypeId" | "name" | "description" | "isMaster" | "ownerPresetId" | "source"
  >,
  blueprints: readonly ItemBlueprint[],
): ChecklistTemplate {
  return {
    id: rng.uuid(),
    ...fields,
    version: 1,
    status: "published",
    publishedOn: `${clock.season - 1}-12-15`,
    items: templateItems(rng, blueprints),
  };
}

/** The Grundvorlage (`is_master`): the common core of the client's sheets, linked to no market. */
export function buildMasterTemplate(rng: Rng, clock: Clock): ChecklistTemplate {
  return template(
    rng,
    clock,
    {
      eventTypeId: null,
      name: MASTER_TEMPLATE_NAME,
      description:
        "Die Aufgaben, mit denen jeder Markt startet (gemeinsamer Kern der Checklisten).",
      isMaster: true,
      ownerPresetId: null,
      source: "master",
    },
    GRUNDVORLAGE,
  );
}

/** The preset each client sheet attaches to (see `CLIENT_MARKET_PRESET_KEYS`). */
export function clientMarketByPresetKey(
  presetKeys: readonly string[],
): Map<string, ClientMarketKey> {
  const existing = new Set(presetKeys);
  const result = new Map<string, ClientMarketKey>();
  for (const [market, candidates] of Object.entries(CLIENT_MARKET_PRESET_KEYS) as [
    ClientMarketKey,
    readonly string[],
  ][]) {
    const key = candidates.find((candidate) => existing.has(candidate));
    if (key === undefined) throw new Error(`No preset for the client sheet ${market}`);
    result.set(key, market);
  }
  return result;
}

export interface MarketTemplates {
  templates: ChecklistTemplate[];
  templateIdByPresetId: Map<string, string>;
}

/**
 * Every market's own task template (`owner_preset_id`, as `createMarket` makes them): the client's sheet for the
 * four markets that sent one, a copy of the Grundvorlage plus assumed items (marked) for every other market.
 */
export function buildMarketTemplates(
  rng: Rng,
  presets: readonly EventPreset[],
  eventTypes: readonly EventType[],
  clock: Clock,
): MarketTemplates {
  const typeKeyById = new Map(eventTypes.map((type) => [type.id, type.key]));
  const clientMarkets = clientMarketByPresetKey(presets.map((preset) => preset.key));
  const templates: ChecklistTemplate[] = [];
  const templateIdByPresetId = new Map<string, string>();
  for (const preset of presets) {
    const typeKey = typeKeyById.get(preset.eventTypeId);
    if (typeKey === undefined) throw new Error(`Preset ${preset.key} has an unknown event type`);
    const client = clientMarkets.get(preset.key);
    const source: TemplateSource = client ? "client_checklist" : "master_copy";
    const created = template(
      rng,
      clock,
      {
        eventTypeId: preset.eventTypeId,
        name: `${preset.name} – Aufgaben`,
        description: client
          ? "Nach der Checkliste des Markts (November 2026)."
          : "Kopie der Grundvorlage. Zusatzaufgaben sind Annahmen, bis die Checkliste des Markts vorliegt.",
        isMaster: false,
        ownerPresetId: preset.id,
        source,
      },
      client ? CLIENT_CHECKLISTS[client] : assumedChecklist(typeKey),
    );
    templates.push(created);
    templateIdByPresetId.set(preset.id, created.id);
  }
  return { templates, templateIdByPresetId };
}

/* ------------------------------------------------------------------------------------------ tasks */

export interface TaskContext {
  events: Event[];
  eventAnchors: EventAnchor[];
  /** Saison records with their anchors: they get the `season` items (`Task.seasonId`). */
  eventSeasons: EventSeason[];
  eventSeasonAnchors: EventSeasonAnchor[];
  /** For the season tasks' assignees: the market's default duty holders, as the app's season path uses them. */
  presets: EventPreset[];
  templates: ChecklistTemplate[];
  /** The market's own template for every preset. */
  templateIdByPresetId: Map<string, string>;
  dutyRoleIdByKey: Map<string, string>;
  /**
   * The permit a task of an item with `permitType` is linked to on its event (the app's `linkPermitTasks`), or
   * undefined. A task whose permit is applied for or granted is done, as in the app.
   */
  permitFor: (eventId: string, permitType: string) => Permit | undefined;
  /** The same for a season task: the season permit of that type that belongs to its Saison record. */
  seasonPermitFor: (seasonId: string, permitType: string) => Permit | undefined;
  clock: Clock;
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

const WAITING_REASON = "Antwort der Behörde ausstehend";

/**
 * Status relative to today. Past tasks: done, a few skipped; permit tasks of current markets may still
 * wait on an authority. Future tasks: todo, a few in progress or waiting on an authority. The few overdue tasks
 * are picked afterwards (`leaveSomeOverdue`).
 */
function decideStatus(
  rng: Rng,
  today: string,
  item: TemplateItem,
  dueDate: string,
  eventStatus: Event["status"],
): StatusDecision {
  const none = { waitingReason: null, skippedReason: null, rolloverCount: 0, lastRolledAt: null };
  if (eventStatus === "cancelled") return { ...none, status: "cancelled" };

  if (dueDate < today) {
    if (rng.chance(0.03)) {
      return { ...none, status: "skipped", skippedReason: "Entfällt bei dieser Veranstaltung" };
    }
    return { ...none, status: "done" };
  }

  if (item.category === "permits" && rng.chance(0.1)) {
    return { ...none, status: "waiting_external", waitingReason: WAITING_REASON };
  }
  if (dueDate <= addDays(today, 7) && rng.chance(0.25)) return { ...none, status: "in_progress" };
  return { ...none, status: "todo" };
}

/**
 * Status of a season task (Termine planen, Genehmigung beantragen) relative to today: the team plans and applies
 * on time, so a past one is done; an upcoming one is in progress within `SEASON_ACTIVE_DAYS` of its due date,
 * otherwise todo. `leaveSomeOverdue` may reopen one of a season that has not started yet (a couple at most).
 */
function decideSeasonStatus(today: string, dueDate: string): StatusDecision {
  const none = { waitingReason: null, skippedReason: null, rolloverCount: 0, lastRolledAt: null };
  if (dueDate < today) return { ...none, status: "done" };
  if (dueDate <= addDays(today, SEASON_ACTIVE_DAYS)) return { ...none, status: "in_progress" };
  return { ...none, status: "todo" };
}

/** What a task belongs to: an event (`event` items) or a Saison record (`season` items). */
interface Owner {
  eventId: string | null;
  seasonId: string | null;
  presetId: string;
  /** The event of an event task (null for season tasks). */
  event: Event | null;
  /** Who holds each duty role: the event's duties, or the market's default duties for a season. */
  duties: Record<DutyRoleKey, string>;
  anchors: ReadonlyMap<AnchorKey, string>;
  /**
   * Still ahead, so its overdue work shows on the current lists: an event that is not over (and not cancelled),
   * a season that has not started yet.
   */
  ahead: boolean;
  /** The permit a task of an item with this permit type is linked to (see `TaskContext.permitFor`). */
  permitFor: (permitType: string) => Permit | undefined;
}

interface Planned {
  task: Task;
  item: TemplateItem;
  owner: Owner;
  dueDate: string;
  /** Its item applies for a permit that is already applied for or granted: the task stays done. */
  filedPermit: boolean;
}

export function buildTasks(rng: Rng, ctx: TaskContext): Task[] {
  const templateById = new Map(ctx.templates.map((t) => [t.id, t]));
  const anchorsByEvent = new Map<string, Map<AnchorKey, string>>();
  for (const anchor of ctx.eventAnchors) {
    const byKey = anchorsByEvent.get(anchor.eventId) ?? new Map<AnchorKey, string>();
    byKey.set(anchor.key, anchor.date);
    anchorsByEvent.set(anchor.eventId, byKey);
  }
  const anchorsBySeason = new Map<string, Map<AnchorKey, string>>();
  for (const anchor of ctx.eventSeasonAnchors) {
    const byKey = anchorsBySeason.get(anchor.seasonId) ?? new Map<AnchorKey, string>();
    byKey.set(anchor.key, anchor.date);
    anchorsBySeason.set(anchor.seasonId, byKey);
  }
  const presetById = new Map(ctx.presets.map((preset) => [preset.id, preset]));
  const roleId = (key: DutyRoleKey): string => {
    const id = ctx.dutyRoleIdByKey.get(key);
    if (id === undefined) throw new Error(`Unknown duty role ${key}`);
    return id;
  };
  const today = ctx.clock.today;
  const templateOf = (presetId: string): ChecklistTemplate => {
    const templateId = ctx.templateIdByPresetId.get(presetId);
    const tpl = templateId ? templateById.get(templateId) : undefined;
    if (!tpl) throw new Error(`Preset ${presetId} has no template`);
    return tpl;
  };

  const childItemsByParent = new Map<string, TemplateItem[]>();
  const permitTypeByItemId = new Map<string, string>();
  for (const tpl of ctx.templates) {
    for (const item of tpl.items) {
      if (item.permitType !== null) permitTypeByItemId.set(item.id, item.permitType);
      if (item.parentKey === null) continue;
      const key = `${tpl.id}|${item.parentKey}`;
      childItemsByParent.set(key, [...(childItemsByParent.get(key) ?? []), item]);
    }
  }

  // 1. Top-level tasks: `event` items on every event, `season` items on every Saison record.
  const owners: { owner: Owner; cancelled: boolean }[] = [];
  for (const event of ctx.events) {
    const anchors = anchorsByEvent.get(event.id);
    if (!anchors) throw new Error(`Event ${event.id} has no anchors`);
    owners.push({
      cancelled: event.status === "cancelled",
      owner: {
        eventId: event.id,
        seasonId: null,
        presetId: event.presetId,
        event,
        duties: event.duties,
        anchors,
        ahead: event.status !== "cancelled" && event.endsOn >= today,
        permitFor: (permitType) => ctx.permitFor(event.id, permitType),
      },
    });
  }
  for (const season of ctx.eventSeasons) {
    const preset = presetById.get(season.presetId);
    if (!preset) throw new Error(`Saison ${season.id} has an unknown market`);
    const anchors = anchorsBySeason.get(season.id) ?? new Map<AnchorKey, string>();
    owners.push({
      cancelled: false,
      owner: {
        eventId: null,
        seasonId: season.id,
        presetId: season.presetId,
        event: null,
        duties: preset.defaultDuties,
        anchors,
        ahead: (anchors.get("seasonStart") ?? "") >= today,
        permitFor: (permitType) => ctx.seasonPermitFor(season.id, permitType),
      },
    });
  }

  const parents: Planned[] = [];
  for (const { owner, cancelled } of owners) {
    const scope = owner.event ? "event" : "season";
    const ownerName = owner.eventId ?? `Saison ${owner.seasonId}`;
    for (const item of templateOf(owner.presetId).items) {
      if (item.parentKey !== null || item.scope !== scope) continue;
      const anchorDate = owner.anchors.get(item.anchorKey);
      if (anchorDate === undefined)
        throw new Error(`Missing anchor ${item.anchorKey} for ${ownerName}`);
      if (item.dutyRoleKey === null) throw new Error(`Item ${item.stableKey} has no duty role`);
      const dueDate = addDays(anchorDate, item.offsetDays);
      const dueAt = berlinInstant(dueDate, item.dueTime ?? "09:00");
      const assigneeId = owner.duties[item.dutyRoleKey];

      let decision = owner.event
        ? decideStatus(rng, today, item, dueDate, owner.event.status)
        : decideSeasonStatus(today, dueDate);
      let completedAt =
        decision.status === "done" || decision.status === "skipped"
          ? new Date(Date.parse(dueAt) + rng.int(-3, 5) * 3_600_000).toISOString()
          : null;
      // A task that applies for a permit is done once the permit is applied for (the app's linkPermitTasks).
      const permit = item.permitType ? owner.permitFor(item.permitType) : undefined;
      const filedPermit = !cancelled && permitIsFiled(permit);
      if (filedPermit && completedAt === null && permit?.appliedAt) {
        decision = { ...decision, status: "done", waitingReason: null };
        completedAt = berlinInstant(permit.appliedAt, "11:00");
      }

      parents.push({
        item,
        owner,
        dueDate,
        filedPermit,
        task: {
          id: rng.uuid(),
          eventId: owner.eventId,
          seasonId: owner.seasonId,
          templateItemId: item.id,
          templateStableKey: item.stableKey,
          parentTaskId: null,
          phase: item.phase,
          category: item.category,
          title: item.title,
          description: item.description,
          anchorKey: item.anchorKey,
          offsetDays: item.offsetDays,
          dueAt,
          dutyRoleId: roleId(item.dutyRoleKey),
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
          effortFeedback:
            decision.status === "done" && rng.chance(0.15) ? effortFeedback(rng) : null,
          rolloverCount: decision.rolloverCount,
          lastRolledAt: decision.lastRolledAt,
        },
      });
    }
  }
  leaveSomeOverdue(rng, today, parents);

  // 2. Subtasks, following their parent's final status.
  const tasks: Task[] = [];
  for (const parent of parents) {
    tasks.push(parent.task);
    const tplId = ctx.templateIdByPresetId.get(parent.owner.presetId);
    const children = childItemsByParent.get(`${tplId}|${parent.item.stableKey}`) ?? [];
    for (const subtask of subtasks(rng, today, parent, children, roleId)) {
      // A subtask that applies for a permit of its own (Festsetzung, Plakatierung) is done once that permit is filed.
      const type = permitTypeByItemId.get(subtask.templateItemId);
      const permit = type ? parent.owner.permitFor(type) : undefined;
      if (
        subtask.status !== "cancelled" &&
        subtask.status !== "skipped" &&
        subtask.status !== "done" &&
        permitIsFiled(permit) &&
        permit?.appliedAt
      ) {
        subtask.status = "done";
        subtask.waitingReason = null;
        subtask.completedAt = berlinInstant(permit.appliedAt, "11:00");
        subtask.completedById = subtask.assigneeId;
      }
      tasks.push(subtask);
    }
  }
  return tasks;
}

type EventPlanned = Planned & { owner: Owner & { event: Event } };

/**
 * The subtasks of one task. A child item takes the parent's due date and duty role unless it has its own
 * (`inheritedItem` in core). Status follows the parent: done/skipped/cancelled parents have all subtasks the same;
 * an open parent has some subtasks done (in progress: at least one; overdue: all but the last), the rest open; a
 * parent waiting on an authority has its first subtask done and the others waiting too.
 */
function subtasks(
  rng: Rng,
  today: string,
  parent: Planned,
  children: readonly TemplateItem[],
  roleId: (key: DutyRoleKey) => string,
): Task[] {
  if (children.length === 0) return [];
  const p = parent.task;
  const parentRoleKey = parent.item.dutyRoleKey as DutyRoleKey;
  const status = p.status;
  let doneCount = 0;
  if (status === "done" || status === "skipped" || status === "cancelled")
    doneCount = children.length;
  else if (status === "waiting_external") doneCount = 1;
  else if (p.rolloverCount > 0) doneCount = children.length - 1;
  else if (status === "in_progress" && children.length > 1)
    doneCount = rng.int(1, children.length - 1);

  const todayStart = Date.parse(`${today}T00:00:00Z`);
  return children.map((child, index) => {
    const roleKey = child.dutyRoleKey ?? parentRoleKey;
    let dueAt = p.dueAt;
    if (child.ownDue) {
      const anchorDate = parent.owner.anchors.get(child.anchorKey);
      if (anchorDate === undefined)
        throw new Error(`Missing anchor ${child.anchorKey} for task ${p.id}`);
      dueAt = berlinInstant(addDays(anchorDate, child.offsetDays), child.dueTime ?? "09:00");
    }
    const assigneeId = parent.owner.duties[roleKey];

    let childStatus: TaskStatus;
    if (index < doneCount) {
      childStatus = status === "skipped" || status === "cancelled" ? status : "done";
    } else if (status === "waiting_external") {
      childStatus = "waiting_external";
    } else if (status === "in_progress" && children.length === 1) {
      childStatus = "in_progress";
    } else {
      childStatus = "todo";
    }

    let completedAt: string | null = null;
    if (childStatus === "done" || childStatus === "skipped") {
      // before the parent's completion, or (open parent) before today
      const ceiling = p.completedAt
        ? Date.parse(p.completedAt)
        : Math.min(Date.parse(dueAt), todayStart - 3_600_000);
      completedAt = new Date(ceiling - rng.int(0, 48) * 3_600_000).toISOString();
    }
    return {
      id: rng.uuid(),
      eventId: p.eventId,
      seasonId: p.seasonId,
      templateItemId: child.id,
      templateStableKey: child.stableKey,
      parentTaskId: p.id,
      phase: child.phase,
      category: child.category,
      title: child.title,
      description: child.description,
      anchorKey: child.anchorKey,
      offsetDays: child.offsetDays,
      dueAt,
      dutyRoleId: roleId(roleKey),
      assigneeId,
      priority: child.priority,
      estimateMinutes: child.estimateMinutes,
      requiresPhoto: child.requiresPhoto,
      isKey: child.isKey,
      status: childStatus,
      waitingReason: childStatus === "waiting_external" ? p.waitingReason : null,
      completedAt,
      completedById: childStatus === "done" ? assigneeId : null,
      skippedReason: childStatus === "skipped" ? p.skippedReason : null,
      effortFeedback: null,
      rolloverCount: 0,
      lastRolledAt: null,
    };
  });
}

/**
 * Reopens the few top-level tasks the team has not caught up with yet: `OVERDUE_CURRENT` recently due tasks of
 * markets that are not over (they show as overdue), and `OVERDUE_LEFTOVERS` tasks of the last market that ended
 * more than a week ago (only the Übersicht's cleanup line shows them). Permit tasks stay as they are (they follow
 * their permit), except `WAITING_PAST` recent ones that still wait on the authority. A season counts as current
 * while it has not started yet (its work is still ahead), so next season's Termine planen may be among them; the
 * current season's work is done.
 */
function leaveSomeOverdue(rng: Rng, today: string, all: readonly Planned[]): void {
  const finished = (task: Task) => task.status === "done" || task.status === "skipped";
  const candidate = ({ task, dueDate, filedPermit }: Planned) =>
    finished(task) && task.category !== "permits" && !filedPermit && dueDate < today;

  const ofCurrentMarket = all.filter((p) => candidate(p) && p.owner.ahead);
  // Recently due ones; the window widens in steps while there are too few (the sheets have few items per event).
  let current: Planned[] = [];
  for (
    let windowDays = OVERDUE_WINDOW_DAYS;
    current.length < OVERDUE_CURRENT && windowDays <= MAX_OVERDUE_WINDOW_DAYS;
    windowDays += OVERDUE_WINDOW_DAYS
  ) {
    const windowStart = addDays(today, -windowDays);
    current = ofCurrentMarket.filter((p) => p.dueDate >= windowStart);
  }
  // Off-season (November to March): hardly any work of a current market fell due recently, yet every view should
  // still show a few overdue tasks. The nearest upcoming ones are moved a few days into the past instead, but not
  // those of the next two weeks: the Übersicht's "Nächste Tage" needs them.
  const missing = OVERDUE_CURRENT - Math.min(current.length, OVERDUE_CURRENT);
  if (missing > 0) {
    const upcoming = all
      .filter(
        (p) =>
          p.owner.ahead &&
          !finished(p.task) &&
          p.task.status !== "cancelled" &&
          p.task.category !== "permits" &&
          !p.filedPermit &&
          p.dueDate > addDays(today, KEEP_AHEAD_DAYS),
      )
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
      .slice(0, missing);
    upcoming.forEach((p, i) => {
      p.dueDate = addDays(today, -2 * (i + 1));
      p.task.dueAt = berlinInstant(p.dueDate, p.item.dueTime ?? "09:00");
      p.task.status = rng.chance(0.3) ? "in_progress" : "todo";
      p.task.rolloverCount = 2 * (i + 1);
      p.task.lastRolledAt = berlinInstant(today, "00:05");
    });
  }

  const pastCutoff = addDays(today, -PAST_MARKET_DAYS);
  const planned = all
    .filter((p): p is EventPlanned => p.owner.event !== null)
    .map((p) => ({ ...p, event: p.owner.event }));
  const lastPast = [...new Map(planned.map((p) => [p.event.id, p.event])).values()]
    .filter((event) => event.status !== "cancelled" && event.endsOn < pastCutoff)
    .sort((a, b) => (a.endsOn < b.endsOn ? 1 : a.endsOn > b.endsOn ? -1 : 0))[0];
  const leftovers = lastPast
    ? planned.filter((p) => p.event.id === lastPast.id && candidate(p))
    : [];

  const reopen = ({ task, dueDate }: Planned) => {
    const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(dueDate)) / 86_400_000));
    task.status = rng.chance(0.3) ? "in_progress" : "todo";
    task.completedAt = null;
    task.completedById = null;
    task.skippedReason = null;
    task.effortFeedback = null;
    task.rolloverCount = Math.min(days, 5);
    task.lastRolledAt = berlinInstant(today, "00:05");
  };
  // A couple of recent permit tasks still wait on the authority (the market is ahead, so that is normal). Not those
  // whose permit is already applied for: the app counts them as done.
  const waiting = all.filter(
    ({ task, owner, dueDate, filedPermit }) =>
      task.status === "done" &&
      !filedPermit &&
      task.category === "permits" &&
      dueDate < today &&
      dueDate >= addDays(today, -30) &&
      owner.ahead,
  );
  for (const { task } of rng.shuffle(waiting).slice(0, WAITING_PAST)) {
    task.status = "waiting_external";
    task.waitingReason = WAITING_REASON;
    task.completedAt = null;
    task.completedById = null;
    task.effortFeedback = null;
  }
  for (const p of rng.shuffle(current).slice(0, OVERDUE_CURRENT)) reopen(p);
  for (const p of rng.shuffle(leftovers).slice(0, OVERDUE_LEFTOVERS)) reopen(p);
}
