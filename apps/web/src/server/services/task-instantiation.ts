import "server-only";
import {
  applicableItems,
  type ConditionFacts,
  clockTime,
  DEFAULT_TIME_ZONE,
  holidaysBetween,
  holidayWindow,
  type ItemCondition,
  type PlanItem,
  taskDueInstant,
} from "@marktwerk/core";
import {
  checklist,
  checklistTemplate,
  event,
  eventAnchor,
  eventDuty,
  eventPresetTemplate,
  eventType,
  settings,
  task,
  taskCheckItem,
  taskDependency,
  templateItem,
  templateVersion,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "../actor";
import type { db } from "../db";
import { audit } from "./audit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
export async function loadDueDefaults(tx: Pick<typeof db, "select">): Promise<DueDefaults> {
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
// Events: anchors, duties, condition facts

export type EventContext = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  presetId: string | null;
  facts: ConditionFacts;
  anchors: Map<string, string>;
  /** duty_role.id → staff_member.id */
  duties: Map<string, string>;
};

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
  return ids.flatMap((id) => {
    const e = byId.get(id);
    if (!e) return [];
    return [
      {
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
// One item for one event

/** What a template item turns into for one event (due date and assignee worked out). */
export type DesiredTask = PlanItem & {
  itemId: string;
  anchorKey: string;
  offsetDays: number;
  dayMode: "calendar" | "business";
  assigneeId: string | null;
  approverStaffMemberId: string | null;
  sort: number;
};

export type DesiredContext = { defaults: DueDefaults; holidays: ReadonlyMap<string, unknown> };

/** The holiday table an event's items need (empty unless an item counts business days). */
export function holidaysFor(
  eventContext: EventContext,
  items: readonly Pick<TemplateItemRow, "dayMode" | "offsetDays">[],
): Map<string, unknown> {
  const business = items.filter((i) => i.dayMode === "business");
  if (business.length === 0) return new Map();
  return holidaysForAnchors(
    eventContext.anchors,
    Math.max(...business.map((i) => Math.abs(i.offsetDays))),
  );
}

/** The one place that turns an item into task values: used by creation, propagation and previews. */
export function desiredTask(
  item: TemplateItemRow,
  ev: EventContext,
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
    dutyRoleId: item.dutyRoleId,
    dueAt: dueAt ? dueAt.getTime() : null,
    anchorKey: item.anchorKey,
    offsetDays: item.offsetDays,
    dayMode: item.dayMode,
    assigneeId: item.dutyRoleId ? (ev.duties.get(item.dutyRoleId) ?? null) : null,
    approverStaffMemberId: item.approverDutyRoleId
      ? (ev.duties.get(item.approverDutyRoleId) ?? null)
      : null,
    sort: item.sort,
  };
}

/** Items of a version that apply to the event, as the tasks they would become. */
export function desiredTasks(
  version: TemplateVersionContent,
  ev: EventContext,
  defaults: DueDefaults,
): { desired: DesiredTask[]; items: TemplateItemRow[] } {
  const items = applicableItems(
    version.items.map((i) => ({ ...i, condition: i.condition as ItemCondition | null })),
    ev.facts,
  );
  const context = { defaults, holidays: holidaysFor(ev, items) };
  return { desired: items.map((i) => desiredTask(i, ev, context)), items };
}

// ---------------------------------------------------------------------------------------------
// Writing tasks

/** Check items (sub-steps) of the tasks that were just created. */
async function insertCheckItems(
  tx: Tx,
  created: { id: string; templateStableKey: string | null }[],
  itemsByKey: Map<string, TemplateItemRow>,
) {
  const rows = created.flatMap((t) => {
    const item = t.templateStableKey ? itemsByKey.get(t.templateStableKey) : undefined;
    return (item?.checkItems ?? []).map((title, index) => ({ taskId: t.id, title, sort: index }));
  });
  for (const part of chunks(rows)) await tx.insert(taskCheckItem).values(part);
}

/**
 * Dependencies between the tasks of one checklist ("needs B first", informational). Only for the items
 * named in `keys`; targets that have no task in the checklist (item not applicable) are skipped.
 */
export async function linkDependencies(
  tx: Tx,
  checklistId: string,
  items: TemplateItemRow[],
  keys: ReadonlySet<string>,
) {
  const withDeps = items.filter((i) => keys.has(i.stableKey) && i.dependsOnKeys.length > 0);
  if (withDeps.length === 0) return;
  const tasks = await tx
    .select({ id: task.id, key: task.templateStableKey })
    .from(task)
    .where(eq(task.checklistId, checklistId));
  const idOf = new Map(tasks.flatMap((t) => (t.key ? [[t.key, t.id] as const] : [])));
  const rows = withDeps.flatMap((item) => {
    const taskId = idOf.get(item.stableKey);
    if (!taskId) return [];
    return item.dependsOnKeys.flatMap((dep) => {
      const dependsOnTaskId = idOf.get(dep);
      return dependsOnTaskId && dependsOnTaskId !== taskId ? [{ taskId, dependsOnTaskId }] : [];
    });
  });
  for (const part of chunks(rows))
    await tx.insert(taskDependency).values(part).onConflictDoNothing();
}

/** Inserts tasks for desired items into a checklist; existing ones (same stable key) are skipped. */
export async function insertTemplateTasks(
  tx: Tx,
  ev: EventContext,
  checklistId: string,
  desired: DesiredTask[],
  items: TemplateItemRow[],
): Promise<number> {
  if (desired.length === 0) return 0;
  const itemsByKey = new Map(items.map((i) => [i.stableKey, i]));
  const created: { id: string; templateStableKey: string | null }[] = [];
  for (const part of chunks(desired)) {
    const rows = await tx
      .insert(task)
      .values(
        part.map((d) => ({
          eventId: ev.id,
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
          approverStaffMemberId: d.approverStaffMemberId,
          // Keeps the template order inside a kanban column until someone moves cards around.
          boardSort: d.sort,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: task.id, templateStableKey: task.templateStableKey });
    created.push(...rows);
    await insertCheckItems(tx, rows, itemsByKey);
  }
  await linkDependencies(
    tx,
    checklistId,
    items,
    new Set(created.map((c) => c.templateStableKey ?? "")),
  );
  return created.length;
}

/** The checklist of an event for a template (created when missing; idempotent). */
export async function ensureChecklist(
  tx: Tx,
  ev: EventContext,
  version: TemplateVersionContent,
  sort: number,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await tx
    .select({ id: checklist.id })
    .from(checklist)
    .where(
      and(
        eq(checklist.eventId, ev.id),
        eq(checklist.templateId, version.templateId),
        isNull(checklist.archivedAt),
      ),
    )
    .orderBy(asc(checklist.createdAt))
    .limit(1);
  if (existing) return { id: existing.id, created: false };
  const [row] = await tx
    .insert(checklist)
    .values({
      eventId: ev.id,
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
 * THE one service path that turns timeline templates into work (CLAUDE.md, data model "Generating events"):
 * for each new event one checklist per template linked to its preset (current published version) and one
 * task per applicable item, due at anchor + offset, assigned to whoever holds the item's duty role at the
 * event. Called by `instantiateEvents` inside its transaction; safe to call again (nothing is duplicated:
 * the checklist is reused and the partial unique index skips tasks that exist).
 */
export async function instantiateTemplatesForEvents(
  tx: Tx,
  actor: Actor,
  eventIds: string[],
): Promise<InstantiationSummary> {
  const summary: InstantiationSummary = { checklists: 0, tasks: 0 };
  const contexts = (await loadEventContexts(tx, eventIds)).filter((e) => e.presetId !== null);
  if (contexts.length === 0) return summary;

  const presetIds = [...new Set(contexts.map((c) => c.presetId as string))];
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
  for (const ev of contexts) {
    const own = links.filter((l) => l.presetId === ev.presetId);
    for (const [index, link] of own.entries()) {
      const version = versions.get(link.templateId);
      if (!version) continue;
      const list = await ensureChecklist(tx, ev, version, index);
      const { desired, items } = desiredTasks(version, ev, defaults);
      const count = await insertTemplateTasks(tx, ev, list.id, desired, items);
      if (list.created) summary.checklists += 1;
      summary.tasks += count;
      if (list.created || count > 0)
        entries.push({
          action: "checklist.create",
          entityType: "checklist",
          entityId: list.id,
          diff: {
            eventId: ev.id,
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
