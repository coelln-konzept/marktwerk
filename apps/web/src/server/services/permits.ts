import "server-only";
import { createHash } from "node:crypto";
import {
  addDays,
  applyByFor,
  can,
  canTransitionPermit,
  expectedDecisionAfter,
  isIsoDate,
  PERMIT_STATUSES,
  type PermitCadence,
  type PermitStatus,
  permitCovers,
  resolveRelativeDue,
  seasonFor,
} from "@marktwerk/core";
import { insertNotifications } from "@marktwerk/db";
import {
  contact,
  dutyRole,
  event,
  eventDuty,
  eventPermit,
  type PermitDeliverables,
  permit,
  permitCategory,
  permitRequirement,
  permitType,
  staffMember,
  task,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "@/lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { type AutoConfirmSource, autoConfirmEvents } from "./event-lifecycle";

export type PermitErrorCode =
  | "not_found"
  | "invalid_title"
  | "invalid_category"
  | "invalid_type"
  | "invalid_venue"
  | "invalid_contact"
  | "invalid_staff"
  | "invalid_season"
  | "invalid_date"
  | "invalid_period"
  | "invalid_text"
  | "invalid_conditions"
  | "invalid_deliverables"
  | "invalid_status"
  | "invalid_transition"
  | "invalid_event"
  | "invalid_requirement"
  | "invalid_lead_time"
  | "invalid_fee"
  | "invalid_month_day"
  | "invalid_cadence"
  | "invalid_event_type"
  | "conflict";

export class PermitInputError extends Error {
  constructor(readonly code: PermitErrorCode) {
    super(code);
  }
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PermitRow = typeof permit.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;
const MAX_REFERENCE = 100;
const MAX_NOTES = 4000;
const MAX_CONDITIONS = 30;
const MAX_CONDITION_LENGTH = 300;
const MAX_DELIVERABLE_KEYS = 20;
/** Clock time of a deadline that is only a day ("bis 30.11."): the end of that day. */
const DEADLINE_TIME = "23:59";

/** Tasks that are still to be done (the statuses before done / skipped / cancelled). */
const OPEN_TASK = ["todo", "in_progress", "waiting_external", "blocked"] as const;

const dueAtOf = (day: string) => resolveRelativeDue(day, 0, DEADLINE_TIME);

// ---------------------------------------------------------------------------------------------
// Logbook fill (called by instantiateEvents)

export type FillResult = {
  /** Permit instances created because nothing existing covered the event. */
  createdPermits: string[];
  /** event_permit rows added (both for created and for existing permits). */
  linked: number;
  /** Tasks created for missing permits. */
  tasks: number;
};

/** "granted" first: when several permits cover an event, the one that is already held wins. */
const COVER_PREFERENCE: PermitStatus[] = [
  "granted",
  "applied",
  "preparing",
  "not_started",
  "rejected",
  "not_required",
];

function permitTitle(requirementTitle: string, cadence: PermitCadence, eventStartsOn: string) {
  // Same shape as the synthetic data: single-event permits carry their date, the others are named by
  // the requirement (the season is a column of its own).
  return cadence === "per_event" ? `${requirementTitle} – ${eventStartsOn}` : requirementTitle;
}

/**
 * Logbook fill for new events (data model, "Generating events"): for each permit requirement of the
 * event's venue (narrowed by event type) attach an existing permit that covers the event (season, year,
 * multi-year or standing), or create a missing permit instance (`not_started`, `apply_by` = event day
 * minus lead time, respecting the submission window, expected decision from the requirement) with one
 * task for it (`source = permit`, category permits, due at `apply_by`, assigned to the event's "permits"
 * duty holder). Idempotent: an event that already has a permit for a requirement is skipped. Runs inside
 * the caller's transaction; `actor` only decides whether the audit entries are written.
 */
export async function fillLogbookForEvents(
  tx: Tx,
  eventIds: string[],
  actor?: Pick<Actor, "id"> & { staffMemberId?: string | null },
): Promise<FillResult> {
  const result: FillResult = { createdPermits: [], linked: 0, tasks: 0 };
  if (eventIds.length === 0) return result;
  const events = await tx
    .select({
      id: event.id,
      venueId: event.venueId,
      eventTypeId: event.eventTypeId,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      season: event.season,
    })
    .from(event)
    .where(and(inArray(event.id, eventIds), isNull(event.archivedAt)))
    .orderBy(asc(event.startsOn), asc(event.id));
  if (events.length === 0) return result;

  const requirements = await tx
    .select()
    .from(permitRequirement)
    .where(
      and(
        inArray(permitRequirement.venueId, [...new Set(events.map((e) => e.venueId))]),
        isNull(permitRequirement.archivedAt),
      ),
    );
  if (requirements.length === 0) return result;

  const ids = events.map((e) => e.id);
  const [role] = await tx
    .select({ id: dutyRole.id, defaultStaffMemberId: dutyRole.defaultStaffMemberId })
    .from(dutyRole)
    .where(eq(dutyRole.key, "permits"));
  const holders = role
    ? await tx
        .select({ eventId: eventDuty.eventId, staffMemberId: eventDuty.staffMemberId })
        .from(eventDuty)
        .where(and(inArray(eventDuty.eventId, ids), eq(eventDuty.dutyRoleId, role.id)))
    : [];
  const holderOf = new Map(holders.map((h) => [h.eventId, h.staffMemberId]));
  const permits = await tx
    .select()
    .from(permit)
    .where(
      and(
        inArray(
          permit.requirementId,
          requirements.map((r) => r.id),
        ),
        isNull(permit.archivedAt),
      ),
    );
  const linkedRows = await tx
    .select({ eventId: eventPermit.eventId, permitId: eventPermit.permitId })
    .from(eventPermit)
    .where(inArray(eventPermit.eventId, ids));
  const linked = new Set(linkedRows.map((l) => `${l.eventId}:${l.permitId}`));

  const linkedEvents = new Map<string, string[]>();
  const newTasks: { assignee: string | null; permitId: string }[] = [];

  async function link(p: PermitRow, eventId: string) {
    await tx
      .insert(eventPermit)
      .values({ eventId, permitId: p.id, required: p.status !== "not_required" })
      .onConflictDoNothing();
    linked.add(`${eventId}:${p.id}`);
    linkedEvents.set(p.id, [...(linkedEvents.get(p.id) ?? []), eventId]);
    result.linked += 1;
  }

  for (const ev of events) {
    for (const req of requirements) {
      if (req.venueId !== ev.venueId) continue;
      if (req.eventTypeId && req.eventTypeId !== ev.eventTypeId) continue;
      const own = permits.filter((p) => p.requirementId === req.id);
      if (own.some((p) => linked.has(`${ev.id}:${p.id}`))) continue;

      const applyBy = applyByFor(ev.startsOn, req.leadTimeDays, {
        startMd: req.submissionWindowStartMd,
        endMd: req.submissionWindowEndMd,
      });

      const covering = own
        .filter((p) => permitCovers(req.cadence, p, ev))
        .sort((a, b) => COVER_PREFERENCE.indexOf(a.status) - COVER_PREFERENCE.indexOf(b.status))[0];
      if (covering) {
        await link(covering, ev.id);
        // An earlier event joined a permit that is not filed yet: the deadline moves forward.
        if (
          (covering.status === "not_started" || covering.status === "preparing") &&
          (covering.applyBy === null || applyBy < covering.applyBy)
        ) {
          covering.applyBy = applyBy;
          await tx.update(permit).set({ applyBy }).where(eq(permit.id, covering.id));
          await tx
            .update(task)
            .set({ dueAt: dueAtOf(applyBy) })
            .where(
              and(
                eq(task.permitId, covering.id),
                eq(task.source, "permit"),
                eq(task.dueOverridden, false),
                inArray(task.status, [...OPEN_TASK]),
              ),
            );
        }
        continue;
      }

      const holder = holderOf.get(ev.id) ?? role?.defaultStaffMemberId ?? null;
      const [created] = await tx
        .insert(permit)
        .values({
          requirementId: req.id,
          venueId: req.venueId,
          season: seasonFor(req.cadence, ev.season),
          category: req.category,
          permitType: req.permitType,
          title: permitTitle(req.title, req.cadence, ev.startsOn),
          authorityContactId: req.authorityContactId,
          status: "not_started",
          applyBy,
          expectedDecisionOn: expectedDecisionAfter(applyBy, req.expectedDecisionMd),
          responsibleStaffMemberId: holder,
        })
        .returning();
      if (!created) throw new Error("insert failed");
      permits.push(created);
      result.createdPermits.push(created.id);
      await link(created, ev.id);
      await tx.insert(task).values({
        // A permit that covers a season belongs to no single event; only single-event permits show on one.
        eventId: req.cadence === "per_event" ? ev.id : null,
        permitId: created.id,
        source: "permit",
        // Task text is data in German, like the template items.
        title: `${req.title} beantragen`,
        phase: "pre",
        category: "permits",
        priority: "normal",
        dutyRoleId: role?.id ?? null,
        assigneeId: holder,
        dueAt: dueAtOf(applyBy),
      });
      result.tasks += 1;
      newTasks.push({ assignee: holder, permitId: created.id });
    }
  }

  if (actor) {
    await audit(tx, actor.id, [
      ...result.createdPermits.map((id) => ({
        action: "permit.create",
        entityType: "permit",
        entityId: id,
        diff: { source: "logbook_fill", eventIds: linkedEvents.get(id) ?? [] },
      })),
      ...[...linkedEvents]
        .filter(([id]) => !result.createdPermits.includes(id))
        .map(([id, eventIds]) => ({
          action: "permit.link",
          entityType: "permit",
          entityId: id,
          diff: { source: "logbook_fill", eventIds },
        })),
    ]);
  }

  // Events whose required permits are all held already (an existing permit covers them) start confirmed.
  if (actor) {
    await autoConfirmEvents(
      tx,
      { id: actor.id, staffMemberId: actor.staffMemberId ?? null },
      ids,
      "logbook_fill",
    );
  }

  // One grouped "assigned" notification per person instead of one per task.
  const byAssignee = new Map<string, string[]>();
  for (const t of newTasks) {
    if (t.assignee) byAssignee.set(t.assignee, [...(byAssignee.get(t.assignee) ?? []), t.permitId]);
  }
  await insertNotifications(
    tx,
    [...byAssignee].map(([staffMemberId, permitIds]) => ({
      recipientStaffMemberId: staffMemberId,
      reason: "assigned" as const,
      subjectType: "permit",
      subjectId: permitIds[0],
      title:
        permitIds.length === 1
          ? "Neue Aufgabe: Genehmigung beantragen"
          : `${permitIds.length} neue Aufgaben: Genehmigungen beantragen`,
      link: "/logbuch?fokus=fehlt",
      dedupeKey: `assigned:permit-fill:${createHash("sha1").update(permitIds.sort().join(",")).digest("hex").slice(0, 16)}`,
    })),
  );
  return result;
}

// ---------------------------------------------------------------------------------------------
// Input checks

const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

function checkedDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isIsoDate(value)) throw new PermitInputError("invalid_date");
  return value;
}

