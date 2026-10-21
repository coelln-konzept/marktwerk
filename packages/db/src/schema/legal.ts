import { date, integer, text, unique } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_columns";
import { app } from "./_schema";

/**
 * Legal numbers (minimum wage, Minijob limit, inspection intervals) as dated data, never constants.
 * The value valid on a day is the row with the latest `valid_from` ≤ that day.
 */
export const legalParameter = app.table(
  "legal_parameter",
  {
    id: id(),
    key: text().notNull(),
    value: integer().notNull(),
    validFrom: date().notNull(),
    note: text(),
    ...timestamps,
  },
  (t) => [unique().on(t.key, t.validFrom)],
);
