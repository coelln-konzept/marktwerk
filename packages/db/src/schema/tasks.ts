import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";
import { user } from "./auth";
import { obligation } from "./company";
import { event } from "./events";
import { payable } from "./money";
import { dutyRole, staffMember } from "./people";
import { permit } from "./permits";
import {
  checklistTemplate,
  dayMode,
  taskCategory,
  taskPhase,
  taskPriority,
  templateItem,
  templateVersion,
} from "./templates";

/** A named list of tasks: the timeline of one event, or the preparation steps of one permit. */
export const checklist = app.table(
  "checklist",
  {
    id: id(),
    eventId: uuid().references(() => event.id, { onDelete: "cascade" }),
    permitId: uuid().references(() => permit.id, { onDelete: "cascade" }),
    /** Template and the exact version it was instantiated from (null = hand-made). */
    templateId: uuid().references(() => checklistTemplate.id, { onDelete: "set null" }),
    templateVersionId: uuid().references(() => templateVersion.id, { onDelete: "set null" }),
    name: text().notNull(),
    sort: integer().notNull().default(0),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.eventId),
    index().on(t.permitId),
    index().on(t.templateVersionId),
    check("checklist_one_owner", sql`not (${t.eventId} is not null and ${t.permitId} is not null)`),
  ],
);

export const taskSource = app.enum("task_source", [
  "template",
  "manual",
  "permit",
  "permit_condition",
  "obligation",
  "rental",
  "email",
  "system",
]);

export const taskStatus = app.enum("task_status", [
  "todo",
  "in_progress",
  "waiting_external",
  "blocked",
  "done",
  "skipped",
  "cancelled",
]);

export const effortFeedback = app.enum("effort_feedback", ["as_planned", "longer", "shorter"]);
export const approvalStatus = app.enum("approval_status", ["pending", "approved", "rejected"]);

/** Kanban columns: Vorbereitung · Diese Woche · Heute · Erledigt. Derived unless overridden by a manual move. */
export const boardColumn = app.enum("board_column", ["preparation", "this_week", "today", "done"]);

/**
 * A unit of work. Assignee is a staff member (ADR 0012). Dates follow their anchor while the task is open
 * and `due_overridden` is false; done tasks never move (principle 2).
 */
