import { sql } from "drizzle-orm";
import { check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_columns";
import { app } from "./_schema";
import { user } from "./auth";
import { event, eventPreset } from "./events";
import { task } from "./tasks";

/**
 * "Fürs nächste Mal" (Fahrplan R25, research 13 G9): a short note against a market (preset), written during or
 * after one of its dates ("Strom am Stand 12 fehlt"), shown when the next date of that market is prepared. Open
 * until someone marks it done (`done_at`); the undo sets it back. The free-text `event.notes` stays the note of
 * one date; this is the market's list that carries over from date to date.
 */
export const nextTimeNote = app.table(
  "next_time_note",
  {
    id: id(),
    presetId: uuid()
      .notNull()
      .references(() => eventPreset.id, { onDelete: "cascade" }),
    /** The date it was written at (null: written on the market page). */
    eventId: uuid().references(() => event.id, { onDelete: "set null" }),
    /** The task it was written from (task drawer), if any. */
    taskId: uuid().references(() => task.id, { onDelete: "set null" }),
    body: text().notNull(),
    createdById: text().references(() => user.id, { onDelete: "set null" }),
    /** Set when someone marks it "Erledigt"; null = open. */
    doneAt: timestamp({ withTimezone: true }),
    doneById: text().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index().on(t.presetId, t.doneAt),
    index().on(t.eventId),
    check("next_time_note_body", sql`char_length(${t.body}) between 1 and 500`),
  ],
);
