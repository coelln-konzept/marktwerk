import "server-only";
import { overallHealth } from "@marktwerk/core";
import { event, eventDuty, userPreference, venue } from "@marktwerk/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { availableLayers, type Layers, sanitizeLayers } from "@/components/kalender/layers";
import type { ModuleHide } from "@/lib/modules";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import * as company from "./company";
import type { CalendarItem } from "./due";
import { type EventRow, listEvents } from "./events";
import * as finance from "./finance";
import * as hours from "./hours";
import * as permits from "./permits";
import * as tasks from "./tasks";

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

/**
 * Items of the module layers (Aufgaben, Genehmigungen, Raten, Pflichten, Schichten) in [from, to].
 * Only layers that are switched on and that the actor may see are fetched; each module also checks its
 * own permission and field scope. Narrowing: "Nur Achtung und Kritisch" keeps warn/critical items,
 * "Nur meine Zuständigkeit" limits tasks to the actor's own. Ordered by day, most urgent tone first.
 */
export async function listCalendarDeadlines(
  actor: Actor,
  range: { from: string; to: string },
  layers: Pick<Layers, "deadlines" | "critical" | "mine">,
  today: string,
  hide: ModuleHide = {},
): Promise<CalendarItem[]> {
  const allowed = new Set(availableLayers(actor.role, actor.staffMemberId !== null, hide));
  const wanted = new Set(layers.deadlines.filter((l) => allowed.has(l)));
  const { from, to } = range;
  const feeds = await Promise.all([
    wanted.has("tasks")
      ? tasks.calendarItems(actor, from, to, today, layers.mine)
      : Promise.resolve([]),
    wanted.has("permits") ? permits.calendarItems(actor, from, to, today) : Promise.resolve([]),
    wanted.has("shifts") ? hours.calendarItems(actor, from, to) : Promise.resolve([]),
    wanted.has("installments") ? finance.calendarItems(actor, from, to) : Promise.resolve([]),
    wanted.has("obligations") ? company.calendarItems(actor, from, to) : Promise.resolve([]),
  ]);
  let items = feeds.flat();
  if (layers.critical) items = items.filter((i) => i.tone === "warn" || i.tone === "critical");
  const rank = (tone: CalendarItem["tone"]) => (tone === "critical" ? 0 : tone === "warn" ? 1 : 2);
  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      rank(a.tone) - rank(b.tone) ||
      a.title.localeCompare(b.title, "de"),
  );
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
