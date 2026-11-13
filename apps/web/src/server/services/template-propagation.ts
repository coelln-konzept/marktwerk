import "server-only";
import {
  can,
  type KeepReason,
  type PlanTask,
  type PropagationChange,
  type PropagationPlan,
  planPropagation,
  planSize,
} from "@marktwerk/core";
import {
  checklist,
  checklistTemplate,
  event,
  eventPreset,
  eventPresetTemplate,
  eventSeason,
  task,
  templateItem,
  templateVersion,
} from "@marktwerk/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, notInArray, or } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "../../lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { linkPermitTasks } from "./permits";
import {
  type DesiredTask,
  type DueDefaults,
  desiredTasks,
  ensureChecklist,
  type InstantiationContext,
  insertTemplateTasks,
  loadDueDefaults,
  loadEventContexts,
  loadPublishedVersions,
  loadSeasonContexts,
  parentTasksByKey,
  type TemplateItemRow,
  type TemplateVersionContent,
} from "./task-instantiation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ApplyError = "not_found" | "no_published_version" | "no_events" | "not_applicable";

export class TemplateApplyError extends Error {
  constructor(readonly code: ApplyError) {
    super(code);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;

/** At most this many events and seasons in one go (a season of one preset is ~10, all presets ~100). */
export const MAX_APPLY_EVENTS = 150;

/** Events in these states no longer get template changes. */
const FINISHED_STATUSES = ["completed", "closed", "cancelled"] as const;

type ExistingTask = PlanTask & {
  assigneeOverridden: boolean;
  title: string;
};

/** What bringing one checklist (of an event or a Saison record) to the published version would change. */
type ApplyChanges = {
  /** null = no checklist from this template yet (linked through the market). */
  checklistId: string | null;
  fromVersion: number | null;
  add: { key: string; title: string; dueAt: number | null }[];
  update: { taskId: string; key: string; title: string; changes: PropagationChange[] }[];
  remove: { taskId: string; title: string }[];
  /** Subtasks whose child item is gone: they are cancelled (ADR 0021). */
  cancel: { taskId: string; title: string }[];
  keep: { taskId: string; title: string; reason: KeepReason }[];
  /** Tasks that already match their item. */
  same: number;
  /** add + update + remove + cancel */
  size: number;
};

export type ApplyEventPlan = ApplyChanges & {
  eventId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
};

/** A Saison record (research 13 §6) as a target, labelled "<Markt> · Saison 2027": it takes the `season` items. */
export type ApplySeasonPlan = ApplyChanges & {
  seasonId: string;
  /** The market's name. */
  name: string;
  /** The calendar year. */
  season: number;
  status: string;
  /** The `season_start` anchor (first date, else the expected start); null when the record has none. */
  seasonStart: string | null;
};

export type ApplyPreview = {
  templateId: string;
  templateName: string;
  /** Business date of today in the company time zone (for "wäre sofort überfällig"). */
  today: string;
  version: { id: string; version: number; publishedAt: Date | null; changeNote: string | null };
  events: ApplyEventPlan[];
  /** Saison records that could take over the version's season items, by year and market name. */
  seasons: ApplySeasonPlan[];
};

type Candidate = { checklistId: string | null; sort: number; fromVersion: number | null };

type Plan<S> = {
  summary: S;
  checklistId: string | null;
  sort: number;
  ctx: InstantiationContext;
  items: TemplateItemRow[];
  plan: PropagationPlan<DesiredTask, ExistingTask>;
};

type Computed = {
  version: TemplateVersionContent;
  plans: Plan<ApplyEventPlan>[];
  seasonPlans: Plan<ApplySeasonPlan>[];
  today: string;
};

/** Narrows the real run to the chosen targets; absent = every candidate (the preview). */
type Only = { eventIds: string[]; seasonIds: string[] };

function existingTasks(
  rows: { task: typeof task.$inferSelect; permitType: string | null }[],
): ExistingTask[] {
  // A subtask's parent is matched by its template key (null when the parent is not from the template).
  const keyOf = new Map(rows.map(({ task: r }) => [r.id, r.templateStableKey]));
  return rows.map(({ task: r, permitType }) => ({
    permitType,
    id: r.id,
    templateStableKey: r.templateStableKey,
    parentTaskId: r.parentTaskId,
    parentKey: r.parentTaskId ? (keyOf.get(r.parentTaskId) ?? null) : null,
    status: r.status,
    customized: r.customized,
    removedFromTemplate: r.removedFromTemplate,
    dueOverridden: r.dueOverridden,
    assigneeOverridden: r.assigneeOverridden,
    title: r.title,
    description: r.description,
    phase: r.phase ?? "pre",
    category: r.category,
    priority: r.priority,
    estimateMinutes: r.estimateMinutes,
    requiresPhoto: r.requiresPhoto,
    requiresNote: r.requiresNote,
    requiresAttachment: r.requiresAttachment,
    isKey: r.isKey,
    dutyRoleId: r.dutyRoleId,
    dueAt: r.dueAt ? r.dueAt.getTime() : null,
  }));
}

/** The first candidate row per target; checklists already at the published version have nothing to take over. */
function candidatesOf(
  rows: {
    id: string;
    checklistId: string | null;
    checklistSort: number | null;
    fromVersion: number | null;
  }[],
  version: TemplateVersionContent,
): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();
  for (const r of rows) {
    if (candidates.has(r.id)) continue;
    if (r.checklistId && r.fromVersion !== null && r.fromVersion >= version.version) continue;
    candidates.set(r.id, {
      checklistId: r.checklistId,
      sort: r.checklistSort ?? 0,
      fromVersion: r.fromVersion,
    });
  }
  return candidates;
}

/**
 * The merge plan of one event or season (the same for both, `desiredTasks` picks the items of the context's
 * scope).
 */
async function planOne(
  tx: Tx,
  version: TemplateVersionContent,
  ctx: InstantiationContext,
  candidate: Candidate,
  defaults: DueDefaults,
) {
  const { desired, items } = desiredTasks(version, ctx, defaults);
  const existing = candidate.checklistId
    ? existingTasks(
        await tx
          .select({ task, permitType: templateItem.permitType })
          .from(task)
          .leftJoin(templateItem, eq(templateItem.id, task.templateItemId))
          .where(eq(task.checklistId, candidate.checklistId)),
      )
    : [];
  const plan = planPropagation<DesiredTask, ExistingTask>(desired, existing);
  const changes: ApplyChanges = {
    checklistId: candidate.checklistId,
    fromVersion: candidate.fromVersion,
    add: plan.add.map((i) => ({ key: i.stableKey, title: i.title, dueAt: i.dueAt })),
    update: plan.update.map((u) => ({
      taskId: u.task.id,
      key: u.item.stableKey,
      title: u.item.title,
      changes: u.changes,
    })),
    remove: plan.remove.map((t) => ({ taskId: t.id, title: t.title })),
    cancel: plan.cancel.map((t) => ({ taskId: t.id, title: t.title })),
    keep: plan.keep.map((k) => ({ taskId: k.task.id, title: k.task.title, reason: k.reason })),
    same: plan.same,
    size: planSize(plan),
  };
  return { desired, items, plan, changes };
}

/**
 * Works out, for upcoming events and open Saison records, what bringing them to the template's published version
 * would change. Targets qualify when they have a checklist of an older version of this template, or are linked to
 * the template through their market but have no checklist yet (a season only when the version has season items
 * for it, like instantiation). `only` narrows it for the real run. Both the preview and `applyTemplateVersion` use
 * this, so they cannot disagree.
 */
async function computePlans(tx: Tx, templateId: string, only?: Only): Promise<Computed> {
  if (!UUID.test(templateId)) throw new TemplateApplyError("not_found");
  const [template] = await tx
    .select({ id: checklistTemplate.id })
    .from(checklistTemplate)
    .where(and(eq(checklistTemplate.id, templateId), isNull(checklistTemplate.archivedAt)));
  if (!template) throw new TemplateApplyError("not_found");
  const version = (await loadPublishedVersions(tx, [templateId])).get(templateId);
  if (!version) throw new TemplateApplyError("no_published_version");

  const defaults = await loadDueDefaults(tx);
  const today = todayIn(defaults.timeZone);
  const scan: Scan = { tx, templateId, version, defaults, today, only };
  const plans = only && only.eventIds.length === 0 ? [] : await eventPlans(scan);
  const seasonPlans = only && only.seasonIds.length === 0 ? [] : await seasonPlansOf(scan);
  return { version, plans, seasonPlans, today };
}

/** What the event and season scans share. */
type Scan = {
  tx: Tx;
  templateId: string;
  version: TemplateVersionContent;
  defaults: DueDefaults;
  today: string;
  only: Only | undefined;
};

/** Upcoming events (not finished, cancelled or archived) linked to the template or with a checklist of it. */
async function eventPlans({
  tx,
  templateId,
  version,
  defaults,
  today,
  only,
}: Scan): Promise<Plan<ApplyEventPlan>[]> {
  const rows = await tx
    .select({
      id: event.id,
      checklistId: checklist.id,
      checklistSort: checklist.sort,
      fromVersion: templateVersion.version,
    })
    .from(event)
    .leftJoin(
      checklist,
      and(
        eq(checklist.eventId, event.id),
        eq(checklist.templateId, templateId),
        isNull(checklist.archivedAt),
      ),
    )
    .leftJoin(templateVersion, eq(templateVersion.id, checklist.templateVersionId))
    .leftJoin(
      eventPresetTemplate,
      and(
        eq(eventPresetTemplate.presetId, event.presetId),
        eq(eventPresetTemplate.templateId, templateId),
      ),
    )
    .where(
      and(
        isNull(event.archivedAt),
        notInArray(event.status, [...FINISHED_STATUSES]),
        gte(event.endsOn, today),
        or(isNotNull(checklist.id), isNotNull(eventPresetTemplate.templateId)),
        only ? inArray(event.id, only.eventIds) : undefined,
      ),
    )
    .orderBy(asc(event.startsOn), asc(event.name));
  const candidates = candidatesOf(rows, version);
  const contexts = await loadEventContexts(tx, [...candidates.keys()]);
  const eventRows =
    candidates.size === 0
      ? []
      : await tx
          .select({ id: event.id, status: event.status })
          .from(event)
          .where(inArray(event.id, [...candidates.keys()]));
  const statusOf = new Map(eventRows.map((e) => [e.id, e.status]));

  const result: Plan<ApplyEventPlan>[] = [];
  for (const ev of contexts) {
    const candidate = candidates.get(ev.id);
    if (!candidate) continue;
    const { items, plan, changes } = await planOne(tx, version, ev, candidate, defaults);
    result.push({
      checklistId: candidate.checklistId,
      sort: candidate.sort,
      ctx: ev,
      items,
      plan,
      summary: {
        ...changes,
        eventId: ev.id,
        name: ev.name,
        startsOn: ev.startsOn,
        endsOn: ev.endsOn,
        status: statusOf.get(ev.id) ?? "draft",
      },
    });
  }
  return result;
}

/**
 * Saison records of this year and later that are not closed or archived (research 13 §6.2: season items
 * propagate like event items). Existing records never get a new version on their own (R9).
 */
async function seasonPlansOf({
  tx,
  templateId,
  version,
  defaults,
  today,
  only,
}: Scan): Promise<Plan<ApplySeasonPlan>[]> {
  const rows = await tx
    .select({
      id: eventSeason.id,
      checklistId: checklist.id,
      checklistSort: checklist.sort,
      fromVersion: templateVersion.version,
      status: eventSeason.status,
    })
    .from(eventSeason)
    .innerJoin(eventPreset, eq(eventPreset.id, eventSeason.presetId))
    .leftJoin(
      checklist,
      and(
        eq(checklist.seasonId, eventSeason.id),
        eq(checklist.templateId, templateId),
        isNull(checklist.archivedAt),
      ),
    )
    .leftJoin(templateVersion, eq(templateVersion.id, checklist.templateVersionId))
    .leftJoin(
      eventPresetTemplate,
      and(
        eq(eventPresetTemplate.presetId, eventSeason.presetId),
        eq(eventPresetTemplate.templateId, templateId),
      ),
    )
    .where(
      and(
        isNull(eventSeason.archivedAt),
        ne(eventSeason.status, "closed"),
        gte(eventSeason.season, Number(today.slice(0, 4))),
        or(isNotNull(checklist.id), isNotNull(eventPresetTemplate.templateId)),
        only ? inArray(eventSeason.id, only.seasonIds) : undefined,
      ),
    )
    .orderBy(asc(eventSeason.season), asc(eventPreset.name));
  const candidates = candidatesOf(rows, version);
  const statusOf = new Map(rows.map((r) => [r.id, r.status]));
  const contexts = await loadSeasonContexts(tx, [...candidates.keys()]);

  const result: Plan<ApplySeasonPlan>[] = [];
  for (const season of contexts) {
    const candidate = candidates.get(season.id);
    if (!candidate) continue;
    const { desired, items, plan, changes } = await planOne(
      tx,
      version,
      season,
      candidate,
      defaults,
    );
    // Like instantiation: a season gets a checklist only for a version with season items for it.
    if (!candidate.checklistId && desired.length === 0) continue;
    result.push({
      checklistId: candidate.checklistId,
      sort: candidate.sort,
      ctx: season,
      items,
      plan,
      summary: {
        ...changes,
        seasonId: season.id,
        name: season.name,
        season: season.season,
        status: statusOf.get(season.id) ?? "planning",
        seasonStart: season.anchors.get("season_start") ?? null,
      },
    });
  }
  return result;
}

/**
 * "Auf Veranstaltungen anwenden…", step 1 and 2: the upcoming events and open Saison records that could take over
 * the published version, each with what would change. Nothing is written and nothing is pre-selected by the caller.
 */
export async function previewTemplateApplication(
  actor: Actor,
  templateId: string,
): Promise<ApplyPreview> {
  if (!can(actor.role, "template", "write")) forbidden();
  const [meta] = UUID.test(templateId)
    ? await db
        .select({ name: checklistTemplate.name })
        .from(checklistTemplate)
        .where(eq(checklistTemplate.id, templateId))
    : [];
  if (!meta) throw new TemplateApplyError("not_found");
  const { version, plans, seasonPlans, today } = await db.transaction((tx) =>
    computePlans(tx, templateId),
  );
  const [published] = await db
    .select({ publishedAt: templateVersion.publishedAt, changeNote: templateVersion.changeNote })
    .from(templateVersion)
    .where(eq(templateVersion.id, version.versionId));
  return {
    templateId,
    templateName: meta.name,
    today,
    version: {
      id: version.versionId,
      version: version.version,
      publishedAt: published?.publishedAt ?? null,
      changeNote: published?.changeNote ?? null,
    },
    events: plans.map((p) => p.summary),
    seasons: seasonPlans.map((p) => p.summary),
  };
}

type Counts = { added: number; updated: number; removed: number; cancelled: number };

export type ApplyResult = Counts & {
  events: number;
  /** Saison records that took over the version. */
  seasons: number;
  perEvent: ({ eventId: string } & Counts)[];
  perSeason: ({ seasonId: string } & Counts)[];
};

/**
 * THE one service path that brings existing events and Saison records to a newer template version (CLAUDE.md:
 * deliberate, never automatic). For each chosen event or season: new items become tasks, open untouched tasks take
 * over the changed fields, open untouched tasks of vanished items are marked `removed_from_template` (subtasks of
 * vanished child items are cancelled; child items are matched by `stable_key` like any item, ADR 0021). Done,
 * skipped, cancelled and customised tasks are never touched, nor are due dates / assignees that were set by hand.
 * An event takes the `event` items, a season the `season` items (research 13 §6.2). The merge is planned again
 * inside the transaction, so it equals the preview (or fails with `not_applicable` for a target that stopped
 * qualifying).
 */
export async function applyTemplateVersion(
  actor: Actor,
  templateId: string,
  eventIds: string[],
  seasonIds: string[] = [],
): Promise<ApplyResult> {
  if (!can(actor.role, "template", "write")) forbidden();
  const events = [...new Set(eventIds)];
  const seasons = [...new Set(seasonIds)];
  const total = events.length + seasons.length;
  if (total === 0 || total > MAX_APPLY_EVENTS) throw new TemplateApplyError("no_events");
  if (![...events, ...seasons].every((id) => typeof id === "string" && UUID.test(id)))
    throw new TemplateApplyError("not_applicable");

  return db.transaction(async (tx) => {
    // Lock the targets in a fixed order so two runs cannot deadlock.
    if (events.length > 0)
      await tx
        .select({ id: event.id })
        .from(event)
        .where(inArray(event.id, events))
        .orderBy(asc(event.id))
        .for("update");
    if (seasons.length > 0)
      await tx
        .select({ id: eventSeason.id })
        .from(eventSeason)
        .where(inArray(eventSeason.id, seasons))
        .orderBy(asc(eventSeason.id))
        .for("update");
    const { version, plans, seasonPlans } = await computePlans(tx, templateId, {
      eventIds: events,
      seasonIds: seasons,
    });
    if (plans.length !== events.length || seasonPlans.length !== seasons.length)
      throw new TemplateApplyError("not_applicable");

    const result: ApplyResult = {
      events: 0,
      seasons: 0,
      added: 0,
      updated: 0,
      removed: 0,
      cancelled: 0,
      perEvent: [],
      perSeason: [],
    };
    const entries: Parameters<typeof audit>[2] = [];
    for (const p of [...plans, ...seasonPlans]) {
      const counts = await applyPlan(tx, version, p);
      result.added += counts.added;
      result.updated += counts.updated;
      result.removed += counts.removed;
      result.cancelled += counts.cancelled;
      if (p.ctx.scope === "event") {
        result.events += 1;
        result.perEvent.push({ eventId: p.ctx.id, ...counts });
      } else {
        result.seasons += 1;
        result.perSeason.push({ seasonId: p.ctx.id, ...counts });
      }
      entries.push({
        action: "template.apply",
        entityType: p.ctx.scope === "event" ? "event" : "event_season",
        entityId: p.ctx.id,
        diff: {
          templateId,
          templateName: version.templateName,
          checklistId: counts.checklistId,
          fromVersion: p.summary.fromVersion,
          toVersion: version.version,
          added: counts.added,
          updated: counts.updated,
          removed: counts.removed,
          cancelled: counts.cancelled,
          kept: p.plan.keep.length,
        },
      });
    }
    await audit(tx, actor.id, entries);
    // New and changed items that apply for a permit get linked to the event's permit (one linking path).
    await linkPermitTasks(
      tx,
      plans.map((p) => p.ctx.id),
      actor,
    );
    return result;
  });
}

/** Writes one target's merge plan: new tasks, changed tasks, marks, cancelled subtasks, moves, the version. */
async function applyPlan(
  tx: Tx,
  version: TemplateVersionContent,
  p: Plan<ApplyChanges>,
): Promise<Counts & { checklistId: string }> {
  const list = p.checklistId
    ? { id: p.checklistId }
    : await ensureChecklist(tx, p.ctx, version, p.sort);
  let added = 0;
  if (p.plan.add.length > 0) {
    added = await insertTemplateTasks(tx, p.ctx, list.id, p.plan.add);
  }
  for (const u of p.plan.update) {
    const d = u.item;
    const t = u.task;
    await tx
      .update(task)
      .set({
        templateItemId: d.itemId,
        title: d.title,
        description: d.description,
        phase: d.phase as "pre" | "live" | "post",
        category: d.category as (typeof task.$inferInsert)["category"],
        priority: d.priority as "low" | "normal" | "high",
        estimateMinutes: d.estimateMinutes,
        requiresPhoto: d.requiresPhoto,
        requiresNote: d.requiresNote,
        requiresAttachment: d.requiresAttachment,
        isKey: d.isKey,
        // A task whose item stopped naming a permit lets go of it (a new one links below).
        ...(u.changes.includes("permit") ? { permitId: null } : {}),
        dutyRoleId: d.dutyRoleId,
        anchorKey: d.anchorKey,
        offsetDays: d.offsetDays,
        dayMode: d.dayMode,
        approverStaffMemberId: d.approverStaffMemberId,
        removedFromTemplate: false,
        ...(t.dueOverridden ? {} : { dueAt: d.dueAt === null ? null : new Date(d.dueAt) }),
        // The duty role changed: the new holder takes over unless someone assigned by hand.
        ...(u.changes.includes("duty") && !t.assigneeOverridden
          ? { assigneeId: d.assigneeId }
          : {}),
      })
      .where(eq(task.id, t.id));
  }
  if (p.plan.remove.length > 0)
    await tx
      .update(task)
      .set({ removedFromTemplate: true })
      .where(
        inArray(
          task.id,
          p.plan.remove.map((t) => t.id),
        ),
      );
  if (p.plan.cancel.length > 0)
    await tx
      .update(task)
      .set({ status: "cancelled" })
      .where(
        inArray(
          task.id,
          p.plan.cancel.map((t) => t.id),
        ),
      );
  await moveToNewParents(
    tx,
    list.id,
    p.plan.update.filter((u) => u.changes.includes("parent")),
  );

  await tx
    .update(checklist)
    .set({ templateVersionId: version.versionId, name: version.templateName })
    .where(eq(checklist.id, list.id));

  return {
    checklistId: list.id,
    added,
    updated: p.plan.update.length,
    removed: p.plan.remove.length,
    cancelled: p.plan.cancel.length,
  };
}

/**
 * Child items that moved to another parent (or to the top) in the new version: their tasks follow. Lifting out
 * goes first, so a task that loses its subtasks can become one; a move that would break the one-level rule (the
 * task has subtasks of its own, or the new parent is a subtask) is left as it is.
 */
async function moveToNewParents(
  tx: Tx,
  checklistId: string,
  moves: { task: ExistingTask; item: DesiredTask }[],
) {
  if (moves.length === 0) return;
  const lifts = moves.filter((m) => !m.item.parentKey);
  for (const m of lifts)
    await tx.update(task).set({ parentTaskId: null }).where(eq(task.id, m.task.id));
  const nests = moves.filter((m) => m.item.parentKey);
  const parents = await parentTasksByKey(
    tx,
    checklistId,
    nests.map((m) => m.item.parentKey as string),
  );
  for (const m of nests) {
    const parentId = parents.get(m.item.parentKey as string);
    if (!parentId || parentId === m.task.id) continue;
    const [child] = await tx
      .select({ id: task.id })
      .from(task)
      .where(eq(task.parentTaskId, m.task.id))
      .limit(1);
    if (child) continue;
    await tx.update(task).set({ parentTaskId: parentId }).where(eq(task.id, m.task.id));
  }
}
