import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./_columns";
import { user } from "./auth";

/**
 * Append-only log of changes to business records. Written by the service
 * layer inside the same transaction as the change.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(), // e.g. "task.create", "market.reschedule"
    entityType: text().notNull(),
    entityId: uuid(),
    diff: jsonb(),
    ip: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.entityType, t.entityId), index().on(t.actorId), index().on(t.at)],
);
