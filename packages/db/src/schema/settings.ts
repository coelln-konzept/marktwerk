import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, text, time } from "drizzle-orm/pg-core";
import { timestamps } from "./_columns";
import { app } from "./_schema";

/**
 * Company-wide settings. Single company → exactly one row (id = 1).
 */
export const settings = app.table(
  "settings",
  {
    id: integer().primaryKey().default(1),
    companyName: text().notNull().default(""),
    addressLine1: text(),
    addressLine2: text(),
    postalCode: text(),
    city: text(),
    country: text().notNull().default("DE"),
    email: text(),
    phone: text(),
    taxNumber: text(), // Steuernummer
    vatId: text(), // USt-IdNr.
    iban: text(),
    bic: text(),
    timeZone: text().notNull().default("Europe/Berlin"),
    /** Federal state for public holidays (NRW = "NW"). */
    bundesland: text().notNull().default("NW"),
    defaultLocale: text().notNull().default("de"),
    /** Default wall-clock time for template tasks without their own due time. */
    defaultDueTime: time().notNull().default("09:00"),
    /** Overrides for reminder offsets, see @marktwerk/core deadlines/reminders. */
    reminderPolicy: jsonb().$type<Record<string, number[]>>(),
    /**
     * Master switch for outgoing email (client decision: no email for now). While off, the jobs queue
     * nothing and the sender delivers nothing; in-app notifications are unaffected.
     */
    emailEnabled: boolean().notNull().default(false),
    dailyDigestEnabled: boolean().notNull().default(true),
    /**
     * How many days before their apply-by date (or expected decision) permits appear in the Übersicht.
     * 7–180; tasks and other due items keep their fixed 7-day horizon.
     */
    permitHorizonDays: integer().notNull().default(30),
    ...timestamps,
  },
  (t) => [
    check("settings_singleton", sql`${t.id} = 1`),
    check("settings_permit_horizon_range", sql`${t.permitHorizonDays} between 7 and 180`),
  ],
);