function checkedText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new PermitInputError("invalid_text");
  const text = value.trim();
  if (text.length > max) throw new PermitInputError("invalid_text");
  return text === "" ? null : text;
}

function checkedTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (title === "" || title.length > MAX_TITLE) throw new PermitInputError("invalid_title");
  return title;
}

function checkedConditions(value: unknown): string[] {
  if (!Array.isArray(value)) throw new PermitInputError("invalid_conditions");
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new PermitInputError("invalid_conditions");
    const text = item.trim().replace(/\s+/g, " ");
    if (text === "") continue;
    if (text.length > MAX_CONDITION_LENGTH) throw new PermitInputError("invalid_conditions");
    if (!list.includes(text)) list.push(text);
  }
  if (list.length > MAX_CONDITIONS) throw new PermitInputError("invalid_conditions");
  return list;
}

/** `{ stickers: 100 }`: keys of letters/digits/underscore, non-negative whole numbers. */
export function checkedDeliverables(value: unknown): PermitDeliverables {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new PermitInputError("invalid_deliverables");
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null && v !== 0,
  );
  if (entries.length > MAX_DELIVERABLE_KEYS) throw new PermitInputError("invalid_deliverables");
  const out: PermitDeliverables = {};
  for (const [key, count] of entries) {
    if (!/^[a-z][a-zA-Z0-9_]{0,39}$/.test(key)) throw new PermitInputError("invalid_deliverables");
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 1_000_000)
      throw new PermitInputError("invalid_deliverables");
    out[key] = count;
  }
  return out;
}

