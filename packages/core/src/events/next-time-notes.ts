/*
 * "Fürs nächste Mal" (Fahrplan R25, research 13 G9): short notes against a market, written during or after one of
 * its dates and shown when the next date is prepared. Every client checklist sheet ends with such a box.
 */

/** A note is a line or two, not a document (the event's own Notizen hold the long text). */
export const NEXT_TIME_NOTE_MAX = 500;

export type NextTimeNoteProblem = "empty" | "too_long";

/** The text as stored: surrounding blanks trimmed, Windows line breaks unified. */
export function normalizeNextTimeNote(body: string): string {
  return body.replace(/\r\n?/g, "\n").trim();
}

/** Why the (normalized) text cannot be saved, or null. Length counts characters, as the DB check does. */
export function nextTimeNoteProblem(body: string): NextTimeNoteProblem | null {
  const text = normalizeNextTimeNote(body);
  if (text === "") return "empty";
  if ([...text].length > NEXT_TIME_NOTE_MAX) return "too_long";
  return null;
}

/** One date of a market, as far as "which date is prepared next" needs it. */
export type MarketDate = { id: string; startsOn: string; status: string };

/**
 * The date of a market that is prepared next: the first one that has not started yet (`startsOn` after today,
 * Berlin calendar days), cancelled ones left out. A date running today is not it: notes written there are meant
 * for the one after. Null when the market has no such date. Ties (two dates on one day) go to the smaller id, so
 * the answer is stable.
 */
export function nextDateToPrepare(dates: readonly MarketDate[], today: string): string | null {
  let best: MarketDate | null = null;
  for (const d of dates) {
    if (d.status === "cancelled" || d.startsOn <= today) continue;
    if (!best || d.startsOn < best.startsOn || (d.startsOn === best.startsOn && d.id < best.id))
      best = d;
  }
  return best?.id ?? null;
}

/** Where a note was written: the date (its id and first day), or nothing (the market page). */
export type NoteOrigin = { eventId: string | null; eventStartsOn: string | null };

/**
 * Whether a note is "for" a date, i.e. was written before it: on the market page, or at an earlier date of the
 * market. A note written at this date (or at a later one) is meant for the date after, not this one.
 */
export function isNoteForDate(note: NoteOrigin, date: { id: string; startsOn: string }): boolean {
  if (note.eventId === null || note.eventStartsOn === null) return true;
  if (note.eventId === date.id) return false;
  return note.eventStartsOn < date.startsOn;
}
