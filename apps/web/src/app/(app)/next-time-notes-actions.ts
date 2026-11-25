"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import { listOpenNextTimeNotes, type NextTimeNoteRow } from "@/server/queries/next-time-notes";
import {
  addNextTimeNote,
  deleteNextTimeNote,
  NextTimeNoteInputError,
  type NextTimeNoteTarget,
  setNextTimeNoteDone,
} from "@/server/services/next-time-notes";
import { requirePermission } from "@/server/session";

/**
 * "Fürs nächste Mal" (Fahrplan R25): one set of actions for every place that shows the notes (event page, task
 * drawer, market page, "Markt planen"). Each starts with `requirePermission`; the services check again and scope.
 */
export type NoteActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(call: () => Promise<T>): Promise<NoteActionResult<T>> {
  try {
    const data = await call();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof NextTimeNoteInputError) {
      // A note someone else removed: show the current list.
      if (error.code === "not_found") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** "Notieren": a note against the market of a date, a task or the market itself. */
export async function addNextTimeNoteAction(target: NextTimeNoteTarget, body: string) {
  await requirePermission("nextTimeNote", "write");
  const actor = await getActor();
  return run(() => addNextTimeNote(actor, target, body));
}

/** The undo of "Notieren": the author takes the note back. */
export async function removeNextTimeNoteAction(noteId: string) {
  await requirePermission("nextTimeNote", "write");
  const actor = await getActor();
  return run(() => deleteNextTimeNote(actor, noteId));
}

/** "Erledigt" and back ("Wieder offen", the undo). */
export async function setNextTimeNoteDoneAction(noteId: string, done: boolean) {
  await requirePermission("nextTimeNote", "write");
  const actor = await getActor();
  return run(() => setNextTimeNoteDone(actor, noteId, done));
}

/** The open notes of a market for "Markt planen" (step 3); read-only. */
export async function loadOpenNextTimeNotes(
  presetId: string,
): Promise<NoteActionResult<NextTimeNoteRow[]>> {
  await requirePermission("nextTimeNote", "read");
  const actor = await getActor();
  return { ok: true, data: await listOpenNextTimeNotes(actor, presetId) };
}