async function checkedContact(tx: Tx, value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === "") return null;
  if (!isUuid(value)) throw new PermitInputError("invalid_contact");
  const [found] = await tx
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.id, value), isNull(contact.archivedAt)));
  if (!found) throw new PermitInputError("invalid_contact");
  return found.id;
}

async function checkedStaff(tx: Tx, value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === "") return null;
  if (!isUuid(value)) throw new PermitInputError("invalid_staff");
  const [found] = await tx
    .select({ id: staffMember.id })
    .from(staffMember)
    .where(and(eq(staffMember.id, value), isNull(staffMember.archivedAt)));
  if (!found) throw new PermitInputError("invalid_staff");
  return found.id;
}

async function lockPermit(tx: Tx, id: string, includeArchived = false): Promise<PermitRow> {
  if (!isUuid(id)) throw new PermitInputError("not_found");
  const [row] = await tx
    .select()
    .from(permit)
    .where(includeArchived ? eq(permit.id, id) : and(eq(permit.id, id), isNull(permit.archivedAt)))
    .for("update");
  if (!row) throw new PermitInputError("not_found");
  return row;
}

// ---------------------------------------------------------------------------------------------
// Creating a permit by hand

export type NewPermitInput = {
  venueId: string;
  category: (typeof permitCategory.enumValues)[number];
  permitType: (typeof permitType.enumValues)[number];
  title: string;
  season: number | null;
  applyBy: string | null;
};

