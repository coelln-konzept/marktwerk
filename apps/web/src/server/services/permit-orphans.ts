import "server-only";
import { auditLog, document, eventPermit, permit, task } from "@marktwerk/db/schema";
import { and, eq, inArray, isNull, ne, notExists, or, sql } from "drizzle-orm";
import type { db } from "../db";
import { audit } from "./audit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

/** The audit actions that do not count as working on a permit: the logbook fill made it and linked dates to it. */
const UNTOUCHED_ACTIONS = ["permit.create", "permit.link"];

/**
 * The permits deleting this date would leave behind untouched (Fahrplan SAI7): linked to it and to no other date,
 * made by the logbook fill (or the former season job), never worked on since: still `not_started`, nothing in their
 * history but being created and linked, no document, and no own "… beantragen" task anybody started (all still
 * `todo`, or none). A permit someone created by hand, edited, filed or attached a file to stays, with or without
 * dates. Ids in a stable order.
 */
export async function untouchedPermitsOnlyFor(tx: Reader, eventId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: permit.id })
    .from(permit)
    .innerJoin(
      eventPermit,
      and(eq(eventPermit.permitId, permit.id), eq(eventPermit.eventId, eventId)),
    )
    .where(
      and(
        isNull(permit.archivedAt),
        eq(permit.status, "not_started"),
        // no other date
        notExists(
          tx
            .select({ one: sql`1` })
            .from(eventPermit)
            .where(and(eq(eventPermit.permitId, permit.id), ne(eventPermit.eventId, eventId))),
        ),
        // made by the fill
        sql`exists (select 1 from ${auditLog} a where a.entity_type = 'permit' and a.entity_id = ${permit.id}
          and a.action = 'permit.create' and a.diff ->> 'source' in ('logbook_fill', 'season_job'))`,
        // nothing else happened to it
        sql`not exists (select 1 from ${auditLog} a where a.entity_type = 'permit' and a.entity_id = ${permit.id}
          and a.action not in (${sql.join(
            UNTOUCHED_ACTIONS.map((a) => sql`${a}`),
            sql`, `,
          )}))`,
        notExists(
          tx.select({ one: sql`1` }).from(document).where(eq(document.permitId, permit.id)),
        ),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(task)
            .where(
              and(
                eq(task.permitId, permit.id),
                eq(task.source, "permit"),
                or(ne(task.status, "todo"), sql`${task.completedAt} is not null`),
              ),
            ),
        ),
      ),
    )
    .orderBy(permit.id);
  return rows.map((r) => r.id);
}

/**
 * Archives the given untouched permits of a date that is being deleted (SAI7), like "Entfernen" in the logbook, so
 * they can be restored there, and cancels their own open "… beantragen" tasks that have no event (a per-date
 * permit's task goes with its date through the cascade). One `permit.archive` audit entry each, with the date and
 * the tasks it cancelled. Inside the caller's transaction, before the date is deleted.
 */
export async function archiveUntouchedPermits(
  tx: Tx,
  actorId: string,
  permitIds: readonly string[],
  eventId: string,
): Promise<void> {
  if (permitIds.length === 0) return;
  const ids = [...permitIds];
  const titles = await tx
    .select({ id: permit.id, title: permit.title })
    .from(permit)
    .where(inArray(permit.id, ids));
  await tx.update(permit).set({ archivedAt: new Date() }).where(inArray(permit.id, ids));
  const cancelled = await tx
    .update(task)
    .set({ status: "cancelled" })
    .where(
      and(
        inArray(task.permitId, ids),
        eq(task.source, "permit"),
        isNull(task.eventId),
        eq(task.status, "todo"),
      ),
    )
    .returning({ id: task.id, permitId: task.permitId });
  await audit(
    tx,
    actorId,
    titles.map((p) => ({
      action: "permit.archive",
      entityType: "permit",
      entityId: p.id,
      diff: {
        title: p.title,
        source: "event_delete",
        eventId,
        // As migration 0027 writes it: restoring the permit reopens these (`restorePermit`).
        cancelledTasks: cancelled
          .filter((c) => c.permitId === p.id)
          .map((c) => ({ id: c.id, from: "todo" })),
      },
    })),
  );
}
