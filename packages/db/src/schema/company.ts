import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";
import { venue } from "./catalogue";
import { staffMember } from "./people";

/** A company vehicle (transporters). HU interval comes from the gross weight via `legal_parameter`. */
export const vehicle = app.table(
  "vehicle",
  {
    id: id(),
    /** Short name used in lists ("Transporter 1"). */
    name: text().notNull(),
    plate: text().notNull().unique(),
    make: text(),
    model: text(),
    vin: text().unique(),
    firstRegistrationOn: date(),
    grossWeightKg: integer(),
    odometerKm: integer(),
    /** When `odometer_km` was read. */
    odometerRecordedOn: date(),
    insurer: text(),
    policyNumber: text(),
    notes: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    check("vehicle_weight", sql`${t.grossWeightKg} is null or ${t.grossWeightKg} > 0`),
    check("vehicle_odometer", sql`${t.odometerKm} is null or ${t.odometerKm} >= 0`),
  ],
);

export const obligationScope = app.enum("obligation_scope", ["company", "vehicle", "venue"]);

/** What kind of recurring duty it is (drives icons, legal intervals and the "creates payable" default). */
export const obligationKind = app.enum("obligation_kind", [
  "hu",
  "uvv",
  "service",
  "tyres",
  "insurance",
  "vehicle_tax",
  "licence_check",
  "report",
  "other",
]);

/**
 * A recurring duty by date and/or kilometres: HU, UVV (DGUV 70), service, insurances, vehicle tax,
 * licence check, KSK report. Completing one records an `obligation_completion` and rolls the next due
 * date/km forward.
 */
export const obligation = app.table(
  "obligation",
  {
    id: id(),
    kind: obligationKind().notNull().default("other"),
    title: text().notNull(),
    scope: obligationScope().notNull(),
    vehicleId: uuid().references(() => vehicle.id, { onDelete: "restrict" }),
    venueId: uuid().references(() => venue.id, { onDelete: "restrict" }),
    intervalMonths: integer(),
    intervalKm: integer(),
    nextDueOn: date(),
    nextDueKm: integer(),
    /** Start reminding this many days before `next_due_on`. */
    leadDays: integer().notNull().default(14),
    responsibleStaffMemberId: uuid()
      .notNull()
      .references(() => staffMember.id, { onDelete: "restrict" }),
    /** Completing it should create a `payable` (service, insurance renewal, …). */
    createsPayable: boolean().notNull().default(false),
    lastDoneOn: date(),
    notes: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.nextDueOn),
    index().on(t.vehicleId),
    index().on(t.responsibleStaffMemberId),
    check(
      "obligation_scope_target",
      sql`(${t.scope} <> 'vehicle' or ${t.vehicleId} is not null)
        and (${t.scope} <> 'venue' or ${t.venueId} is not null)`,
    ),
    check(
      "obligation_intervals",
      sql`(${t.intervalMonths} is null or ${t.intervalMonths} > 0)
        and (${t.intervalKm} is null or ${t.intervalKm} > 0)
        and ${t.leadDays} >= 0`,
    ),
  ],
);

/** History of an obligation: when it was done, at which km, what it cost, who checked. */
export const obligationCompletion = app.table(
  "obligation_completion",
  {
    id: id(),
    obligationId: uuid()
      .notNull()
      .references(() => obligation.id, { onDelete: "cascade" }),
    doneOn: date().notNull(),
    doneKm: integer(),
    costCents: integer(),
    doneById: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    /** Licence check: store date + checker only (no copy of the licence). */
    checkerName: text(),
    notes: text(),
    /** Due date after rolling forward (kept so the history reads without recomputation). */
    nextDueOnAfter: date(),
    nextDueKmAfter: integer(),
    ...timestamps,
  },
  (t) => [
    index().on(t.obligationId, t.doneOn),
    unique().on(t.obligationId, t.doneOn),
    check("obligation_completion_cost", sql`${t.costCents} is null or ${t.costCents} >= 0`),
  ],
);

export const vehicleIssueSeverity = app.enum("vehicle_issue_severity", [
  "minor",
  "major",
  "critical",
]);
export const vehicleIssueStatus = app.enum("vehicle_issue_status", [
  "open",
  "in_progress",
  "resolved",
]);

/** A defect or damage report on a vehicle (photos are `document`s with `vehicle_issue_id`). */
export const vehicleIssue = app.table(
  "vehicle_issue",
  {
    id: id(),
    vehicleId: uuid()
      .notNull()
      .references(() => vehicle.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text(),
    severity: vehicleIssueSeverity().notNull().default("minor"),
    status: vehicleIssueStatus().notNull().default("open"),
    reportedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    reportedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
    resolvedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    resolutionNote: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.vehicleId, t.status),
    check(
      "vehicle_issue_resolved",
      sql`(${t.status} <> 'resolved') or ${t.resolvedAt} is not null`,
    ),
  ],
);
