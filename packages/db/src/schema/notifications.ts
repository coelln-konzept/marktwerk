import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_columns";
import { app } from "./_schema";
import { staffMember } from "./people";

export const notificationReason = app.enum("notification_reason", [
  "assigned",
  "mentioned",
  "due_soon",
  "overdue",
  "rolled_over",
  "dates_shifted",
  "permit_apply_by",
  "permit_decision_due",
  "installment_due",
  "rental_return_due",
  "obligation_due",
  "shift_request",
  "hours_missing",
  "payroll_close",
  "escalated",
  "event_confirmed",
]);

/** Data model leaves the values open; colour + icon + text in the UI. */
export const notificationSeverity = app.enum("notification_severity", [
  "info",
  "warning",
  "critical",
]);

export const notificationState = app.enum("notification_state", [
  "unread",
  "read",
  "done",
  "saved",
]);

/**
 * In-app notification of one staff member, or company-wide when `recipient_staff_member_id` is null (the
 * notification center for owner/manager logins, decision 2026-10-22: every important item once, with one
 * shared state). `dedupe_key` (incl. the due date) makes sweeps idempotent: the same reminder is never
 * created twice for the same person, nor twice company-wide.
 */
export const notification = app.table(
  "notification",
  {
    id: id(),
    recipientStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "cascade" }),
    reason: notificationReason().notNull(),
    severity: notificationSeverity().notNull().default("info"),
    /** What it is about (e.g. "task" + id); no FK because it spans many tables. */
    subjectType: text(),
    subjectId: uuid(),
    title: text().notNull(),
    body: text(),
    /** App-relative link, e.g. "/veranstaltungen/…". */
    link: text(),
    dedupeKey: text(),
    state: notificationState().notNull().default("unread"),
    snoozedUntil: timestamp({ withTimezone: true }),
    readAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique().on(t.recipientStaffMemberId, t.dedupeKey),
    uniqueIndex("notification_company_dedupe")
      .on(t.dedupeKey)
      .where(sql`${t.recipientStaffMemberId} is null`),
    index().on(t.recipientStaffMemberId, t.state, t.createdAt),
    index().on(t.subjectType, t.subjectId),
  ],
);

export const messageChannel = app.enum("message_channel", [
  "in_app",
  "email",
  "whatsapp_link",
  "whatsapp_api",
]);

export const messageStatus = app.enum("message_status", [
  "queued",
  "ready",
  "sent",
  "delivered",
  "read",
  "failed",
]);

/**
 * A message to send through a channel (Phase 1: email and in-app). `send_after` implements debouncing and
 * quiet hours. For `whatsapp_link`, "sent" is set when the office clicks the wa.me button (Phase 2).
 */
export const outboundMessage = app.table(
  "outbound_message",
  {
    id: id(),
    channel: messageChannel().notNull(),
    recipientStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    /** Address the message goes to at send time (email address or E.164 number), snapshotted. */
    recipientAddress: text(),
    notificationId: uuid().references(() => notification.id, { onDelete: "set null" }),
    templateKey: text().notNull(),
    subject: text(),
    renderedText: text().notNull(),
    status: messageStatus().notNull().default("queued"),
    sendAfter: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
    attempts: integer().notNull().default(0),
    error: text(),
    externalId: text(),
    dedupeKey: text().unique(),
    ...timestamps,
  },
  (t) => [
    index().on(t.status, t.sendAfter),
    index().on(t.recipientStaffMemberId),
    check("outbound_message_attempts", sql`${t.attempts} >= 0`),
  ],
);

/**
 * Who was told when something stayed overdue (assignee → manager, decision 2026-10-21). One row per
 * subject and level; `dedupe_key` keeps the 15-minute sweep idempotent.
 */
export const escalationLog = app.table(
  "escalation_log",
  {
    id: id(),
    subjectType: text().notNull(),
    subjectId: uuid().notNull(),
    /** 1 = assignee, 2 = manager, … */
    level: integer().notNull().default(1),
    escalatedToStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    reason: text(),
    dedupeKey: text().notNull().unique(),
    escalatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.subjectType, t.subjectId), check("escalation_level", sql`${t.level} >= 1`)],
);

/** Per person: which reasons reach them on which channel. No row = default (on). */
export const notificationPreference = app.table(
  "notification_preference",
  {
    id: id(),
    staffMemberId: uuid()
      .notNull()
      .references(() => staffMember.id, { onDelete: "cascade" }),
    reason: notificationReason().notNull(),
    channel: messageChannel().notNull(),
    enabled: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [unique().on(t.staffMemberId, t.reason, t.channel)],
);