/**
 * "Genehmigung anlegen": a permit that no requirement produced (a one-off, or something the venue's
 * blueprint does not know yet). Starts as `not_started`; with an apply-by date it also gets the task
 * "beantragen", so it cannot be forgotten. Audited as "permit.create".
 */
export async function createPermit(actor: Actor, input: NewPermitInput): Promise<{ id: string }> {
  if (!can(actor.role, "permit", "write")) forbidden();
  const title = checkedTitle(input.title);
  if (!permitCategory.enumValues.includes(input.category))
    throw new PermitInputError("invalid_category");
  if (!permitType.enumValues.includes(input.permitType)) throw new PermitInputError("invalid_type");
  if (
    input.season !== null &&
    (!Number.isInteger(input.season) || input.season < 2000 || input.season > 2100)
  )
    throw new PermitInputError("invalid_season");
  const applyBy = checkedDate(input.applyBy);
  if (!isUuid(input.venueId)) throw new PermitInputError("invalid_venue");

  return db.transaction(async (tx) => {
    const [place] = await tx
      .select({ id: venue.id })
      .from(venue)
      .where(and(eq(venue.id, input.venueId), isNull(venue.archivedAt)));
    if (!place) throw new PermitInputError("invalid_venue");
    const [role] = await tx
      .select({ id: dutyRole.id, defaultStaffMemberId: dutyRole.defaultStaffMemberId })
      .from(dutyRole)
      .where(eq(dutyRole.key, "permits"));
    const holder = role?.defaultStaffMemberId ?? null;
    const [row] = await tx
      .insert(permit)
      .values({
        venueId: place.id,
        season: input.season,
        category: input.category,
        permitType: input.permitType,
        title,
        applyBy,
        responsibleStaffMemberId: holder,
      })
      .returning({ id: permit.id });
    if (!row) throw new Error("insert failed");
    if (applyBy) {
      await tx.insert(task).values({
        permitId: row.id,
        source: "permit",
        title: `${title} beantragen`,
        phase: "pre",
        category: "permits",
        dutyRoleId: role?.id ?? null,
        assigneeId: holder,
        dueAt: dueAtOf(applyBy),
      });
    }
    await audit(tx, actor.id, [
      {
        action: "permit.create",
        entityType: "permit",
        entityId: row.id,
        diff: { source: "manual", venueId: place.id, title, applyBy },
      },
    ]);
    return row;
  });
}

// ---------------------------------------------------------------------------------------------
// Editing the fields of a permit

