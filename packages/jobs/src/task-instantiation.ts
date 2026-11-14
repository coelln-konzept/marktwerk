/*
 * THE instantiation path (CLAUDE.md: one service path): templates → checklists → tasks, for events and for Saison
 * records (research 13 §6). Lives in @marktwerk/jobs so the web services ("Markt planen", propagation) and the
 * nightly `event-seasons` job share it; `apps/web/src/server/services/task-instantiation.ts` re-exports it.
 */
import {
  applicableItems,
  type ConditionFacts,
  type ContactContext,
  clockTime,
  contactForRole,
  DEFAULT_TIME_ZONE,
  holidaysBetween,
  holidayWindow,
  type ItemCondition,
  inheritedItem,
  type PlanItem,
  parentsFirst,
  taskDueInstant,
} from "@marktwerk/core";
import {
  checklist,
  checklistTemplate,
  contact,
  type Database,
  dutyRole,
  event,
  eventAnchor,
  eventDuty,
  eventPreset,
  eventPresetTemplate,
  eventSeason,
  eventSeasonAnchor,
  eventType,
  permitRequirement,
  settings,
  task,
  templateItem,
  templateVersion,
  venue,
} from "@marktwerk/db";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { audit, type ServiceActor, type Tx } from "./audit";

/** Rows are written in chunks so a season of events does not build one gigantic statement. */
const CHUNK = 500;

export const chunks = <T>(rows: T[], size = CHUNK): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < rows.length; i += size) result.push(rows.slice(i, i + size));
  return result;
};

// ---------------------------------------------------------------------------------------------
// Company defaults and holidays

export type DueDefaults = { defaultDueTime: string; timeZone: string };

/** Default due time and time zone of the company (settings row; fallbacks if the row is missing). */
export async function loadDueDefaults(tx: Pick<Database, "select">): Promise<DueDefaults> {
  const [row] = await tx
    .select({ defaultDueTime: settings.defaultDueTime, timeZone: settings.timeZone })
    .from(settings)
    .where(eq(settings.id, 1));
  return {
    defaultDueTime: clockTime(row?.defaultDueTime) ?? "09:00",
    timeZone: row?.timeZone ?? DEFAULT_TIME_ZONE,
  };
}

/** NRW holidays for every anchor date, wide enough for the largest offset ("business" items need them). */
export function holidaysForAnchors(
  anchors: ReadonlyMap<string, string>,
  maxAbsOffset: number,
): Map<string, unknown> {
  const dates = [...anchors.values()].sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return new Map();
  return holidaysBetween(
    holidayWindow(first, maxAbsOffset).from,
    holidayWindow(last, maxAbsOffset).to,
  );
}

// ---------------------------------------------------------------------------------------------
// Contexts: what a checklist is made for (an event, or a Saison record), with anchors, duties, condition facts

/** What every context has: the anchors items are due relative to, the duty holders and the condition facts. */
type ContextBase = {
  id: string;
  name: string;
  presetId: string | null;
  facts: ConditionFacts;
  anchors: Map<string, string>;
  /** duty_role.id → staff_member.id */
  duties: Map<string, string>;
  /**
   * The Ort's contacts (owner, the Behörden of its permit requirements) for items with a default contact role
   * (Fahrplan R24). Absent (previews) = no contact is looked up.
   */
  contacts?: ContactContext;
};

/** Key of {@link loadContactContexts}: one Ort for one event type. */
export const contactContextKey = (venueId: string, eventTypeKey: string) =>
  `${venueId}|${eventTypeKey}`;

/**
 * What the Orte say about contacts (Fahrplan R24), per Ort and event type: the owner (live contact only, with its
 * kind) and the live permit requirements for that event type or for every type, event-type-specific ones first,
 * each with its Behörde when that is a live contact. Two queries, whatever the number of pairs. Used by the
 * instantiation (default contact roles) and the task drawer ("Vorschlag: …").
 */