export const task = app.table(
  "task",
  {
    id: id(),

    // origin
    eventId: uuid().references(() => event.id, { onDelete: "cascade" }),
    checklistId: uuid().references(() => checklist.id, { onDelete: "cascade" }),
    templateItemId: uuid().references(() => templateItem.id, { onDelete: "set null" }),
    /** Survives template versions (the item row differs per version). */
    templateStableKey: text(),
    permitId: uuid().references(() => permit.id, { onDelete: "set null" }),
    payableId: uuid().references(() => payable.id, { onDelete: "set null" }),
    obligationId: uuid().references(() => obligation.id, { onDelete: "set null" }),
    parentTaskId: uuid().references((): AnyPgColumn => task.id, { onDelete: "set null" }),
    source: taskSource().notNull().default("manual"),

    title: text().notNull(),
    description: text(),
    phase: taskPhase(),
    category: taskCategory().notNull().default("general"),
    priority: taskPriority().notNull().default("normal"),
    labels: text().array().notNull().default([]),

    // assignment
    dutyRoleId: uuid().references(() => dutyRole.id, { onDelete: "set null" }),
    assigneeId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    /** Set when someone assigned this task by hand; duty-role reassignment then leaves it alone. */
    assigneeOverridden: boolean().notNull().default(false),

    // timing
    anchorKey: text(),
    offsetDays: integer(),
    dayMode: dayMode().notNull().default("calendar"),
    dueAt: timestamp({ withTimezone: true }),
    /** Set when the due date was edited by hand; anchor changes then leave it alone. */
    dueOverridden: boolean().notNull().default(false),

    /**
     * Snoozed ("Zurückgestellt") until this Berlin calendar date: hidden from due lists, KPIs, reminders and the
     * digest while it is after today, back on the date itself. The due date is not touched.
     */
    snoozedUntil: date(),

    // effort
    estimateMinutes: integer().notNull().default(0),
    effortFeedback: effortFeedback(),

    // evidence required (copied from the template item)
    requiresPhoto: boolean().notNull().default(false),
    requiresNote: boolean().notNull().default(false),
    requiresAttachment: boolean().notNull().default(false),

    // state
    status: taskStatus().notNull().default("todo"),
    waitingReason: text(),
    skippedReason: text(),
    completedAt: timestamp({ withTimezone: true }),
    completedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    approverStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    approvalStatus: approvalStatus(),

    // kanban
    /** Manual move override; cleared when the due date passes (see data model, kanban columns). */
    boardColumn: boardColumn(),
    /** Order within a column; fractional so a drop between two cards needs one write. */
    boardSort: doublePrecision().notNull().default(0),

    // carry-over (nightly 00:05)
    rolloverCount: integer().notNull().default(0),
    lastRolledAt: timestamp({ withTimezone: true }),

    // template tracking
    /** Edited after instantiation: propagation leaves it alone. */
    customized: boolean().notNull().default(false),
    /** The template item vanished in a later version but the task is untouched/kept. */
    removedFromTemplate: boolean().notNull().default(false),

    ...timestamps,
  },
  (t) => [
    index().on(t.eventId, t.status),
    index().on(t.assigneeId, t.status, t.dueAt),
    index().on(t.status, t.dueAt),
    index().on(t.checklistId),
    index().on(t.permitId),
    index().on(t.payableId),
    index().on(t.obligationId),
    index().on(t.parentTaskId),
    index().on(t.templateItemId),
    // Instantiation is idempotent: a checklist holds one task per template item.
    uniqueIndex("task_checklist_stable_key")
      .on(t.checklistId, t.templateStableKey)
      .where(sql`${t.templateStableKey} is not null`),
    check("task_estimate", sql`${t.estimateMinutes} >= 0`),
    check("task_rollover", sql`${t.rolloverCount} >= 0`),
    check("task_done_completed", sql`${t.status} <> 'done' or ${t.completedAt} is not null`),
    check("task_not_own_parent", sql`${t.parentTaskId} is null or ${t.parentTaskId} <> ${t.id}`),
  ],
);

/** A small step inside a task (from the template's `check_items` or added by hand). */
export const taskCheckItem = app.table(
  "task_check_item",
  {
    id: id(),
    taskId: uuid()
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    title: text().notNull(),
    sort: integer().notNull().default(0),
    done: boolean().notNull().default(false),
    doneAt: timestamp({ withTimezone: true }),
    doneByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index().on(t.taskId, t.sort),
    check("task_check_item_done", sql`${t.done} = (${t.doneAt} is not null)`),
  ],
);

/** "Task A needs task B first." Informational: does not move dates. */
export const taskDependency = app.table(
  "task_dependency",
  {
    taskId: uuid()
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid()
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnTaskId] }),
    index().on(t.dependsOnTaskId),
    check("task_dependency_not_self", sql`${t.taskId} <> ${t.dependsOnTaskId}`),
  ],
);

/** Comment thread of a task. @mentions notify the mentioned staff members. */
export const taskComment = app.table(
  "task_comment",
  {
    id: id(),
    taskId: uuid()
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    /** Staff member who wrote it; the login is kept too because an office user may have no staff record. */
    authorStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    authorUserId: text().references(() => user.id, { onDelete: "set null" }),
    body: text().notNull(),
    mentionedStaffMemberIds: uuid().array().notNull().default([]),
    editedAt: timestamp({ withTimezone: true }),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [index().on(t.taskId, t.createdAt)],
);

/** People who follow a task without owning it. */
export const taskWatcher = app.table(
  "task_watcher",
  {
    taskId: uuid()
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    staffMemberId: uuid()
      .notNull()
      .references(() => staffMember.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.taskId, t.staffMemberId] }), index().on(t.staffMemberId)],
);
