import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";
import { eventType } from "./catalogue";
import { eventPreset } from "./events";
import { dutyRole, staffMember } from "./people";

/* ------------------------------------------------------------------------------------------------
 * Enums shared by templates and tasks (a template item and the task made from it use the same values)
 * --------------------------------------------------------------------------------------------- */

/** Where a task sits on the event timeline: before the event, on the day(s), after. */
export const taskPhase = app.enum("task_phase", ["pre", "live", "post"]);

/**
 * Data model: general | permits | logistics | communication | finance | staff.
 * (implemented 0002: + `office`, the synthetic templates have Büro tasks that fit none of the others.)
 */
export const taskCategory = app.enum("task_category", [
  "general",
  "permits",
  "logistics",
  "communication",
  "finance",
  "staff",
  "office",
]);

export const taskPriority = app.enum("task_priority", ["low", "normal", "high"]);

/** `calendar` counts every day, `business` skips weekends and NRW holidays (packages/core dates). */
export const dayMode = app.enum("day_mode", ["calendar", "business"]);

/* ------------------------------------------------------------------------------------------------
 * Templates
 * --------------------------------------------------------------------------------------------- */

/** What a template instantiates into: an event timeline, or the preparation checklist of one permit. */
export const templateKind = app.enum("template_kind", ["event", "permit"]);

/**
 * Timeline template ("Ablauf Flohmarkt"). The content lives in versions; publishing a version never
 * touches existing events (data model principle 5).
 */
export const checklistTemplate = app.table(
  "checklist_template",
  {
    id: id(),
    kind: templateKind().notNull().default("event"),
    /** Event types the template is meant for (null = any). Presets pick templates explicitly. */
    eventTypeId: uuid().references(() => eventType.id, { onDelete: "restrict" }),
    name: text().notNull(),
    description: text(),
    /**
     * The one master event template ("Grundvorlage", client decision 2026-10-22): the basic tasks every
     * new market starts with. Edited in Einstellungen → Bibliothek; at most one row has it set.
     */
    isMaster: boolean().notNull().default(false),
    /** A market's own copy (made from the master when the market was created); null for library templates. */
    ownerPresetId: uuid().references((): AnyPgColumn => eventPreset.id, { onDelete: "set null" }),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.eventTypeId),
    index().on(t.kind),
    index().on(t.ownerPresetId),
    uniqueIndex("checklist_template_one_master").on(t.isMaster).where(sql`${t.isMaster}`),
  ],
);

export const templateVersionStatus = app.enum("template_version_status", [
  "draft",
  "published",
  "retired",
]);

/** One numbered version of a template. Published versions are immutable (enforced in the service). */
export const templateVersion = app.table(
  "template_version",
  {
    id: id(),
    templateId: uuid()
      .notNull()
      .references(() => checklistTemplate.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    status: templateVersionStatus().notNull().default("draft"),
    publishedAt: timestamp({ withTimezone: true }),
    publishedById: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    changeNote: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.templateId, t.version),
    // At most one draft per template (the editor works on that one).
    uniqueIndex("template_version_one_draft").on(t.templateId).where(sql`${t.status} = 'draft'`),
    check("template_version_number", sql`${t.version} >= 1`),
    check(
      "template_version_published_at",
      sql`${t.status} = 'draft' or ${t.publishedAt} is not null`,
    ),
  ],
);

/** When a template item applies (data model: "condition on event type/venue attributes"). */
export type TemplateItemCondition = {
  /** Event type keys the item applies to (empty/absent = all). */
  eventTypeKeys?: string[];
  /** Venue ids the item applies to. */
  venueIds?: string[];
  /** Venue kind values the item applies to. */
  venueKinds?: string[];
};

/**
 * A task blueprint: due date = anchor + signed offset (calendar or business days). Duty role, not
 * person (principle 4). `stable_key` identifies the item across versions, so propagation can match
 * existing tasks.
 */
export const templateItem = app.table(
  "template_item",
  {
    id: id(),
    versionId: uuid()
      .notNull()
      .references(() => templateVersion.id, { onDelete: "cascade" }),
    stableKey: text().notNull(),
    sort: integer().notNull().default(0),
    title: text().notNull(),
    description: text(),
    phase: taskPhase().notNull().default("pre"),
    category: taskCategory().notNull().default("general"),
    /** Named event anchor ("event_day", "setup_day", …). Free text: custom anchors exist. */
    anchorKey: text().notNull().default("event_day"),
    offsetDays: integer().notNull().default(0),
    dayMode: dayMode().notNull().default("calendar"),
    /** Wall-clock time (Europe/Berlin); null → settings.default_due_time. */
    dueTime: time(),
    dutyRoleId: uuid().references(() => dutyRole.id, { onDelete: "set null" }),
    priority: taskPriority().notNull().default("normal"),
    estimateMinutes: integer().notNull().default(0),
    requiresPhoto: boolean().notNull().default(false),
    requiresNote: boolean().notNull().default(false),
    requiresAttachment: boolean().notNull().default(false),
    /** "Kernaufgabe": a task every market needs; copied to the event's task (decision 2026-10-22). */
    isKey: boolean().notNull().default(false),
    /** Titles of the sub-steps; become `task_check_item` rows on instantiation. */
    checkItems: jsonb().$type<string[]>().notNull().default([]),
    /** Duty role whose holder has to approve before the task counts as done. */
    approverDutyRoleId: uuid().references(() => dutyRole.id, { onDelete: "set null" }),
    /** `stable_key`s of items in the same version this one depends on (does not move dates). */
    dependsOnKeys: text().array().notNull().default([]),
    /** Only instantiate for matching events; null = always. */
    condition: jsonb().$type<TemplateItemCondition>(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.versionId, t.stableKey),
    index().on(t.versionId, t.sort),
    index().on(t.dutyRoleId),
    check("template_item_estimate", sql`${t.estimateMinutes} >= 0`),
  ],
);

/** Which templates a preset instantiates, in order ("Vorlage" → timelines). */
export const eventPresetTemplate = app.table(
  "event_preset_template",
  {
    presetId: uuid()
      .notNull()
      .references(() => eventPreset.id, { onDelete: "cascade" }),
    templateId: uuid()
      .notNull()
      .references(() => checklistTemplate.id, { onDelete: "restrict" }),
    sort: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.presetId, t.templateId] }), index().on(t.templateId)],
);
