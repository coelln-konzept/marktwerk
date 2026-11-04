import { sql } from "drizzle-orm";
import { check, date, index, text, time, uuid } from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";
import { contact, venue } from "./catalogue";

/** "Termin" (CF9-1): a dated appointment for the business, with who to reach out to. Not a task. */
export const appointment = app.table(
  "appointment",
  {
    id: id(),
    title: text().notNull(),
    onDate: date().notNull(),
    startsAt: time(),
    endsAt: time(),
    venueId: uuid().references(() => venue.id, { onDelete: "set null" }),
    locationText: text(),
    notes: text(),
    contactId: uuid().references(() => contact.id, { onDelete: "set null" }),
    contactName: text(),
    contactPhoneE164: text("contact_phone_e164"),
    contactEmail: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.onDate),
    check("appointment_end_needs_start", sql`${t.endsAt} is null or ${t.startsAt} is not null`),
    check("appointment_end_after_start", sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check(
      "appointment_one_location",
      sql`not (${t.venueId} is not null and ${t.locationText} is not null)`,
    ),
  ],
);
