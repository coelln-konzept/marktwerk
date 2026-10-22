import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";
import { contact, eventType, venue } from "./catalogue";
import { event } from "./events";
import { staffMember } from "./people";
import { permitType } from "./permit-type";
import { checklistTemplate } from "./templates";

export const permitCategory = app.enum("permit_category", ["city", "external"]);

export const permitCadence = app.enum("permit_cadence", [
  "per_event",
  "per_season",
  "per_year",
  "multi_year",
  "standing",
]);

export const permitStatus = app.enum("permit_status", [
  "not_started",
  "preparing",
  "applied",
  "granted",
  "rejected",
  "not_required",
  "superseded",
]);

/** Things a permit hands out, e.g. `{ stickers: 100 }`. */
export type PermitDeliverables = { stickers?: number } & Record<string, number | undefined>;

/** "MM-DD" (a month-day without year, e.g. "11-30"). */
const MONTH_DAY = "^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$";

/**
 * Blueprint per venue (optionally narrowed by event type): which permits/OKs an event there needs, how
 * far ahead to apply, when the authority collects applications and decides.
 */
export const permitRequirement = app.table(
  "permit_requirement",
  {
    id: id(),
    venueId: uuid()
      .notNull()
      .references(() => venue.id, { onDelete: "restrict" }),
    eventTypeId: uuid().references(() => eventType.id, { onDelete: "restrict" }),
    category: permitCategory().notNull(),
    permitType: permitType().notNull(),
    title: text().notNull(),
    authorityContactId: uuid().references(() => contact.id, { onDelete: "set null" }),
    cadence: permitCadence().notNull(),
    leadTimeDays: integer().notNull().default(0),
    /** Application window, month-day ("10-01" … "11-30"), e.g. a city collecting applications in autumn. */
    submissionWindowStartMd: text(),
    submissionWindowEndMd: text(),
    /** When the authority usually decides, month-day ("01-15"). */
    expectedDecisionMd: text(),
    typicalFeeCents: integer(),
    deliverables: jsonb().$type<PermitDeliverables>().notNull().default({}),
    /** Preparation checklist (kind `permit`) instantiated with each new permit. */
    prepTemplateId: uuid().references(() => checklistTemplate.id, { onDelete: "set null" }),
    notes: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.venueId),
    index().on(t.eventTypeId),
    index().on(t.authorityContactId),
    check("permit_requirement_lead_time", sql`${t.leadTimeDays} >= 0`),
    check("permit_requirement_fee", sql`${t.typicalFeeCents} is null or ${t.typicalFeeCents} >= 0`),
    check(
      "permit_requirement_month_days",
      sql`(${t.submissionWindowStartMd} is null or ${t.submissionWindowStartMd} ~ ${sql.raw(`'${MONTH_DAY}'`)})
        and (${t.submissionWindowEndMd} is null or ${t.submissionWindowEndMd} ~ ${sql.raw(`'${MONTH_DAY}'`)})
        and (${t.expectedDecisionMd} is null or ${t.expectedDecisionMd} ~ ${sql.raw(`'${MONTH_DAY}'`)})`,
    ),
  ],
);

/**
 * A concrete permit/OK. One permit can cover many events (`event_permit`). Fees are `payable`s
 * (`payable.permit_id`); Auflagen and preparation steps are tasks (`task.permit_id`).
 */
export const permit = app.table(
  "permit",
  {
    id: id(),
    requirementId: uuid().references(() => permitRequirement.id, { onDelete: "set null" }),
    /** Denormalised from the requirement so the logbook can group by location without a join (and ad-hoc permits work). */
    venueId: uuid().references(() => venue.id, { onDelete: "restrict" }),
    /** Season (year) the permit is for; null for multi-year / standing permits. */
    season: integer(),
    category: permitCategory().notNull(),
    permitType: permitType().notNull(),
    title: text().notNull(),
    authorityContactId: uuid().references(() => contact.id, { onDelete: "set null" }),
    referenceNo: text(),
    status: permitStatus().notNull().default("not_started"),
    applyBy: date(),
    appliedAt: date(),
    expectedDecisionOn: date(),
    grantedAt: date(),
    validFrom: date(),
    validUntil: date(),
    /** Auflagen (conditions); each may become a task with source `permit_condition`. */
    conditions: text().array().notNull().default([]),
    /** What was handed out, e.g. `{ stickers: 100 }`. */
    deliverablesReceived: jsonb().$type<PermitDeliverables>().notNull().default({}),
    responsibleStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    /** Renewal chain: the permit this one replaces. */
    supersedesId: uuid().references((): AnyPgColumn => permit.id, { onDelete: "set null" }),
    notes: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.venueId, t.season),
    index().on(t.requirementId),
    index().on(t.status, t.applyBy),
    index().on(t.responsibleStaffMemberId),
    index().on(t.validUntil),
    check(
      "permit_validity",
      sql`${t.validFrom} is null or ${t.validUntil} is null or ${t.validUntil} >= ${t.validFrom}`,
    ),
  ],
);

/** The events a permit covers, and whether the event needs it at all (`required = false` → not applicable). */
export const eventPermit = app.table(
  "event_permit",
  {
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    permitId: uuid()
      .notNull()
      .references(() => permit.id, { onDelete: "cascade" }),
    required: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.eventId, t.permitId] }), index().on(t.permitId)],
);
