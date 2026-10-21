import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";
import { eventType, locationAgreement, venue } from "./catalogue";
import { dutyRole, staffMember } from "./people";

/** Local wall-clock times ("HH:mm", Europe/Berlin) of an event day. */
export type EventTimes = { setup: string; open: string; close: string; teardown: string };

/** duty_role.key → staff_member.id */
export type DefaultDuties = Record<string, string>;

/** "Vorlage": the old website's preset, extended. Events are generated from it. */
export const eventPreset = app.table(
  "event_preset",
  {
    id: id(),
    key: text().notNull().unique(),
    eventTypeId: uuid()
      .notNull()
      .references(() => eventType.id, { onDelete: "restrict" }),
    venueId: uuid()
      .notNull()
      .references(() => venue.id, { onDelete: "restrict" }),
    name: text().notNull(),
    publicTitle: text(),
    publicText: text(),
    pricePerMCents: integer().notNull(),
    bookingFeeCents: integer().notNull(),
    defaultTimes: jsonb().$type<EventTimes>().notNull(),
    /** RFC 5545 subset, e.g. "FREQ=MONTHLY;BYMONTH=4,5;BYDAY=SU;BYSETPOS=1". */
    rrule: text(),
    durationDays: integer().notNull().default(1),
    defaultDuties: jsonb().$type<DefaultDuties>().notNull().default({}),
    active: boolean().notNull().default(true),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.eventTypeId),
    index().on(t.venueId),
    check("event_preset_duration", sql`${t.durationDays} between 1 and 14`),
  ],
);

/** Lifecycle; booking state is kept in separate flags (data model principle 6). */
export const eventStatus = app.enum("event_status", [
  "draft",
  "planned",
  "confirmed",
  "live",
  "completed",
  "closed",
  "cancelled",
]);

/** "Veranstaltung", the core record (ADR 0010). */
export const event = app.table(
  "event",
  {
    id: id(),
    presetId: uuid().references(() => eventPreset.id, { onDelete: "set null" }),
    locationAgreementId: uuid().references(() => locationAgreement.id, { onDelete: "set null" }),
    eventTypeId: uuid()
      .notNull()
      .references(() => eventType.id, { onDelete: "restrict" }),
    venueId: uuid()
      .notNull()
      .references(() => venue.id, { onDelete: "restrict" }),
    name: text().notNull(),
    season: integer().notNull(),
    startsOn: date().notNull(),
    endsOn: date().notNull(),
    times: jsonb().$type<EventTimes>().notNull(),
    status: eventStatus().notNull().default("draft"),
    bookingOpen: boolean().notNull().default(false),
    fullyBooked: boolean().notNull().default(false),
    carSpacesFull: boolean().notNull().default(false),
    pricePerMCents: integer().notNull(),
    bookingFeeCents: integer().notNull(),
    targetRevenueCents: integer(),
    healthOverride: text(),
    healthOverrideReason: text(),
    customFields: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    notes: text(),
    cancelledReason: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.startsOn),
    index().on(t.venueId, t.startsOn),
    index().on(t.presetId),
    index().on(t.status),
    check("event_dates", sql`${t.endsOn} >= ${t.startsOn}`),
  ],
);

/**
 * Named dates of an event: event_day, setup_day, teardown_day, booking_cutoff (Monday before),
 * permit_decision, or custom keys. Template tasks are due relative to these.
 */
export const eventAnchor = app.table(
  "event_anchor",
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    key: text().notNull(),
    date: date().notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.eventId, t.key)],
);

/** Who does what at an event: duty role → staff member. */
export const eventDuty = app.table(
  "event_duty",
  {
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    dutyRoleId: uuid()
      .notNull()
      .references(() => dutyRole.id, { onDelete: "restrict" }),
    staffMemberId: uuid()
      .notNull()
      .references(() => staffMember.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.eventId, t.dutyRoleId] }), index().on(t.staffMemberId)],
);
