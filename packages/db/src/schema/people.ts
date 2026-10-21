import { boolean, index, integer, text, uuid } from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";
import { user } from "./auth";

/**
 * Someone working for the company (ADR 0012). Assignable to tasks and shifts; may have no login.
 * `user_id` links the optional back-office login, which carries the permission role.
 */
export const staffMember = app.table(
  "staff_member",
  {
    id: id(),
    displayName: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    phoneE164: text("phone_e164"),
    email: text(),
    userId: text()
      .unique()
      .references(() => user.id, { onDelete: "set null" }),
    preferredDutyRoleIds: uuid().array().notNull().default([]),
    active: boolean().notNull().default(true),
    notes: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [index().on(t.active)],
);

/** Responsibility at an event (Marktleitung, Aufbau, Büro, …). Templates reference these, not people. */
export const dutyRole = app.table("duty_role", {
  id: id(),
  key: text().notNull().unique(),
  nameDe: text().notNull(),
  nameEn: text().notNull(),
  defaultStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
  sort: integer().notNull().default(0),
  ...timestamps,
});
