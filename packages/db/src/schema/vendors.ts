import { boolean, date, index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_columns";
import { app } from "./_schema";

export const vendorKind = app.enum("vendor_kind", ["private", "commercial"]);

/**
 * Vendor ("Händler"). Phase 1: imported read-only from the old website's list (decision 2026-10-21).
 * Never called "customer".
 */
export const vendor = app.table(
  "vendor",
  {
    id: id(),
    legacyId: integer().unique(),
    kind: vendorKind().notNull(),
    displayName: text().notNull(),
    firstName: text(),
    lastName: text(),
    companyName: text(),
    email: text(),
    phoneE164: text("phone_e164"),
    street: text(),
    postalCode: text(),
    city: text(),
    categories: text().array().notNull().default([]),
    isRegular: boolean().notNull().default(false),
    regularSpot: text(),
    defaultLengthCm: integer(),
    hasCar: boolean().notNull().default(false),
    carLengthCm: integer(),
    /** `soft_opt_in` (§7(3) UWG) or `double_opt_in`; null = no newsletter. */
    newsletterConsent: text(),
    notes: text(),
    createdOn: date(),
    importedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.displayName), index().on(t.city)],
);
