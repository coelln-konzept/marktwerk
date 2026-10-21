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
    dailyDigestEnabled: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);