export type PermitPatch = Partial<{
  title: string;
  referenceNo: string | null;
  authorityContactId: string | null;
  season: number | null;
  applyBy: string | null;
  appliedAt: string | null;
  expectedDecisionOn: string | null;
  grantedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  conditions: string[];
  deliverablesReceived: PermitDeliverables;
  responsibleStaffMemberId: string | null;
  notes: string | null;
}>;

/** Equality of plain values and objects regardless of key order. */
function sameJson(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([x], [y]) => x.localeCompare(y))
            .map(([k, val]) => [k, norm(val)]),
        )
      : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

async function normalizedPatch(tx: Tx, patch: PermitPatch): Promise<PermitPatch> {
  const out: PermitPatch = {};
  if ("title" in patch) out.title = checkedTitle(patch.title);
  if ("referenceNo" in patch) out.referenceNo = checkedText(patch.referenceNo, MAX_REFERENCE);
  if ("notes" in patch) out.notes = checkedText(patch.notes, MAX_NOTES);
  if ("authorityContactId" in patch)
    out.authorityContactId = await checkedContact(tx, patch.authorityContactId);
  if ("responsibleStaffMemberId" in patch)
    out.responsibleStaffMemberId = await checkedStaff(tx, patch.responsibleStaffMemberId);
  if ("season" in patch) {
    const season = patch.season ?? null;
    if (season !== null && (!Number.isInteger(season) || season < 2000 || season > 2100))
      throw new PermitInputError("invalid_season");
    out.season = season;
  }
  for (const key of [
    "applyBy",
    "appliedAt",
    "expectedDecisionOn",
    "grantedAt",
    "validFrom",
    "validUntil",
  ] as const) {
    if (key in patch) out[key] = checkedDate(patch[key]);
  }
  if ("conditions" in patch) out.conditions = checkedConditions(patch.conditions);
  if ("deliverablesReceived" in patch)
    out.deliverablesReceived = checkedDeliverables(patch.deliverablesReceived);
  return out;
}

/** Stable key of a condition's task: edits to other conditions never duplicate or lose it. */
export function conditionKey(permitId: string, text: string): string {
  return `permit_condition:${permitId}:${createHash("sha1").update(text).digest("hex").slice(0, 16)}`;
}

/**
 * Conditions (Auflagen) of a permit become tasks (`source = permit_condition`), one per condition.
 * Existing ones are kept, new ones created, open tasks of removed conditions cancelled. Due the day before
 * the first upcoming event the permit covers (none → no due date).
 */
async function syncConditionTasks(tx: Tx, p: PermitRow, conditions: string[], today: string) {
  const existing = await tx
    .select({ id: task.id, key: task.templateStableKey, status: task.status })
    .from(task)
    .where(and(eq(task.permitId, p.id), eq(task.source, "permit_condition")));
  const have = new Map(existing.map((t) => [t.key, t]));
  const wanted = new Map(conditions.map((text) => [conditionKey(p.id, text), text]));

  const [next] = await tx
    .select({ startsOn: event.startsOn })
    .from(eventPermit)
    .innerJoin(event, eq(event.id, eventPermit.eventId))
    .where(
      and(
        eq(eventPermit.permitId, p.id),
        eq(eventPermit.required, true),
        gte(event.startsOn, today),
        isNull(event.archivedAt),
        ne(event.status, "cancelled"),
      ),
    )
    .orderBy(asc(event.startsOn))
    .limit(1);
  const dueDay = next ? addDays(next.startsOn, -1) : null;
  const [role] = await tx
    .select({ id: dutyRole.id })
    .from(dutyRole)
    .where(eq(dutyRole.key, "permits"));

  const created = [...wanted].filter(([key]) => !have.has(key));
  if (created.length > 0) {
    await tx.insert(task).values(
      created.map(([key, text]) => ({
        permitId: p.id,
        source: "permit_condition" as const,
        templateStableKey: key,
        title: text,
        phase: "pre" as const,
        category: "permits" as const,
        dutyRoleId: role?.id ?? null,
        assigneeId: p.responsibleStaffMemberId,
        dueAt: dueDay ? dueAtOf(dueDay) : null,
      })),
    );
  }
  const dropped = existing.filter(
    (t) => t.key && !wanted.has(t.key) && (OPEN_TASK as readonly string[]).includes(t.status),
  );
  if (dropped.length > 0) {
    await tx
      .update(task)
      .set({ status: "cancelled" })
      .where(
        inArray(
          task.id,
          dropped.map((t) => t.id),
        ),
      );
  }
  return { created: created.length, cancelled: dropped.length };
}

