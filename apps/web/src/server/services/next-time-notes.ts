import "server-only";
import { can, nextTimeNoteProblem, normalizeNextTimeNote } from "@marktwerk/core";
import { event, eventSeason, nextTimeNote, task } from "@marktwerk/db/schema";
import { and, eq, exists, type SQL, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import { visibleTasks } from "../task-scope";
import { audit } from "./audit";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Error codes: `empty`, `too_long` (the text), `not_found` (note, date, task or market missing or not visible),
 * `no_market` (a date or task without a market: an Einzeltermin has no next time).
 */
export class NextTimeNoteInputError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Row-level scope for notes (decision 2026-10-21, as for events): office users see every note; field users the
 * notes of the markets they work at, i.e. where one date of the market is visible to them.
 */
export function visibleNextTimeNotes(actor: Actor): SQL {
  if (actor.role !== "field") return sql`true`;
  return exists(
    db
      .select({ one: event.id })
      .from(event)
      .where(and(eq(event.presetId, nextTimeNote.presetId), visibleEvents(actor))),
  );
}

/** Where a note is written: at a date, from a task (drawer), or on the market page (market only). */
export type NextTimeNoteTarget =
  | { eventId: string; taskId?: undefined; presetId?: undefined }
  | { taskId: string; eventId?: undefined; presetId?: undefined }
  | { presetId: string; eventId?: undefined; taskId?: undefined };

type Resolved = { presetId: string; eventId: string | null; taskId: string | null };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function resolveTarget(tx: Tx, actor: Actor, target: NextTimeNoteTarget): Promise<Resolved> {
  if (target.taskId !== undefined) {
    if (!UUID.test(target.taskId)) throw new NextTimeNoteInputError("not_found");
    const [row] = await tx
      .select({
        eventId: task.eventId,
        eventPresetId: event.presetId,
        seasonPresetId: eventSeason.presetId,
      })
      .from(task)
      .leftJoin(event, eq(event.id, task.eventId))
      .leftJoin(eventSeason, eq(eventSeason.id, task.seasonId))
      .where(and(eq(task.id, target.taskId), visibleTasks(actor)));
    if (!row) throw new NextTimeNoteInputError("not_found");
    const presetId = row.eventPresetId ?? row.seasonPresetId;
    if (!presetId) throw new NextTimeNoteInputError("no_market");
    return { presetId, eventId: row.eventId, taskId: target.taskId };
  }
  if (target.eventId !== undefined) {
    if (!UUID.test(target.eventId)) throw new NextTimeNoteInputError("not_found");
    const [row] = await tx
      .select({ presetId: event.presetId })
      .from(event)
      .where(and(eq(event.id, target.eventId), visibleEvents(actor)));
    if (!row) throw new NextTimeNoteInputError("not_found");
    if (!row.presetId) throw new NextTimeNoteInputError("no_market");
    return { presetId: row.presetId, eventId: target.eventId, taskId: null };
  }
  // The market page needs template access; field users only write at their dates.
  if (!can(actor.role, "template", "read")) forbidden();
  if (!UUID.test(target.presetId)) throw new NextTimeNoteInputError("not_found");
  const preset = await tx.query.eventPreset.findFirst({
    where: (p, { eq }) => eq(p.id, target.presetId),
    columns: { id: true },
  });
  if (!preset) throw new NextTimeNoteInputError("not_found");
  return { presetId: preset.id, eventId: null, taskId: null };
}

/**
 * "Fürs nächste Mal notieren" (Fahrplan R25): a short note against the market of a date, a task's date (or its
 * Saison) or the market itself. Permission `nextTimeNote:write` → transaction → audit `next_time_note.create`.
 * The undo of the toast is `deleteNextTimeNote` (its author may always take it back).
 */
export async function addNextTimeNote(
  actor: Actor,
  target: NextTimeNoteTarget,
  body: string,
): Promise<{ id: string; presetId: string }> {
  if (!can(actor.role, "nextTimeNote", "write")) forbidden();
  const problem = nextTimeNoteProblem(body);
  if (problem) throw new NextTimeNoteInputError(problem);
  const text = normalizeNextTimeNote(body);
  return db.transaction(async (tx) => {
    const where = await resolveTarget(tx, actor, target);
    const [row] = await tx
      .insert(nextTimeNote)
      .values({ ...where, body: text, createdById: actor.id })
      .returning({ id: nextTimeNote.id });
    if (!row) throw new Error("insert failed");
    await audit(tx, actor.id, [
      {
        action: "next_time_note.create",
        entityType: "next_time_note",
        entityId: row.id,
        diff: { ...where, body: text },
      },
    ]);
    return { id: row.id, presetId: where.presetId };
  });
}

/** The note, locked for the change, if the actor may see it. */
async function lockNote(tx: Tx, actor: Actor, noteId: string) {
  if (!UUID.test(noteId)) throw new NextTimeNoteInputError("not_found");
  const [row] = await tx
    .select()
    .from(nextTimeNote)
    .where(and(eq(nextTimeNote.id, noteId), visibleNextTimeNotes(actor)))
    .for("update");
  if (!row) throw new NextTimeNoteInputError("not_found");
  return row;
}

/**
 * "Erledigt" on a note, or back to open (the undo, or "Wieder öffnen" in the done list). Nothing happens when the
 * note already has that state (`changed: false`, no audit entry). Audit `next_time_note.done` / `.reopen`.
 */
export async function setNextTimeNoteDone(
  actor: Actor,
  noteId: string,
  done: boolean,
): Promise<{ changed: boolean; presetId: string }> {
  if (!can(actor.role, "nextTimeNote", "write")) forbidden();
  return db.transaction(async (tx) => {
    const row = await lockNote(tx, actor, noteId);
    if ((row.doneAt !== null) === done) return { changed: false, presetId: row.presetId };
    await tx
      .update(nextTimeNote)
      .set(
        done
          ? { doneAt: new Date(), doneById: actor.id, updatedAt: new Date() }
          : { doneAt: null, doneById: null, updatedAt: new Date() },
      )
      .where(eq(nextTimeNote.id, row.id));
    await audit(tx, actor.id, [
      {
        action: done ? "next_time_note.done" : "next_time_note.reopen",
        entityType: "next_time_note",
        entityId: row.id,
        diff: { presetId: row.presetId, eventId: row.eventId, body: row.body },
      },
    ]);
    return { changed: true, presetId: row.presetId };
  });
}

/**
 * Removes a note: its author (the undo of "Notieren") or owner/manager (`nextTimeNote:delete`). The text stays in
 * the audit entry `next_time_note.delete`.
 */
export async function deleteNextTimeNote(
  actor: Actor,
  noteId: string,
): Promise<{ presetId: string }> {
  if (!can(actor.role, "nextTimeNote", "write")) forbidden();
  return db.transaction(async (tx) => {
    const row = await lockNote(tx, actor, noteId);
    if (row.createdById !== actor.id && !can(actor.role, "nextTimeNote", "delete")) forbidden();
    await tx.delete(nextTimeNote).where(eq(nextTimeNote.id, row.id));
    await audit(tx, actor.id, [
      {
        action: "next_time_note.delete",
        entityType: "next_time_note",
        entityId: row.id,
        diff: {
          presetId: row.presetId,
          eventId: row.eventId,
          taskId: row.taskId,
          body: row.body,
          done: row.doneAt !== null,
        },
      },
    ]);
    return { presetId: row.presetId };
  });
}
