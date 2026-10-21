import "server-only";
import { type HealthDimensions, teamHealth } from "@marktwerk/core";
import { dutyRole, event, eventDuty, eventType, staffMember, venue } from "@marktwerk/db/schema";
import { and, asc, count, eq, gte, lte, ne, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";

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
      venueId: venue.id,
      venueName: venue.name,
      city: venue.city,
      duties: sql<number>`(select count(*)::int from ${eventDuty} where ${eventDuty.eventId} = ${event.id})`,
    })
    .from(event)
    .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
    .innerJoin(venue, eq(venue.id, event.venueId))
    .where(where(actor, filters))
    .orderBy(asc(event.startsOn), asc(event.name));
  return rows.map((r) => ({ ...r, health: healthOf(r.status, r.duties, required) }));
}

function healthOf(status: EventStatusKey, duties: number, required: number): HealthDimensions {
  const past = status === "completed" || status === "closed" || status === "cancelled";
  return {
    permits: null,
    tasks: null,
    team: past ? null : teamHealth(duties, required),
    money: null,
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
  const found = await db.query.event.findFirst({
    where: and(eq(event.id, id), visibleEvents(actor)),
  });
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
    health: healthOf(found.status, assigned, required),
  };
});

export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEvent>>>;
