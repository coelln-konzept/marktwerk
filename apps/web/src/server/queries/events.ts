import "server-only";
import { type HealthDimensions, type HealthLevel, teamHealth } from "@marktwerk/core";
import {
  dutyRole,
  event,
  eventDuty,
  eventPreset,
  eventType,
  staffMember,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, count, eq, gte, lte, ne, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { todayIn } from "@/lib/format";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import { eventMoneyHealthFor } from "./finance";
import { permitHealthByEvent } from "./permits";
import { taskHealthByEvent } from "./tasks";

export type EventStatusKey = (typeof event.status.enumValues)[number];

export type EventFilters = {
  season?: number;
  typeKey?: string;
  status?: EventStatusKey | "active";
  q?: string;
  from?: string;
  to?: string;
};

const dutyRoleCount = cache(async () => {
  const [row] = await db.select({ n: count() }).from(dutyRole);
  return row?.n ?? 0;
});

function where(actor: Actor, f: EventFilters, withType = true): SQL {
  const parts: (SQL | undefined)[] = [visibleEvents(actor)];
  if (f.season) parts.push(eq(event.season, f.season));
  if (withType && f.typeKey) parts.push(eq(eventType.key, f.typeKey));
  if (f.status === "active") parts.push(ne(event.status, "cancelled"));
  else if (f.status) parts.push(eq(event.status, f.status));
  if (f.from) parts.push(gte(event.endsOn, f.from));
  if (f.to) parts.push(lte(event.startsOn, f.to));
  if (f.q) {
    const like = `%${f.q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    parts.push(
      sql`(lower(${event.name}) like ${like} or lower(${venue.name}) like ${like} or lower(${venue.city}) like ${like})`,
    );
  }
  return and(...parts) as SQL;
}

export type EventRow = Awaited<ReturnType<typeof listEvents>>[number];

/** Events list with type, venue and the health dimensions known so far. */
export async function listEvents(actor: Actor, filters: EventFilters) {
  const required = await dutyRoleCount();
  const rows = await db
    .select({
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      status: event.status,
      season: event.season,
      typeKey: eventType.key,
      typeNameDe: eventType.nameDe,
      typeNameEn: eventType.nameEn,
      /** Market colour of the event's preset (`MARKET_COLORS` key), null = use the type marker. */
      color: eventPreset.color,
      venueId: venue.id,
      venueName: venue.name,
      city: venue.city,
      duties: sql<number>`(select count(*)::int from ${eventDuty} where ${eventDuty.eventId} = ${event.id})`,
    })
    .from(event)
    .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
    .innerJoin(venue, eq(venue.id, event.venueId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(where(actor, filters))
    .orderBy(asc(event.startsOn), asc(event.name));
  const dims = await dimensionHealth(actor, rows, todayIn());
  return rows.map((r) => ({
    ...r,
    health: healthOf(r.status, r.duties, required, dims.get(r.id)),
  }));
}

type Dimensions = {
  permits: HealthLevel | null;
  tasks: HealthLevel | null;
  money: HealthLevel | null;
};

/**
 * Permits, tasks and money health of many events: one query per dimension for all of them (never per
 * event). Tasks and money honour the actor's scope (no `finance:read` = no money dimension).
 */
async function dimensionHealth(
  actor: Actor,
  events: { id: string; startsOn: string }[],
  today: string,
): Promise<Map<string, Dimensions>> {
  const ids = events.map((e) => e.id);
  const [permits, tasks, money] = await Promise.all([
    permitHealthByEvent(events, today),
    taskHealthByEvent(actor, ids, today),
    eventMoneyHealthFor(actor, ids, today),
  ]);
  return new Map(
    ids.map((id) => [
      id,
      {
        permits: permits.get(id) ?? null,
        tasks: tasks.get(id) ?? null,
        money: money.get(id) ?? null,
      },
    ]),
  );
}

/**
 * The four health dimensions of one event. Finished and cancelled events carry no permits/tasks/team
 * signal any more; the money dimension stays for finished ones (rates can still be open) and goes for
 * cancelled ones.
 */
function healthOf(
  status: EventStatusKey,
  duties: number,
  required: number,
  dims: Dimensions = { permits: null, tasks: null, money: null },
): HealthDimensions {
  const past = status === "completed" || status === "closed" || status === "cancelled";
  return {
    permits: past ? null : dims.permits,
    tasks: past ? null : dims.tasks,
    team: past ? null : teamHealth(duties, required),
    money: status === "cancelled" ? null : dims.money,
  };
}

/** Counts per event type for the filter chips (same filters except the type itself). */
export async function countByType(actor: Actor, filters: EventFilters) {
  const rows = await db
    .select({ key: eventType.key, n: count() })
    .from(event)
    .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
    .innerJoin(venue, eq(venue.id, event.venueId))
    .where(where(actor, filters, false))
    .groupBy(eventType.key);
  return Object.fromEntries(rows.map((r) => [r.key, r.n])) as Record<string, number>;
}

export async function listEventTypes() {
  return db
    .select({
      id: eventType.id,
      key: eventType.key,
      nameDe: eventType.nameDe,
      nameEn: eventType.nameEn,
    })
    .from(eventType)
    .orderBy(asc(eventType.sort));
}

/** Seasons that have events, newest first. */
export async function listSeasons(actor: Actor): Promise<number[]> {
  const rows = await db
    .selectDistinct({ season: event.season })
    .from(event)
    .where(visibleEvents(actor))
    .orderBy(sql`${event.season} desc`);
  return rows.map((r) => r.season);
}

/** One event with everything the header and the Überblick tab need. Null if not visible. */
export const getEvent = cache(async (actor: Actor, id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  // Not `db.query.event.findFirst`: the relational API aliases the table as "event", and the
  // `exists (…)` of visibleEvents() for field users references "app"."event", which then fails to resolve.
  const [found] = await db
    .select()
    .from(event)
    .where(and(eq(event.id, id), visibleEvents(actor)))
    .limit(1);
  if (!found) return null;
  const [type, place, anchors, duties, preset, required] = await Promise.all([
    db.query.eventType.findFirst({ where: (t, { eq }) => eq(t.id, found.eventTypeId) }),
    db.query.venue.findFirst({ where: (v, { eq }) => eq(v.id, found.venueId) }),
    db.query.eventAnchor.findMany({
      where: (a, { eq }) => eq(a.eventId, id),
      orderBy: (a, { asc }) => asc(a.date),
    }),
    db
      .select({
        roleId: dutyRole.id,
        roleKey: dutyRole.key,
        roleDe: dutyRole.nameDe,
        roleEn: dutyRole.nameEn,
        staffMemberId: staffMember.id,
        staffName: staffMember.displayName,
      })
      .from(dutyRole)
      .leftJoin(eventDuty, and(eq(eventDuty.dutyRoleId, dutyRole.id), eq(eventDuty.eventId, id)))
      .leftJoin(staffMember, eq(staffMember.id, eventDuty.staffMemberId))
      .orderBy(asc(dutyRole.sort)),
    found.presetId
      ? db.query.eventPreset.findFirst({ where: (p, { eq }) => eq(p.id, found.presetId as string) })
      : null,
    dutyRoleCount(),
  ]);
  if (!type || !place) return null;
  const assigned = duties.filter((d) => d.staffMemberId).length;
  return {
    ...found,
    type,
    venue: place,
    anchors,
    duties,
    preset: preset ?? null,
    health: healthOf(
      found.status,
      assigned,
      required,
      (await dimensionHealth(actor, [{ id, startsOn: found.startsOn }], todayIn())).get(id),
    ),
  };
});

export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEvent>>>;
