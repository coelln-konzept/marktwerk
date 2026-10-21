import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_columns";
import { app } from "./_schema";
import { event } from "./events";
import { dutyRole, staffMember } from "./people";

export const employmentType = app.enum("employment_type", [
  "minijob",
  "midijob",
  "student",
  "part_time",
  "full_time",
  "freelance",
]);

/**
 * Dated terms of employment. A person may have several rows over time; the one valid on a day is the
 * latest `valid_from` ≤ that day (and `valid_until` null or ≥ it). Overlaps are prevented in the
 * service. `contracted_hours_per_week` is explicit so the §12 TzBfG 20-hour fiction never applies.
 */
export const employmentContract = app.table(
  "employment_contract",
  {
    id: id(),
    staffMemberId: uuid()
      .notNull()
      .references(() => staffMember.id, { onDelete: "cascade" }),
    type: employmentType().notNull(),
    hourlyRateCents: integer(),
    contractedHoursPerWeek: numeric({ precision: 5, scale: 2, mode: "number" }),
    fixedMonthlyPayCents: integer(),
    /** Arbeitszeitkonto: fixed monthly pay, hours balanced over time. */
    workingTimeAccount: boolean().notNull().default(false),
    /** The person declared another Minijob (limit applies across employers). */
    otherMinijobDeclared: boolean().notNull().default(false),
    validFrom: date().notNull(),
    validUntil: date(),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.staffMemberId, t.validFrom),
    check(
      "employment_contract_validity",
      sql`${t.validUntil} is null or ${t.validUntil} >= ${t.validFrom}`,
    ),
    check(
      "employment_contract_amounts",
      sql`(${t.hourlyRateCents} is null or ${t.hourlyRateCents} > 0)
        and (${t.fixedMonthlyPayCents} is null or ${t.fixedMonthlyPayCents} >= 0)
        and (${t.contractedHoursPerWeek} is null or ${t.contractedHoursPerWeek} >= 0)`,
    ),
  ],
);

export const shiftStatus = app.enum("shift_status", [
  "requested",
  "confirmed",
  "declined",
  "worked",
  "no_show",
  "cancelled",
]);

/**
 * A working time record (§17 MiLoG): planned and actual times of one person on one day. Without an event
 * it is non-event work (office hours). Times are Europe/Berlin wall-clock; changes bump `version` and
 * leave a `shift_revision` with a reason. Kept for at least 2 years.
 */
export const shift = app.table(
  "shift",
  {
    id: id(),
    eventId: uuid().references(() => event.id, { onDelete: "restrict" }),
    staffMemberId: uuid()
      .notNull()
      .references(() => staffMember.id, { onDelete: "restrict" }),
    dutyRoleId: uuid().references(() => dutyRole.id, { onDelete: "set null" }),
    workDate: date().notNull(),
    plannedStart: time(),
    plannedEnd: time(),
    actualStart: time(),
    actualEnd: time(),
    breakMinutes: integer().notNull().default(0),
    status: shiftStatus().notNull().default("requested"),
    /** Office person who entered the actual times (and when). */
    recordedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    recordedAt: timestamp({ withTimezone: true }),
    approvedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    approvedAt: timestamp({ withTimezone: true }),
    version: integer().notNull().default(1),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.staffMemberId, t.workDate),
    index().on(t.eventId),
    index().on(t.workDate, t.status),
    check("shift_break", sql`${t.breakMinutes} >= 0`),
    check("shift_version", sql`${t.version} >= 1`),
  ],
);

/** What a shift looked like before a change, and why it changed (versioned time records). */
export const shiftRevision = app.table(
  "shift_revision",
  {
    id: id(),
    shiftId: uuid()
      .notNull()
      .references(() => shift.id, { onDelete: "cascade" }),
    /** The version this row preserves (the shift moved on to `version + 1`). */
    version: integer().notNull(),
    reason: text().notNull(),
    /** Snapshot of the shift row as it was. */
    before: jsonb().$type<Record<string, unknown>>().notNull(),
    changedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    changedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.shiftId, t.version)],
);

export const payrollPeriodStatus = app.enum("payroll_period_status", [
  "open",
  "locked",
  "approved",
  "exported",
]);

/**
 * One payroll month: open → locked (hours frozen) → approved → exported (CSV for the payroll office; the
 * file is a `document` with `payroll_period_id`). Hours, gross and allowance are computed, not stored.
 */
export const payrollPeriod = app.table(
  "payroll_period",
  {
    id: id(),
    /** First day of the month. */
    month: date().notNull().unique(),
    status: payrollPeriodStatus().notNull().default("open"),
    lockedAt: timestamp({ withTimezone: true }),
    lockedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    approvedAt: timestamp({ withTimezone: true }),
    approvedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    exportedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("payroll_period_month", sql`extract(day from ${t.month}) = 1`),
    check(
      "payroll_period_status_dates",
      sql`(${t.status} = 'open' or ${t.lockedAt} is not null)
        and (${t.status} not in ('approved', 'exported') or ${t.approvedAt} is not null)
        and (${t.status} <> 'exported' or ${t.exportedAt} is not null)`,
    ),
  ],
);

/**
 * Why a Minijob person went over the monthly limit in a month. Needed for the "unforeseeable" exception
 * (at most 2 months in 12, up to 2× the limit).
 */
export const overrunJustification = app.table(
  "overrun_justification",
  {
    id: id(),
    staffMemberId: uuid()
      .notNull()
      .references(() => staffMember.id, { onDelete: "cascade" }),
    /** First day of the month. */
    month: date().notNull(),
    reason: text().notNull(),
    recordedById: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique().on(t.staffMemberId, t.month),
    check("overrun_justification_month", sql`extract(day from ${t.month}) = 1`),
  ],
);