export async function loadContactContexts(
  tx: Pick<Database, "select">,
  pairs: readonly { venueId: string; eventTypeKey: string }[],
): Promise<Map<string, ContactContext>> {
  const result = new Map<string, ContactContext>();
  const venueIds = [...new Set(pairs.map((p) => p.venueId))];
  if (venueIds.length === 0) return result;
  const owners = await tx
    .select({ venueId: venue.id, id: contact.id, kind: contact.kind })
    .from(venue)
    .innerJoin(contact, and(eq(contact.id, venue.landownerContactId), isNull(contact.archivedAt)))
    .where(inArray(venue.id, venueIds));
  const requirements = await tx
    .select({
      venueId: permitRequirement.venueId,
      eventTypeKey: eventType.key,
      permitType: permitRequirement.permitType,
      authorityId: contact.id,
    })
    .from(permitRequirement)
    .leftJoin(eventType, eq(eventType.id, permitRequirement.eventTypeId))
    .leftJoin(
      contact,
      and(eq(contact.id, permitRequirement.authorityContactId), isNull(contact.archivedAt)),
    )
    .where(and(inArray(permitRequirement.venueId, venueIds), isNull(permitRequirement.archivedAt)))
    // Event-type-specific requirements first, then the general ones; stable within.
    .orderBy(
      desc(isNotNull(permitRequirement.eventTypeId)),
      asc(permitRequirement.createdAt),
      asc(permitRequirement.id),
    );
  const ownerOf = new Map(owners.map((o) => [o.venueId, { id: o.id, kind: o.kind }]));
  for (const { venueId, eventTypeKey } of pairs) {
    result.set(contactContextKey(venueId, eventTypeKey), {
      venueOwner: ownerOf.get(venueId) ?? null,
      requirements: requirements
        .filter(
          (r) =>
            r.venueId === venueId && (r.eventTypeKey === null || r.eventTypeKey === eventTypeKey),
        )
        .map((r) => ({ permitType: r.permitType, authorityId: r.authorityId })),
    });
  }
  return result;
}

/** Adds the Ort's contacts to contexts (one lookup for all of them). */
async function withContacts<C extends ContextBase>(tx: Tx, contexts: C[]): Promise<C[]> {
  const map = await loadContactContexts(
    tx,
    contexts.map((c) => c.facts),
  );
  return contexts.map((c) => ({
    ...c,
    contacts: map.get(contactContextKey(c.facts.venueId, c.facts.eventTypeKey)),
  }));
}

/** An event: gets the template items with `scope = 'event'`. */
export type EventContext = ContextBase & {
  scope: "event";
  startsOn: string;
  endsOn: string;
};

/** A Saison record (research 13 §6): gets the items with `scope = 'season'`, due relative to the season anchors. */
export type SeasonContext = ContextBase & { scope: "season"; season: number };

export type InstantiationContext = EventContext | SeasonContext;

/** Everything instantiation needs to know about events, in the order of `ids`. */
export async function loadEventContexts(tx: Tx, ids: string[]): Promise<EventContext[]> {
  if (ids.length === 0) return [];
  // One after the other: a transaction has a single connection.
  const events = await tx
    .select({
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      presetId: event.presetId,
      venueId: event.venueId,
      venueKind: venue.kind,
      eventTypeKey: eventType.key,
    })
    .from(event)
    .innerJoin(venue, eq(venue.id, event.venueId))
    .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
    .where(inArray(event.id, ids));
  const anchors = await tx
    .select({ eventId: eventAnchor.eventId, key: eventAnchor.key, date: eventAnchor.date })
    .from(eventAnchor)
    .where(inArray(eventAnchor.eventId, ids));
  const duties = await tx
    .select({
      eventId: eventDuty.eventId,
      dutyRoleId: eventDuty.dutyRoleId,
      staffMemberId: eventDuty.staffMemberId,
    })
    .from(eventDuty)
    .where(inArray(eventDuty.eventId, ids));
  const anchorsOf = new Map<string, Map<string, string>>();
  for (const a of anchors) {
    const map = anchorsOf.get(a.eventId) ?? new Map<string, string>();
    map.set(a.key, a.date);
    anchorsOf.set(a.eventId, map);
  }
  const dutiesOf = new Map<string, Map<string, string>>();
  for (const d of duties) {
    const map = dutiesOf.get(d.eventId) ?? new Map<string, string>();
    map.set(d.dutyRoleId, d.staffMemberId);
    dutiesOf.set(d.eventId, map);
  }
  const byId = new Map(events.map((e) => [e.id, e]));
  const contexts = ids.flatMap((id) => {
    const e = byId.get(id);
    if (!e) return [];
    return [
      {
        scope: "event" as const,
        id: e.id,
        name: e.name,
        startsOn: e.startsOn,
        endsOn: e.endsOn,
        presetId: e.presetId,
        facts: { eventTypeKey: e.eventTypeKey, venueId: e.venueId, venueKind: e.venueKind },
        anchors: anchorsOf.get(id) ?? new Map<string, string>(),
        duties: dutiesOf.get(id) ?? new Map<string, string>(),
      },
    ];
  });
  return withContacts(tx, contexts);
}

