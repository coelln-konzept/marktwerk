import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, text, unique, uuid } from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";
import { contact, venue } from "./catalogue";
import { obligation, vehicle } from "./company";
import { event } from "./events";
import { staffMember } from "./people";
import { permit } from "./permits";

/**
 * Where a payable belongs. `venue_season` = a fee for one venue and season covering several events
 * (location fee, toilet contract, standpipe). Dependent columns are enforced by a check constraint.
 */
export const payableScope = app.enum("payable_scope", [
  "event",
  "company",
  "vehicle",
  "venue_season",
]);

export const payableCategory = app.enum("payable_category", [
  "location",
  "permit",
  "water_power",
  "equipment_rental",
  "staff_external",
  "security",
  "cleaning_waste",
  "toilets",
  "marketing",
  "gema",
  "transport_fuel",
  "vehicle",
  "insurance",
  "tax_fees",
  "other",
]);

export const installmentStatus = app.enum("installment_status", [
  "open",
  "partially_paid",
  "paid",
  "cancelled",
]);

export const paymentMethod = app.enum("payment_method", [
  "bank_transfer",
  "sepa_direct_debit",
  "cash",
  "card",
  "other",
]);

/**
 * Something the company owes (single entry for money, principle 8): a permit fee, a location fee, an
 * insurance. Its status is derived from its installments (never stored). Rental link: added with M12.
 */
export const payable = app.table(
  "payable",
  {
    id: id(),
    counterpartyContactId: uuid().references(() => contact.id, { onDelete: "set null" }),
    title: text().notNull(),
    scope: payableScope().notNull(),
    eventId: uuid().references(() => event.id, { onDelete: "restrict" }),
    venueId: uuid().references(() => venue.id, { onDelete: "restrict" }),
    /** Season (year) for `venue_season` payables. */
    season: integer(),
    vehicleId: uuid().references(() => vehicle.id, { onDelete: "restrict" }),
    permitId: uuid().references(() => permit.id, { onDelete: "set null" }),
    /** The obligation whose completion created this payable (insurance renewal, service, …). */
    obligationId: uuid().references(() => obligation.id, { onDelete: "set null" }),
    category: payableCategory().notNull(),
    totalGrossCents: integer().notNull(),
    /** VAT rate in basis points (1900 = 19 %); null = unknown / exempt. */
    vatRateBp: integer(),
    /** Landlord, permit or penalty: shown first, escalates sooner. */
    critical: boolean().notNull().default(false),
    notes: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.eventId),
    index().on(t.venueId, t.season),
    index().on(t.vehicleId),
    index().on(t.permitId),
    index().on(t.counterpartyContactId),
    index().on(t.category),
    check("payable_total", sql`${t.totalGrossCents} >= 0`),
    check("payable_vat", sql`${t.vatRateBp} is null or ${t.vatRateBp} between 0 and 10000`),
    check(
      "payable_scope_target",
      sql`(${t.scope} <> 'event' or ${t.eventId} is not null)
        and (${t.scope} <> 'vehicle' or ${t.vehicleId} is not null)
        and (${t.scope} <> 'venue_season' or (${t.venueId} is not null and ${t.season} is not null))`,
    ),
  ],
);

/**
 * One payment (Rate) of a payable. Marking it paid *is* the expense. The sum of a payable's
 * non-cancelled instalments should equal its total (checked in the service, not here: plans are edited
 * instalment by instalment).
 */
export const installment = app.table(
  "installment",
  {
    id: id(),
    payableId: uuid()
      .notNull()
      .references(() => payable.id, { onDelete: "cascade" }),
    sort: integer().notNull().default(1),
    dueOn: date().notNull(),
    amountCents: integer().notNull(),
    status: installmentStatus().notNull().default("open"),
    paidOn: date(),
    paidAmountCents: integer(),
    paidByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    method: paymentMethod(),
    /** Verwendungszweck / invoice number. */
    reference: text(),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.payableId, t.sort),
    index().on(t.dueOn, t.status),
    index().on(t.status),
    check("installment_amount", sql`${t.amountCents} > 0`),
    check(
      "installment_paid",
      sql`${t.status} in ('open', 'cancelled')
        or (${t.paidOn} is not null and ${t.paidAmountCents} is not null and ${t.paidAmountCents} >= 0)`,
    ),
  ],
);

/** An ad-hoc purchase that was already paid (fuel, cable ties); no instalments. */
export const expense = app.table(
  "expense",
  {
    id: id(),
    spentOn: date().notNull(),
    amountCents: integer().notNull(),
    category: payableCategory().notNull().default("other"),
    description: text().notNull(),
    merchant: text(),
    eventId: uuid().references(() => event.id, { onDelete: "restrict" }),
    vehicleId: uuid().references(() => vehicle.id, { onDelete: "restrict" }),
    paidByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    method: paymentMethod(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.spentOn),
    index().on(t.eventId),
    index().on(t.vehicleId),
    check("expense_amount", sql`${t.amountCents} > 0`),
  ],
);

/** Planned cost of an event per category (the "plan" of plan → committed → actual). */
export const eventBudgetLine = app.table(
  "event_budget_line",
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    category: payableCategory().notNull(),
    plannedCents: integer().notNull(),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.eventId, t.category),
    check("event_budget_line_planned", sql`${t.plannedCents} >= 0`),
  ],
);

/** Income of an event that is not a stall fee (stall fees come from bookings, M9): sponsoring, bar, … */
export const eventIncome = app.table(
  "event_income",
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    label: text().notNull(),
    amountCents: integer().notNull(),
    receivedOn: date(),
    notes: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [index().on(t.eventId), check("event_income_amount", sql`${t.amountCents} > 0`)],
);
