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
import { type EventTypeRules, eventType, locationAgreement, venue } from "./catalogue";
import { dutyRole, staffMember } from "./people";

/**
 * One window of a Zeitplan (ADR 0022): who it is for, what happens, on which day, from–to ("HH:mm",
 * Europe/Berlin). Same shape as `ScheduleRow` in @marktwerk/core, which holds the rules.
 */
export type ScheduleRowValue = {
  audience: "team" | "vendors" | "visitors";
  kind: "setup" | "open" | "teardown";
  /** `before` = the day before the first day. */
  day: "before" | "first" | "each" | "last";
  from: string;
  to: string;
};

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
    /** The market's default Zeitplan (ADR 0022), copied into every new event of this market. */
    schedule: jsonb().$type<ScheduleRowValue[]>().notNull(),
    /** RFC 5545 subset, e.g. "FREQ=MONTHLY;BYMONTH=4,5;BYDAY=SU;BYSETPOS=1". */
    rrule: text(),
    durationDays: integer().notNull().default(1),
    defaultDuties: jsonb().$type<DefaultDuties>().notNull().default({}),
    active: boolean().notNull().default(true),
    /**
     * The market's colour label ("Marktfarbe", decision 2026-10-22): a key of the market palette in
     * @marktwerk/core, shown as a thin bar/marker next to the market's name across the app. Null =
     * fall back to the event type's colour.
     */
    color: text(),
    /**
     * "Marktregeln" (decision D2-3): the market's own rules, same shape as `event_type.rules`. Copied
     * from the event type when the market is created, then edited on the event page; they apply to
     * every event of this market. Events without a market show their type's rules.
     */
    rules: jsonb().$type<EventTypeRules>().notNull(),
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
    /** The event's Zeitplan (ADR 0022): copied from the market at instantiation, editable per event. */
    schedule: jsonb().$type<ScheduleRowValue[]>().notNull(),
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