/**
 * Edits fields of a permit (reference number, dates, conditions, received deliverables, responsible
 * person, notes). Changing the apply-by date moves the open "beantragen" task; the responsible person is
 * the assignee of the open permit tasks (unless somebody assigned them by hand); new conditions become
 * tasks. Returns the previous values of the changed fields, which an undo toast writes back with
 * `undo: true`. Audited as "permit.update" with {field: {from, to}}.
 */
export async function updatePermit(
  actor: Actor,
  id: string,
  patch: PermitPatch,
  options: { undo?: boolean } = {},
): Promise<{ changed: boolean; previous: PermitPatch }> {
  if (!can(actor.role, "permit", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockPermit(tx, id);
    const next = await normalizedPatch(tx, patch);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const previous: Record<string, unknown> = {};
    const update: Record<string, unknown> = {};
    for (const key of Object.keys(next) as (keyof PermitPatch)[]) {
      if (sameJson(current[key], next[key])) continue;
      changes[key] = { from: current[key], to: next[key] };
      previous[key] = current[key];
      update[key] = next[key];
    }
    if (Object.keys(changes).length === 0) return { changed: false, previous: {} };

    const validFrom = "validFrom" in next ? next.validFrom : current.validFrom;
    const validUntil = "validUntil" in next ? next.validUntil : current.validUntil;
    if (validFrom && validUntil && validUntil < validFrom)
      throw new PermitInputError("invalid_period");

    const [updated] = await tx
      .update(permit)
      .set(update as Partial<typeof permit.$inferInsert>)
      .where(eq(permit.id, id))
      .returning();
    if (!updated) throw new Error("update failed");

    if ("applyBy" in update && update.applyBy) {
      await tx
        .update(task)
        .set({ dueAt: dueAtOf(update.applyBy as string) })
        .where(
          and(
            eq(task.permitId, id),
            eq(task.source, "permit"),
            eq(task.dueOverridden, false),
            inArray(task.status, [...OPEN_TASK]),
          ),
        );
    }
    if ("responsibleStaffMemberId" in update) {
      await tx
        .update(task)
        .set({ assigneeId: updated.responsibleStaffMemberId })
        .where(
          and(
            eq(task.permitId, id),
            inArray(task.source, ["permit", "permit_condition"]),
            eq(task.assigneeOverridden, false),
            inArray(task.status, [...OPEN_TASK]),
          ),
        );
    }
    if ("conditions" in update)
      await syncConditionTasks(tx, updated, updated.conditions, todayIn());

    await audit(tx, actor.id, [
      {
        action: "permit.update",
        entityType: "permit",
        entityId: id,
        diff: { changes, ...(options.undo ? { undo: true } : {}) },
      },
    ]);
    return { changed: true, previous: previous as PermitPatch };
  });
}

// ---------------------------------------------------------------------------------------------
// Status flow

export type PermitStatusState = {
  status: PermitStatus;
  appliedAt: string | null;
  grantedAt: string | null;
};

export const isPermitStatus = (value: unknown): value is PermitStatus =>
  typeof value === "string" && (PERMIT_STATUSES as readonly string[]).includes(value);

/** Re-evaluates the events a permit belongs to after it was granted (see `autoConfirmEvents`). */
async function autoConfirmEventsOfPermit(
  tx: Tx,
  actor: Pick<Actor, "id" | "staffMemberId">,
  permitId: string,
  source: AutoConfirmSource,
) {
  const linked = await tx
    .select({ eventId: eventPermit.eventId })
    .from(eventPermit)
    .where(eq(eventPermit.permitId, permitId));
  await autoConfirmEvents(
    tx,
    actor,
    linked.map((l) => l.eventId),
    source,
  );
}

/**
 * Moves a permit along its flow (not_started → preparing → applied → granted / rejected; not_required;
 * superseded). Marking it applied / granted stamps today into `applied_at` / `granted_at` if empty and
 * completes the open "beantragen" task; not_required / superseded cancel it. Returns what the undo toast
 * needs (previous state, the tasks that were closed). Audited as "permit.status".
 */
