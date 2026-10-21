import "server-only";
import { overallHealth } from "@marktwerk/core";
import { event, eventDuty, userPreference, venue } from "@marktwerk/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { type Layers, sanitizeLayers } from "@/components/kalender/layers";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import { type EventRow, listEvents } from "./events";

/**
 * Events in [from, to] with the narrowing applied (Ort, Achtung/Kritisch, meine Zuständigkeit).
 * The type layers are applied by the page, because the layer panel needs counts per type first.
 */
export async function listCalendarEvents(
  actor: Actor,
  range: { from: string; to: string },
  layers: Pick<Layers, "venue" | "critical" | "mine">,
): Promise<EventRow[]> {
  let rows = await listEvents(actor, range);
  if (layers.venue) rows = rows.filter((r) => r.venueId === layers.venue);
  if (layers.critical) {
    rows = rows.filter((r) => {
      const level = overallHealth(r.health);
      return level === "warn" || level === "critical";
    });
  }
  if (layers.mine) {
    if (!actor.staffMemberId || rows.length === 0) return [];
    const mine = await db
      .select({ id: eventDuty.eventId })
      .from(eventDuty)
      .where(
        and(
          eq(eventDuty.staffMemberId, actor.staffMemberId),
          inArray(
            eventDuty.eventId,
            rows.map((r) => r.id),
          ),
        ),
      );
    const ids = new Set(mine.map((m) => m.id));
    rows = rows.filter((r) => ids.has(r.id));
  }
  return rows;
}

/** Venues the person can see events at, for the Ort select. */
export async function listVenueOptions(actor: Actor) {
  return db
    .selectDistinct({ id: venue.id, name: venue.name })
    .from(event)
    .innerJoin(venue, eq(venue.id, event.venueId))
    .where(visibleEvents(actor))
    .orderBy(asc(venue.name));
}

/** The saved layer selection, or null if the person never changed it. */
export async function getSavedLayers(userId: string): Promise<Layers | null> {
  const pref = await db.query.userPreference.findFirst({
    where: eq(userPreference.userId, userId),
    columns: { savedViews: true },
  });
  const saved = pref?.savedViews?.kalender;
  return saved ? sanitizeLayers(saved) : null;
}
