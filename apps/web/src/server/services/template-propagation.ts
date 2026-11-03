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
  eventPresetTemplate,
  task,
  templateItem,
  templateVersion,
} from "@marktwerk/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, isNull, notInArray, or } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "../../lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { linkPermitTasks } from "./permits";
import {
  type DesiredTask,
  desiredTasks,
  ensureChecklist,
  insertTemplateTasks,
  loadDueDefaults,
  loadEventContexts,
  loadPublishedVersions,
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

/** At most this many events in one go (a season of one preset is ~10, all presets ~100). */
export const MAX_APPLY_EVENTS = 150;

/** Events in these states no longer get template changes. */
const FINISHED_STATUSES = ["completed", "closed", "cancelled"] as const;

type ExistingTask = PlanTask & {
  assigneeOverridden: boolean;
  title: string;
};

export type ApplyEventPlan = {
  eventId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
  /** null = the event has no checklist from this template yet (linked through its preset). */
  checklistId: string | null;
  fromVersion: number | null;
  add: { key: string; title: string; dueAt: number | null }[];
  update: { taskId: string; key: string; title: string; changes: PropagationChange[] }[];
  remove: { taskId: string; title: string }[];
  keep: { taskId: string; title: string; reason: KeepReason }[];
  /** Tasks that already match their item. */
  same: number;
  /** add + update + remove */
  size: number;
};

export type ApplyPreview = {
  templateId: string;
  templateName: string;
  /** Business date of today in the company time zone (for "wäre sofort überfällig"). */
  today: string;
  version: { id: string; version: number; publishedAt: Date | null; changeNote: string | null };
  events: ApplyEventPlan[];
};

type Computed = { version: TemplateVersionContent; plans: Plan[]; today: string };
type Plan = {
  summary: ApplyEventPlan;
  checklistId: string | null;
  sort: number;
  ev: Awaited<ReturnType<typeof loadEventContexts>>[number];
  items: TemplateItemRow[];
  plan: PropagationPlan<DesiredTask, ExistingTask>;
};

function existingTasks(
  rows: { task: typeof task.$inferSelect; permitType: string | null }[],
): ExistingTask[] {
  return rows.map(({ task: r, permitType }) => ({
    permitType,
    id: r.id,
    templateStableKey: r.templateStableKey,
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

/**
 * Works out, for upcoming events, what bringing them to the template's published version would change.
 * Events qualify when they have a checklist of an older version of this template, or are linked to the
 * template through their preset but have no checklist yet. `onlyEventIds` narrows it for the real run.
 * Both the preview and `applyTemplateVersion` use this, so they cannot disagree.
 */
async function computePlans(
  tx: Tx,
  templateId: string,
  onlyEventIds?: string[],
): Promise<Computed> {
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
  const rows = await tx
    .select({
      eventId: event.id,
      checklistId: checklist.id,
      checklistSort: checklist.sort,
      fromVersion: templateVersion.version,
      linked: eventPresetTemplate.templateId,
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
        onlyEventIds ? inArray(event.id, onlyEventIds) : undefined,
      ),
    )
    .orderBy(asc(event.startsOn), asc(event.name));

  const candidates = new Map<
    string,
    { checklistId: string | null; sort: number; fromVersion: number | null }
  >();
  for (const r of rows) {
    if (candidates.has(r.eventId)) continue;
    // A checklist already at the published version has nothing newer to take over.
    if (r.checklistId && r.fromVersion !== null && r.fromVersion >= version.version) continue;
    candidates.set(r.eventId, {
      checklistId: r.checklistId,
      sort: r.checklistSort ?? 0,
      fromVersion: r.fromVersion,
    });
  }
  const contexts = await loadEventContexts(tx, [...candidates.keys()]);
  const eventRows = await tx
    .select({ id: event.id, status: event.status })
    .from(event)
    .where(inArray(event.id, [...candidates.keys()]));
  const statusOf = new Map(eventRows.map((e) => [e.id, e.status]));

  const plans: Plan[] = [];
  for (const ev of contexts) {
    const candidate = candidates.get(ev.id);
    if (!candidate) continue;
    const { desired, items } = desiredTasks(version, ev, defaults);
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
    plans.push({
      checklistId: candidate.checklistId,
      sort: candidate.sort,
      ev,
      items,
      plan,
      summary: {
        eventId: ev.id,
        name: ev.name,
        startsOn: ev.startsOn,
        endsOn: ev.endsOn,
        status: statusOf.get(ev.id) ?? "draft",
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
        keep: plan.keep.map((k) => ({ taskId: k.task.id, title: k.task.title, reason: k.reason })),
        same: plan.same,
        size: planSize(plan),
      },
    });
  }
  return { version, plans, today };
}

/**
 * "Auf Veranstaltungen anwenden…", step 1 and 2: the upcoming events that could take over the published
 * version, each with what would change. Nothing is written and nothing is pre-selected by the caller.
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
  const { version, plans, today } = await db.transaction((tx) => computePlans(tx, templateId));
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
  };
}

export type ApplyResult = {
  events: number;
  added: number;
  updated: number;
  removed: number;
  perEvent: { eventId: string; added: number; updated: number; removed: number }[];
};

/**
 * THE one service path that brings existing events to a newer template version (CLAUDE.md: deliberate,
 * never automatic). For each chosen event: new items become tasks, open untouched tasks take over the
 * changed fields, open untouched tasks of vanished items are marked `removed_from_template`. Done,
 * skipped, cancelled and customised tasks are never touched, nor are due dates / assignees that were set
 * by hand. The merge is planned again inside the transaction, so it equals the preview (or fails with
 * `not_applicable` for an event that stopped qualifying).
 */
export async function applyTemplateVersion(
  actor: Actor,
  templateId: string,
  eventIds: string[],
): Promise<ApplyResult> {
  if (!can(actor.role, "template", "write")) forbidden();
  const chosen = [...new Set(eventIds)];
  if (chosen.length === 0 || chosen.length > MAX_APPLY_EVENTS)
    throw new TemplateApplyError("no_events");
  if (!chosen.every((id) => typeof id === "string" && UUID.test(id)))
    throw new TemplateApplyError("not_applicable");

  return db.transaction(async (tx) => {
    // Lock the events in a fixed order so two runs cannot deadlock.
    await tx
      .select({ id: event.id })
      .from(event)
      .where(inArray(event.id, chosen))
      .orderBy(asc(event.id))
      .for("update");
    const { version, plans } = await computePlans(tx, templateId, chosen);
    if (plans.length !== chosen.length) throw new TemplateApplyError("not_applicable");

    const result: ApplyResult = { events: 0, added: 0, updated: 0, removed: 0, perEvent: [] };
    const entries: Parameters<typeof audit>[2] = [];
    for (const p of plans) {
      const list = p.checklistId
        ? { id: p.checklistId }
        : await ensureChecklist(tx, p.ev, version, p.sort);
      let added = 0;
      if (p.plan.add.length > 0) {
        added = await insertTemplateTasks(tx, p.ev, list.id, p.plan.add, p.items);
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

      await tx
        .update(checklist)
        .set({ templateVersionId: version.versionId, name: version.templateName })
        .where(eq(checklist.id, list.id));

      const updated = p.plan.update.length;
      const removed = p.plan.remove.length;
      result.events += 1;
      result.added += added;
      result.updated += updated;
      result.removed += removed;
      result.perEvent.push({ eventId: p.ev.id, added, updated, removed });
      entries.push({
        action: "template.apply",
        entityType: "event",
        entityId: p.ev.id,
        diff: {
          templateId,
          templateName: version.templateName,
          checklistId: list.id,
          fromVersion: p.summary.fromVersion,
          toVersion: version.version,
          added,
          updated,
          removed,
          kept: p.plan.keep.length,
        },
      });
    }
    await audit(tx, actor.id, entries);
    // New and changed items that apply for a permit get linked to the event's permit (one linking path).
    await linkPermitTasks(
      tx,
      plans.map((p) => p.ev.id),
      actor,
    );
    return result;
  });
}