/**
 * Everything instantiation needs to know about Saison records, in the order of `ids`: the market's type and venue
 * as condition facts, the season anchors, and the market's default duties (`event_preset.default_duties`, the
 * same people a new event of the market gets).
 */
export async function loadSeasonContexts(tx: Tx, ids: string[]): Promise<SeasonContext[]> {
  if (ids.length === 0) return [];
  const seasons = await tx
    .select({
      id: eventSeason.id,
      season: eventSeason.season,
      presetId: eventSeason.presetId,
      name: eventPreset.name,
      defaultDuties: eventPreset.defaultDuties,
      venueId: eventPreset.venueId,
      venueKind: venue.kind,
      eventTypeKey: eventType.key,
    })
    .from(eventSeason)
    .innerJoin(eventPreset, eq(eventPreset.id, eventSeason.presetId))
    .innerJoin(venue, eq(venue.id, eventPreset.venueId))
    .innerJoin(eventType, eq(eventType.id, eventPreset.eventTypeId))
    .where(inArray(eventSeason.id, ids));
  const anchors = await tx
    .select({
      seasonId: eventSeasonAnchor.seasonId,
      key: eventSeasonAnchor.key,
      date: eventSeasonAnchor.date,
    })
    .from(eventSeasonAnchor)
    .where(inArray(eventSeasonAnchor.seasonId, ids));
  const roleKeys = [...new Set(seasons.flatMap((s) => Object.keys(s.defaultDuties)))];
  const roles =
    roleKeys.length > 0
      ? await tx
          .select({ id: dutyRole.id, key: dutyRole.key })
          .from(dutyRole)
          .where(inArray(dutyRole.key, roleKeys))
      : [];
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));
  const byId = new Map(seasons.map((s) => [s.id, s]));
  const contexts = ids.flatMap((id) => {
    const s = byId.get(id);
    if (!s) return [];
    const duties = new Map<string, string>();
    for (const [key, staffMemberId] of Object.entries(s.defaultDuties)) {
      const roleId = roleIdByKey.get(key);
      if (roleId) duties.set(roleId, staffMemberId);
    }
    return [
      {
        scope: "season" as const,
        id: s.id,
        name: s.name,
        season: s.season,
        presetId: s.presetId,
        facts: { eventTypeKey: s.eventTypeKey, venueId: s.venueId, venueKind: s.venueKind },
        anchors: new Map(anchors.filter((a) => a.seasonId === id).map((a) => [a.key, a.date])),
        duties,
      },
    ];
  });
  return withContacts(tx, contexts);
}

// ---------------------------------------------------------------------------------------------
// Template versions and their items

export type TemplateItemRow = typeof templateItem.$inferSelect;

export type TemplateVersionContent = {
  templateId: string;
  templateName: string;
  versionId: string;
  version: number;
  items: TemplateItemRow[];
};

