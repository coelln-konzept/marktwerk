import "server-only";
import { can, isNoteForDate, nextDateToPrepare } from "@marktwerk/core";
import { event, nextTimeNote, staffMember, task, user } from "@marktwerk/db/schema";
import { and, asc, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import { db } from "../db";
import { visibleNextTimeNotes } from "../services/next-time-notes";

const UUID = /^[0-9a-f-]{36}$/i;

/** One "Fürs nächste Mal" note as the lists show it. */
export type NextTimeNoteRow = {
  id: string;
  body: string;
  /** ISO instant. */
  createdAt: string;
  /** The author's staff name, else their login name; null once the user is gone. */
  authorName: string | null;
  /** The date it was written at (null: on the market page). `archived` dates are not linked. */
  event: { id: string; name: string; startsOn: string; archived: boolean } | null;
  /** The task it was written from, if any. */
  taskTitle: string | null;
  /** ISO instant, null while open. */
  doneAt: string | null;
  doneByName: string | null;
};

export type NextTimeNoteList = {
  /** Open notes, newest first. */
  open: NextTimeNoteRow[];
  /** The most recently done ones (at most `doneLimit`), newest first. */
  done: NextTimeNoteRow[];
  /** All done notes of the market (the list may show fewer). */
  doneCount: number;
};

/** A user's display name: their staff record's name, else the login name. */
function nameOf(userId: typeof nextTimeNote.createdById | typeof nextTimeNote.doneById) {
  return sql<string | null>`coalesce(
    (select ${staffMember.displayName} from ${staffMember} where ${staffMember.userId} = ${userId} limit 1),
    (select ${user.name} from ${user} where ${user.id} = ${userId})
  )`;
}

async function rows(actor: Actor, presetId: string, done: boolean, limit?: number) {
  const query = db
    .select({
      id: nextTimeNote.id,
      body: nextTimeNote.body,
      createdAt: nextTimeNote.createdAt,
      authorName: nameOf(nextTimeNote.createdById),
      eventId: event.id,
      eventName: event.name,
      eventStartsOn: event.startsOn,
      eventArchivedAt: event.archivedAt,
      taskTitle: task.title,
      doneAt: nextTimeNote.doneAt,
      doneByName: nameOf(nextTimeNote.doneById),
    })
    .from(nextTimeNote)
    .leftJoin(event, eq(event.id, nextTimeNote.eventId))
    .leftJoin(task, eq(task.id, nextTimeNote.taskId))
    .where(
      and(
        eq(nextTimeNote.presetId, presetId),
        done ? isNotNull(nextTimeNote.doneAt) : isNull(nextTimeNote.doneAt),
        visibleNextTimeNotes(actor),
      ),
    )
    .orderBy(
      done ? desc(nextTimeNote.doneAt) : desc(nextTimeNote.createdAt),
      desc(nextTimeNote.id),
    );
  const found = await (limit === undefined ? query : query.limit(limit));
  return found.map(
    (r): NextTimeNoteRow => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      authorName: r.authorName,
      event:
        r.eventId && r.eventName && r.eventStartsOn
          ? {
              id: r.eventId,
              name: r.eventName,
              startsOn: r.eventStartsOn,
              archived: r.eventArchivedAt !== null,
            }
          : null,
      taskTitle: r.taskTitle,
      doneAt: r.doneAt ? r.doneAt.toISOString() : null,
      doneByName: r.doneByName,
    }),
  );
}

/** The market's notes: every open one and the last `doneLimit` done ones (default 20). */
export async function listNextTimeNotes(
  actor: Actor,
  presetId: string,
  { doneLimit = 20 }: { doneLimit?: number } = {},
): Promise<NextTimeNoteList> {
  if (!UUID.test(presetId) || !can(actor.role, "nextTimeNote", "read"))
    return { open: [], done: [], doneCount: 0 };
  const [open, done, [total]] = await Promise.all([
    rows(actor, presetId, false),
    rows(actor, presetId, true, doneLimit),
    db
      .select({ n: count() })
      .from(nextTimeNote)
      .where(
        and(
          eq(nextTimeNote.presetId, presetId),
          isNotNull(nextTimeNote.doneAt),
          visibleNextTimeNotes(actor),
        ),
      ),
  ]);
  return { open, done, doneCount: total?.n ?? 0 };
}

/** The open notes of a market (for "Markt planen"): newest first. */
export async function listOpenNextTimeNotes(
  actor: Actor,
  presetId: string,
): Promise<NextTimeNoteRow[]> {
  if (!UUID.test(presetId) || !can(actor.role, "nextTimeNote", "read")) return [];
  return rows(actor, presetId, false);
}

export type EventNextTimeNotes = NextTimeNoteList & {
  presetId: string;
  /** This date is the one of its market prepared next (`nextDateToPrepare`). */
  isNextDate: boolean;
  /** The market's next date to prepare, when it is another one. */
  nextDate: { id: string; startsOn: string } | null;
  /** Open notes written before this date (market page or earlier dates, `isNoteForDate`). */
  forThisDate: NextTimeNoteRow[];
};

/**
 * The notes of a date's market for the event page: the whole list (Notizen tab) and, on the date that is prepared
 * next, the open ones written before it (Zusammenfassung). Null for a date without a market. The caller has checked
 * that the actor sees the event.
 */
export async function getEventNextTimeNotes(
  actor: Actor,
  ev: { id: string; presetId: string | null; startsOn: string },
  today: string,
): Promise<EventNextTimeNotes | null> {
  if (!ev.presetId || !can(actor.role, "nextTimeNote", "read")) return null;
  const [list, dates] = await Promise.all([
    listNextTimeNotes(actor, ev.presetId),
    db
      .select({ id: event.id, startsOn: event.startsOn, status: event.status })
      .from(event)
      .where(and(eq(event.presetId, ev.presetId), isNull(event.archivedAt)))
      .orderBy(asc(event.startsOn)),
  ]);
  const nextId = nextDateToPrepare(dates, today);
  const next = dates.find((d) => d.id === nextId) ?? null;
  const date = { id: ev.id, startsOn: ev.startsOn };
  return {
    ...list,
    presetId: ev.presetId,
    isNextDate: nextId === ev.id,
    nextDate: next && next.id !== ev.id ? { id: next.id, startsOn: next.startsOn } : null,
    forThisDate: list.open.filter((n) =>
      isNoteForDate(
        { eventId: n.event?.id ?? null, eventStartsOn: n.event?.startsOn ?? null },
        date,
      ),
    ),
  };
}