export async function setPermitStatus(
  actor: Actor,
  id: string,
  to: string,
): Promise<{
  changed: boolean;
  previous: PermitStatusState;
  closedTaskIds: string[];
}> {
  if (!can(actor.role, "permit", "write")) forbidden();
  if (!isPermitStatus(to)) throw new PermitInputError("invalid_status");
  return db.transaction(async (tx) => {
    const current = await lockPermit(tx, id);
    const previous: PermitStatusState = {
      status: current.status,
      appliedAt: current.appliedAt,
      grantedAt: current.grantedAt,
    };
    if (current.status === to) return { changed: false, previous, closedTaskIds: [] };
    if (!canTransitionPermit(current.status, to)) throw new PermitInputError("invalid_transition");

    const today = todayIn();
    const set: Partial<typeof permit.$inferInsert> = { status: to };
    if (to === "applied" && !current.appliedAt) set.appliedAt = today;
    if (to === "granted" && !current.grantedAt) set.grantedAt = today;
    await tx.update(permit).set(set).where(eq(permit.id, id));

    let closedTaskIds: string[] = [];
    if (to === "applied" || to === "granted" || to === "not_required" || to === "superseded") {
      const done = to === "applied" || to === "granted";
      const closed = await tx
        .update(task)
        .set(
          done
            ? {
                status: "done",
                completedAt: new Date(),
                completedByStaffMemberId: actor.staffMemberId,
              }
            : { status: "cancelled" },
        )
        .where(
          and(
            eq(task.permitId, id),
            eq(task.source, "permit"),
            inArray(task.status, [...OPEN_TASK]),
          ),
        )
        .returning({ id: task.id });
      closedTaskIds = closed.map((t) => t.id);
    }
    await audit(tx, actor.id, [
      {
        action: "permit.status",
        entityType: "permit",
        entityId: id,
        diff: { from: current.status, to, closedTaskIds },
      },
    ]);
    if (to === "granted") await autoConfirmEventsOfPermit(tx, actor, id, "permit_status");
    return { changed: true, previous, closedTaskIds };
  });
}

/**
 * Undo of `setPermitStatus`: only while the permit still has the status the toast was created for.
 * Writes the previous status and dates back and reopens the tasks that were closed with it.
 */
export async function restorePermitStatus(
  actor: Actor,
  id: string,
  expected: PermitStatus,
  previous: PermitStatusState,
  closedTaskIds: string[],
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "permit", "write")) forbidden();
  if (!isPermitStatus(previous.status)) throw new PermitInputError("invalid_status");
  return db.transaction(async (tx) => {
    const current = await lockPermit(tx, id);
    if (current.status !== expected) throw new PermitInputError("conflict");
    await tx
      .update(permit)
      .set({
        status: previous.status,
        appliedAt: checkedDate(previous.appliedAt),
        grantedAt: checkedDate(previous.grantedAt),
      })
      .where(eq(permit.id, id));
    const ids = closedTaskIds.filter(isUuid);
    if (ids.length > 0) {
      await tx
        .update(task)
        .set({ status: "todo", completedAt: null, completedByStaffMemberId: null })
        .where(
          and(
            inArray(task.id, ids),
            eq(task.permitId, id),
            or(eq(task.status, "done"), eq(task.status, "cancelled")),
          ),
        );
    }
    await audit(tx, actor.id, [
      {
        action: "permit.status",
        entityType: "permit",
        entityId: id,
        diff: { from: current.status, to: previous.status, undo: true, reopenedTaskIds: ids },
      },
    ]);
    if (previous.status === "granted")
      await autoConfirmEventsOfPermit(tx, actor, id, "permit_status");
    return { changed: true };
  });
}

// ---------------------------------------------------------------------------------------------
// Which events a permit covers

