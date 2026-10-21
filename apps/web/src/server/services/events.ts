import "server-only";
import { can, defaultAnchors, endsOnFor, isIsoDate, type ScheduledEvent } from "@marktwerk/core";
import { dutyRole, event, eventAnchor, eventDuty, eventPreset } from "@marktwerk/db/schema";
import { and, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

/** At most this many events per run (a full season of one preset is ~10). */
export const MAX_DATES_PER_RUN = 60;

export class EventInputError extends Error {}

/** Existing (not cancelled, not archived) events in a date window, for conflict checks. */
export async function scheduledEventsBetween(from: string, to: string): Promise<ScheduledEvent[]> {
  return db
    .select({
      id: event.id,
      name: event.name,
      venueId: event.venueId,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
    })
    .from(event)
    .where(
      and(
        isNull(event.archivedAt),
        ne(event.status, "cancelled"),
        lte(event.startsOn, to),
        gte(event.endsOn, from),
      ),
    );
}

function validateDates(dates: string[]): string[] {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) throw new EventInputError("no_dates");
  if (unique.length > MAX_DATES_PER_RUN) throw new EventInputError("too_many_dates");
  if (!unique.every(isIsoDate)) throw new EventInputError("invalid_date");
  return unique;
}

/**
 * The one service path that creates events (CLAUDE.md, data model "Generating events"): copies type,
 * venue, times and prices from the preset, sets the named anchors and the default duties, all in one
 * transaction with an audit entry per event. Warnings (holidays, weekend cap, venue already booked)
 * never block; the office decides in the preview.
 *
 * Extended in M2 (checklists + tasks from the preset's published templates) and M3 (logbook fill).
 */
export async function createEventsFromPreset(actor: Actor, presetId: string, dates: string[]) {
  if (!can(actor.role, "event", "write")) forbidden();
  const days = validateDates(dates);
  const preset = await db.query.eventPreset.findFirst({
    where: and(eq(eventPreset.id, presetId), isNull(eventPreset.archivedAt)),
  });
  if (!preset?.active) throw new EventInputError("preset_not_found");

  const roles = await db.select({ id: dutyRole.id, key: dutyRole.key }).from(dutyRole);
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));

  return db.transaction(async (tx) => {
    const created: { id: string; startsOn: string }[] = [];
    for (const startsOn of days) {
      const endsOn = endsOnFor(startsOn, preset.durationDays);
      const [row] = await tx
        .insert(event)
        .values({
          presetId: preset.id,
          eventTypeId: preset.eventTypeId,
          venueId: preset.venueId,
          name: preset.name,
          season: Number(startsOn.slice(0, 4)),
          startsOn,
          endsOn,
          times: preset.defaultTimes,
          status: "draft",
          pricePerMCents: preset.pricePerMCents,
          bookingFeeCents: preset.bookingFeeCents,
        })
        .returning({ id: event.id });
      if (!row) throw new Error("insert failed");
      const anchors = defaultAnchors(startsOn, preset.durationDays);
      await tx
        .insert(eventAnchor)
        .values(Object.entries(anchors).map(([key, date]) => ({ eventId: row.id, key, date })));
      const duties = Object.entries(preset.defaultDuties).flatMap(([key, staffMemberId]) => {
        const dutyRoleId = roleIdByKey.get(key);
        return dutyRoleId ? [{ eventId: row.id, dutyRoleId, staffMemberId }] : [];
      });
      if (duties.length > 0) await tx.insert(eventDuty).values(duties);
      created.push({ id: row.id, startsOn });
    }
    await audit(
      tx,
      actor.id,
      created.map((c) => ({
        action: "event.create",
        entityType: "event",
        entityId: c.id,
        diff: { presetId: preset.id, startsOn: c.startsOn, source: "preset" },
      })),
    );
    return created;
  });
}

/** Undo of a generation run: archives events that are still drafts. Anything already worked on stays. */
export async function archiveDraftEvents(actor: Actor, ids: string[]) {
  if (!can(actor.role, "event", "write")) forbidden();
  if (ids.length === 0 || ids.length > MAX_DATES_PER_RUN)
    throw new EventInputError("invalid_selection");
  return db.transaction(async (tx) => {
    const archived = await tx
      .update(event)
      .set({ archivedAt: new Date() })
      .where(and(inArray(event.id, ids), eq(event.status, "draft"), isNull(event.archivedAt)))
      .returning({ id: event.id });
    await audit(
      tx,
      actor.id,
      archived.map((a) => ({
        action: "event.archive",
        entityType: "event",
        entityId: a.id,
        diff: { reason: "undo" },
      })),
    );
    return archived.length;
  });
}