/** The published version of each template (null entries are left out), with its items in order. */
export async function loadPublishedVersions(
  tx: Tx,
  templateIds: string[],
): Promise<Map<string, TemplateVersionContent>> {
  const result = new Map<string, TemplateVersionContent>();
  if (templateIds.length === 0) return result;
  const versions = await tx
    .select({
      templateId: templateVersion.templateId,
      templateName: checklistTemplate.name,
      versionId: templateVersion.id,
      version: templateVersion.version,
    })
    .from(templateVersion)
    .innerJoin(checklistTemplate, eq(checklistTemplate.id, templateVersion.templateId))
    .where(
      and(
        inArray(templateVersion.templateId, templateIds),
        eq(templateVersion.status, "published"),
        isNull(checklistTemplate.archivedAt),
      ),
    );
  if (versions.length === 0) return result;
  const items = await tx
    .select()
    .from(templateItem)
    .where(
      inArray(
        templateItem.versionId,
        versions.map((v) => v.versionId),
      ),
    )
    .orderBy(asc(templateItem.sort), asc(templateItem.createdAt));
  for (const v of versions) {
    result.set(v.templateId, { ...v, items: items.filter((i) => i.versionId === v.versionId) });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// One item for one event or season

/** What a template item turns into for one event or season (due date and assignee worked out). */
export type DesiredTask = PlanItem & {
  itemId: string;
  /** Child item (ADR 0021): the parent item's stable key; its task becomes a subtask of the parent's task. */
  parentKey: string | null;
  anchorKey: string;
  offsetDays: number;
  dayMode: "calendar" | "business";
  assigneeId: string | null;
  approverStaffMemberId: string | null;
  /** The contact the item's default role points to at the Ort (Fahrplan R24), null = none. Set on new tasks only. */
  contactId: string | null;
  sort: number;
};

export type DesiredContext = { defaults: DueDefaults; holidays: ReadonlyMap<string, unknown> };

/** The holiday table a context's items need (empty unless an item counts business days). */
export function holidaysFor(
  context: InstantiationContext,
  items: readonly Pick<TemplateItemRow, "dayMode" | "offsetDays">[],
): Map<string, unknown> {
  const business = items.filter((i) => i.dayMode === "business");
  if (business.length === 0) return new Map();
  return holidaysForAnchors(
    context.anchors,
    Math.max(...business.map((i) => Math.abs(i.offsetDays))),
  );
}

/** The one place that turns an item into task values: used by creation, propagation and previews. */
export function desiredTask(
  item: TemplateItemRow,
  ev: InstantiationContext,
  context: DesiredContext,
): DesiredTask {
  const dueAt = taskDueInstant(
    ev.anchors,
    { anchorKey: item.anchorKey, offsetDays: item.offsetDays, dayMode: item.dayMode },
    context.holidays,
    {
      dueTime: item.dueTime,
      defaultDueTime: context.defaults.defaultDueTime,
      timeZone: context.defaults.timeZone,
    },
  );
  return {
    itemId: item.id,
    stableKey: item.stableKey,
    title: item.title,
    description: item.description,
    phase: item.phase,
    category: item.category,
    priority: item.priority,
    estimateMinutes: item.estimateMinutes,
    requiresPhoto: item.requiresPhoto,
    requiresNote: item.requiresNote,
    requiresAttachment: item.requiresAttachment,
    isKey: item.isKey,
    permitType: item.permitType,
    dutyRoleId: item.dutyRoleId,
    dueAt: dueAt ? dueAt.getTime() : null,
    anchorKey: item.anchorKey,
    offsetDays: item.offsetDays,
    dayMode: item.dayMode,
    assigneeId: item.dutyRoleId ? (ev.duties.get(item.dutyRoleId) ?? null) : null,
    approverStaffMemberId: item.approverDutyRoleId
      ? (ev.duties.get(item.approverDutyRoleId) ?? null)
      : null,
    contactId:
      item.contactRole && ev.contacts
        ? contactForRole(item.contactRole, ev.contacts, item.permitType)
        : null,
    sort: item.sort,
    parentKey: item.parentKey,
  };
}

/**
 * Items of a version that apply to the event or season, as the tasks they would become: only items of the
 * context's scope (an event never gets `season` items and a season never gets `event` items; a child item belongs
 * to its parent's scope), parents first, then child items (ADR 0021), which apply only together with their parent
 * and take its schedule and duty role unless they have their own (`inheritedItem`). The returned items carry those
 * resolved values.
 */
export function desiredTasks(
  version: TemplateVersionContent,
  ev: InstantiationContext,
  defaults: DueDefaults,
): { desired: DesiredTask[]; items: TemplateItemRow[] } {
  const applicable = applicableItems(
    version.items
      .filter((i) => i.parentKey !== null || i.scope === ev.scope)
      .map((i) => ({ ...i, condition: i.condition as ItemCondition | null })),
    ev.facts,
  );
  const byKey = new Map(version.items.map((i) => [i.stableKey, i]));
  const items = parentsFirst(applicable).map((i) =>
    i.parentKey ? inheritedItem(i, byKey.get(i.parentKey) ?? null) : i,
  );
  const context = { defaults, holidays: holidaysFor(ev, items) };
  return { desired: items.map((i) => desiredTask(i, ev, context)), items };
}

// ---------------------------------------------------------------------------------------------
// Writing tasks

/** The task values of a desired item for one event's or season's checklist. */
function taskValues(ev: InstantiationContext, checklistId: string, d: DesiredTask) {
  return {
    eventId: ev.scope === "event" ? ev.id : null,
    seasonId: ev.scope === "season" ? ev.id : null,
    checklistId,
    templateItemId: d.itemId,
    templateStableKey: d.stableKey,
    source: "template" as const,
    title: d.title,
    description: d.description,
    phase: d.phase as "pre" | "live" | "post",
    category: d.category as (typeof task.$inferInsert)["category"],
    priority: d.priority as "low" | "normal" | "high",
    dutyRoleId: d.dutyRoleId,
    assigneeId: d.assigneeId,
    anchorKey: d.anchorKey,
    offsetDays: d.offsetDays,
    dayMode: d.dayMode,
    dueAt: d.dueAt === null ? null : new Date(d.dueAt),
    estimateMinutes: d.estimateMinutes,
    requiresPhoto: d.requiresPhoto,
    requiresNote: d.requiresNote,
    requiresAttachment: d.requiresAttachment,
    isKey: d.isKey,
    contactId: d.contactId,
    approverStaffMemberId: d.approverStaffMemberId,
    // Keeps the template order inside a kanban column until someone moves cards around.
    boardSort: d.sort,
  };
}

/**
 * Tasks of the checklist by template stable key (top-level ones only: the possible parents of child items).
 */
export async function parentTasksByKey(
  tx: Tx,
  checklistId: string,
  keys: readonly string[],
): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const rows = await tx
    .select({ id: task.id, key: task.templateStableKey })
    .from(task)
    .where(
      and(
        eq(task.checklistId, checklistId),
        isNull(task.parentTaskId),
        isNotNull(task.templateStableKey),
        inArray(task.templateStableKey, [...new Set(keys)]),
      ),
    );
  return new Map(rows.flatMap((r) => (r.key ? [[r.key, r.id] as const] : [])));
}

/**
 * Inserts tasks for desired items into a checklist; existing ones (same stable key) are skipped. Top-level items
 * first, then child items as subtasks of their parent item's task (ADR 0021); a child whose parent has no task in
 * the checklist is skipped. Returns how many tasks were created.
 */
export async function insertTemplateTasks(
  tx: Tx,
  ev: InstantiationContext,
  checklistId: string,
  desired: DesiredTask[],
): Promise<number> {
  if (desired.length === 0) return 0;
  let created = 0;
  const insert = async (rows: (ReturnType<typeof taskValues> & { parentTaskId?: string })[]) => {
    for (const part of chunks(rows)) {
      const inserted = await tx
        .insert(task)
        .values(part)
        .onConflictDoNothing()
        .returning({ id: task.id });
      created += inserted.length;
    }
  };
  await insert(desired.filter((d) => !d.parentKey).map((d) => taskValues(ev, checklistId, d)));
  const children = desired.filter((d) => d.parentKey);
  if (children.length > 0) {
    const parents = await parentTasksByKey(
      tx,
      checklistId,
      children.map((d) => d.parentKey as string),
    );
    await insert(
      children.flatMap((d) => {
        const parentTaskId = parents.get(d.parentKey as string);
        return parentTaskId ? [{ ...taskValues(ev, checklistId, d), parentTaskId }] : [];
      }),
    );
  }
  return created;
}

/** The checklist of an event or season for a template (created when missing; idempotent). */
export async function ensureChecklist(
  tx: Tx,
  ev: InstantiationContext,
  version: TemplateVersionContent,
  sort: number,
): Promise<{ id: string; created: boolean }> {
  const owner = ev.scope === "event" ? eq(checklist.eventId, ev.id) : eq(checklist.seasonId, ev.id);
  const [existing] = await tx
    .select({ id: checklist.id })
    .from(checklist)
    .where(and(owner, eq(checklist.templateId, version.templateId), isNull(checklist.archivedAt)))
    .orderBy(asc(checklist.createdAt))
    .limit(1);
  if (existing) return { id: existing.id, created: false };
  const [row] = await tx
    .insert(checklist)
    .values({
      ...(ev.scope === "event" ? { eventId: ev.id } : { seasonId: ev.id }),
      templateId: version.templateId,
      templateVersionId: version.versionId,
      name: version.templateName,
      sort,
    })
    .returning({ id: checklist.id });
  if (!row) throw new Error("insert failed");
  return { id: row.id, created: true };
}

export type InstantiationSummary = { checklists: number; tasks: number };

/**
 * The shared loop: for each context one checklist per template linked to its preset (current published version)
 * with one task per applicable item of the context's scope. An event always gets its checklists (as before); a
 * season gets one only for templates that have season items for it, so markets without season work keep no empty
 * season checklists.
 */
async function instantiateContexts(
  tx: Tx,
  actor: ServiceActor,
  contexts: InstantiationContext[],
): Promise<InstantiationSummary> {
  const summary: InstantiationSummary = { checklists: 0, tasks: 0 };
  const withPreset = contexts.filter((c) => c.presetId !== null);
  if (withPreset.length === 0) return summary;

  const presetIds = [...new Set(withPreset.map((c) => c.presetId as string))];
  const links = await tx
    .select({
      presetId: eventPresetTemplate.presetId,
      templateId: eventPresetTemplate.templateId,
      sort: eventPresetTemplate.sort,
    })
    .from(eventPresetTemplate)
    .innerJoin(checklistTemplate, eq(checklistTemplate.id, eventPresetTemplate.templateId))
    .where(
      and(
        inArray(eventPresetTemplate.presetId, presetIds),
        eq(checklistTemplate.kind, "event"),
        isNull(checklistTemplate.archivedAt),
      ),
    )
    .orderBy(asc(eventPresetTemplate.sort), asc(checklistTemplate.name));
  if (links.length === 0) return summary;
  const versions = await loadPublishedVersions(tx, [...new Set(links.map((l) => l.templateId))]);
  const defaults = await loadDueDefaults(tx);

  const entries: Parameters<typeof audit>[2] = [];
  for (const ev of withPreset) {
    const own = links.filter((l) => l.presetId === ev.presetId);
    for (const [index, link] of own.entries()) {
      const version = versions.get(link.templateId);
      if (!version) continue;
      const { desired } = desiredTasks(version, ev, defaults);
      if (ev.scope === "season" && desired.length === 0) continue;
      const list = await ensureChecklist(tx, ev, version, index);
      const count = await insertTemplateTasks(tx, ev, list.id, desired);
      if (list.created) summary.checklists += 1;
      summary.tasks += count;
      if (list.created || count > 0)
        entries.push({
          action: "checklist.create",
          entityType: "checklist",
          entityId: list.id,
          diff: {
            ...(ev.scope === "event" ? { eventId: ev.id } : { seasonId: ev.id }),
            templateId: version.templateId,
            templateName: version.templateName,
            versionId: version.versionId,
            version: version.version,
            tasks: count,
          },
        });
    }
  }
  await audit(tx, actor.id, entries);
  return summary;
}

/**
 * THE one service path that turns timeline templates into work (CLAUDE.md, data model "Generating events"):
 * for each new event one checklist per template linked to its preset (current published version) and one
 * task per applicable `event` item, due at anchor + offset, assigned to whoever holds the item's duty role at the
 * event; child items become subtasks of their parent item's task (ADR 0021). `season` items are left out: they
 * belong to the Saison record (`instantiateTemplatesForSeasons`). Called by `instantiateEvents` inside its
 * transaction; safe to call again (nothing is duplicated: the checklist is reused and the partial unique index
 * skips tasks that exist).
 */
export async function instantiateTemplatesForEvents(
  tx: Tx,
  actor: ServiceActor,
  eventIds: string[],
): Promise<InstantiationSummary> {
  return instantiateContexts(tx, actor, await loadEventContexts(tx, eventIds));
}

/**
 * The same path for Saison records (research 13 §6.2): the `season` items of the templates linked to the
 * season's market become tasks of a season checklist (`checklist.season_id`, `task.season_id`), due relative to
 * the season anchors (`season_start`, `season_end`) and assigned through the market's default duties. Called by
 * `ensureEventSeasonTx` when it creates a record; idempotent like the event path.
 */
export async function instantiateTemplatesForSeasons(
  tx: Tx,
  actor: ServiceActor,
  seasonIds: string[],
): Promise<InstantiationSummary> {
  return instantiateContexts(tx, actor, await loadSeasonContexts(tx, seasonIds));
}