/** Adds events to a permit (e.g. one more event of the season). Archived and cancelled events are refused. */
export async function linkEventsToPermit(
  actor: Actor,
  permitId: string,
  eventIds: string[],
): Promise<{ added: number }> {
  if (!can(actor.role, "permit", "write")) forbidden();
  if (
    !Array.isArray(eventIds) ||
    eventIds.length === 0 ||
    eventIds.length > 100 ||
    !eventIds.every(isUuid)
  )
    throw new PermitInputError("invalid_event");
  return db.transaction(async (tx) => {
    const p = await lockPermit(tx, permitId);
    const found = await tx
      .select({ id: event.id })
      .from(event)
      .where(
        and(inArray(event.id, eventIds), isNull(event.archivedAt), ne(event.status, "cancelled")),
      );
    if (found.length !== new Set(eventIds).size) throw new PermitInputError("invalid_event");
    const added = await tx
      .insert(eventPermit)
      .values(
        found.map((e) => ({ eventId: e.id, permitId, required: p.status !== "not_required" })),
      )
      .onConflictDoNothing()
      .returning({ eventId: eventPermit.eventId });
    if (added.length > 0) {
      await audit(tx, actor.id, [
        {
          action: "permit.link",
          entityType: "permit",
          entityId: permitId,
          diff: { eventIds: added.map((a) => a.eventId), source: "manual" },
        },
      ]);
      await autoConfirmEvents(
        tx,
        actor,
        added.map((a) => a.eventId),
        "permit_link",
      );
    }
    return { added: added.length };
  });
}

/** Removes an event from a permit. */
export async function unlinkEventFromPermit(
  actor: Actor,
  permitId: string,
  eventId: string,
): Promise<{ removed: boolean }> {
  if (!can(actor.role, "permit", "write")) forbidden();
  if (!isUuid(eventId)) throw new PermitInputError("invalid_event");
  return db.transaction(async (tx) => {
    await lockPermit(tx, permitId);
    const removed = await tx
      .delete(eventPermit)
      .where(and(eq(eventPermit.permitId, permitId), eq(eventPermit.eventId, eventId)))
      .returning({ eventId: eventPermit.eventId });
    if (removed.length > 0) {
      await audit(tx, actor.id, [
        {
          action: "permit.unlink",
          entityType: "permit",
          entityId: permitId,
          diff: { eventId },
        },
      ]);
    }
    return { removed: removed.length > 0 };
  });
}

/** Whether one event needs this permit at all ("nicht nötig" for this event only). */
export async function setEventPermitRequired(
  actor: Actor,
  permitId: string,
  eventId: string,
  required: boolean,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "permit", "write")) forbidden();
  if (!isUuid(eventId) || typeof required !== "boolean")
    throw new PermitInputError("invalid_event");
  return db.transaction(async (tx) => {
    await lockPermit(tx, permitId);
    const [row] = await tx
      .select()
      .from(eventPermit)
      .where(and(eq(eventPermit.permitId, permitId), eq(eventPermit.eventId, eventId)))
      .for("update");
    if (!row) throw new PermitInputError("invalid_event");
    if (row.required === required) return { changed: false };
    await tx
      .update(eventPermit)
      .set({ required })
      .where(and(eq(eventPermit.permitId, permitId), eq(eventPermit.eventId, eventId)));
    await audit(tx, actor.id, [
      {
        action: "permit.required",
        entityType: "permit",
        entityId: permitId,
        diff: { eventId, from: row.required, to: required },
      },
    ]);
    if (!required) await autoConfirmEvents(tx, actor, [eventId], "permit_required");
    return { changed: true };
  });
}

// ---------------------------------------------------------------------------------------------
// Archive

/** Removes a permit from the logbook (soft delete). Audited as "permit.archive". */
export async function archivePermit(actor: Actor, id: string): Promise<{ title: string }> {
  if (!can(actor.role, "permit", "delete")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockPermit(tx, id);
    await tx.update(permit).set({ archivedAt: new Date() }).where(eq(permit.id, id));
    await audit(tx, actor.id, [
      {
        action: "permit.archive",
        entityType: "permit",
        entityId: id,
        diff: { title: current.title },
      },
    ]);
    return { title: current.title };
  });
}

/** Undo of `archivePermit`. */
export async function restorePermit(actor: Actor, id: string): Promise<{ title: string }> {
  if (!can(actor.role, "permit", "delete")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockPermit(tx, id, true);
    await tx.update(permit).set({ archivedAt: null }).where(eq(permit.id, id));
    await audit(tx, actor.id, [
      {
        action: "permit.restore",
        entityType: "permit",
        entityId: id,
        diff: { title: current.title },
      },
    ]);
    return { title: current.title };
  });
}
