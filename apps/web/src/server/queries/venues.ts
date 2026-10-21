import "server-only";
import { can } from "@marktwerk/core";
import { foldIncludes } from "@marktwerk/core/text/fold";
import { contact, event, eventType, venue, venueRow, zone } from "@marktwerk/db/schema";
import { and, asc, count, desc, eq, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export type VenueListRow = Awaited<ReturnType<typeof listVenues>>[number];

/**
 * Locations for the Orte list. `upcoming` (number of upcoming, not cancelled events) is null for roles
 * that may not read events; for everyone else it only counts events they are allowed to see.
 */
export async function listVenues(actor: Actor, today: string, q?: string) {
  const showEvents = can(actor.role, "event", "read");
  const [venues, structure, upcoming] = await Promise.all([
    db
      .select({
        id: venue.id,
        name: venue.name,
        kind: venue.kind,
        street: venue.street,
        postalCode: venue.postalCode,
        city: venue.city,
        capacityCm: venue.capacityCm,
        landownerId: contact.id,
        landownerName: contact.name,
      })
      .from(venue)
      .leftJoin(contact, eq(contact.id, venue.landownerContactId))
      .where(isNull(venue.archivedAt))
      .orderBy(asc(venue.name)),
    db
      .select({
        venueId: zone.venueId,
        zones: sql<number>`count(distinct ${zone.id})::int`,
        rows: sql<number>`count(${venueRow.id})::int`,
        lengthCm: sql<number>`coalesce(sum(${venueRow.lengthCm}), 0)::int`,
      })
      .from(zone)
      .leftJoin(venueRow, eq(venueRow.zoneId, zone.id))
      .groupBy(zone.venueId),
    showEvents
      ? db
          .select({ venueId: event.venueId, n: count() })
          .from(event)
          .where(and(visibleEvents(actor), gte(event.endsOn, today), ne(event.status, "cancelled")))
          .groupBy(event.venueId)
      : Promise.resolve([]),
  ]);
  const structureOf = new Map(structure.map((s) => [s.venueId, s]));
  const upcomingOf = new Map(upcoming.map((u) => [u.venueId, u.n]));
  return venues
    .filter((v) => !q || foldIncludes([v.name, v.city, v.street, v.landownerName], q))
    .map((v) => {
      const s = structureOf.get(v.id);
      return {
        ...v,
        zones: s?.zones ?? 0,
        rows: s?.rows ?? 0,
        /** Sum of row frontage; falls back to the venue's stored capacity if no rows are recorded. */
        capacityCm: s && s.lengthCm > 0 ? s.lengthCm : v.capacityCm,
        upcoming: showEvents ? (upcomingOf.get(v.id) ?? 0) : null,
      };
    });
}

export type VenueDetail = NonNullable<Awaited<ReturnType<typeof getVenue>>>;

export async function getVenue(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      id: venue.id,
      name: venue.name,
      kind: venue.kind,
      street: venue.street,
      postalCode: venue.postalCode,
      city: venue.city,
      capacityCm: venue.capacityCm,
      accessInfo: venue.accessInfo,
      landownerId: contact.id,
      landownerName: contact.name,
      landownerPerson: contact.contactPerson,
      landownerPhone: contact.phoneE164,
      landownerEmail: contact.email,
    })
    .from(venue)
    .leftJoin(contact, eq(contact.id, venue.landownerContactId))
    .where(and(eq(venue.id, id), isNull(venue.archivedAt)));
  if (!row) return null;
  const [zones, rows] = await Promise.all([
    db
      .select({ id: zone.id, name: zone.name })
      .from(zone)
      .where(eq(zone.venueId, id))
      .orderBy(asc(zone.sort), asc(zone.name), asc(zone.id)),
    db
      .select({
        id: venueRow.id,
        zoneId: venueRow.zoneId,
        label: venueRow.label,
        lengthCm: venueRow.lengthCm,
        depthCm: venueRow.depthCm,
        carAllowed: venueRow.carAllowed,
        carSlots: venueRow.carSlots,
        power: venueRow.power,
        water: venueRow.water,
      })
      .from(venueRow)
      .innerJoin(zone, eq(zone.id, venueRow.zoneId))
      .where(eq(zone.venueId, id))
      .orderBy(asc(venueRow.sort), asc(venueRow.label)),
  ]);
  const zoneList = zones.map((z) => {
    const zoneRows = rows.filter((r) => r.zoneId === z.id);
    return {
      ...z,
      rows: zoneRows,
      lengthCm: zoneRows.reduce((sum, r) => sum + r.lengthCm, 0),
      carSlots: zoneRows.reduce((sum, r) => sum + r.carSlots, 0),
    };
  });
  const lengthCm = zoneList.reduce((sum, z) => sum + z.lengthCm, 0);
  return {
    ...row,
    zones: zoneList,
    rowCount: rows.length,
    capacityCm: lengthCm > 0 ? lengthCm : row.capacityCm,
  };
}

export type VenueEvent = Awaited<ReturnType<typeof listVenueEvents>>["upcoming"][number];

/** Upcoming and recent events at a venue, limited to what the actor may see. */
export async function listVenueEvents(actor: Actor, venueId: string, today: string) {
  if (!can(actor.role, "event", "read") || !isUuid(venueId)) {
    return { upcoming: [], recent: [] };
  }
  const select = {
    id: event.id,
    name: event.name,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    status: event.status,
    typeKey: eventType.key,
    typeNameDe: eventType.nameDe,
    typeNameEn: eventType.nameEn,
  };
  const base = (extra: ReturnType<typeof gte>) =>
    db
      .select(select)
      .from(event)
      .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
      .where(and(visibleEvents(actor), eq(event.venueId, venueId), extra));
  const [upcoming, recent] = await Promise.all([
    base(gte(event.endsOn, today)).orderBy(asc(event.startsOn)).limit(12),
    base(lt(event.endsOn, today)).orderBy(desc(event.startsOn)).limit(5),
  ]);
  return { upcoming, recent };
}

export type VenueOption = { id: string; name: string; city: string };

/** Venues to pick from (not archived), e.g. when an event changes its venue. */
export async function listVenueOptions(): Promise<VenueOption[]> {
  return db
    .select({ id: venue.id, name: venue.name, city: venue.city })
    .from(venue)
    .where(isNull(venue.archivedAt))
    .orderBy(asc(venue.city), asc(venue.name));
}

/** All stored fields of a venue for the edit form (capacity as stored, not the sum of the rows). */
export async function getVenueForEdit(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      id: venue.id,
      name: venue.name,
      kind: venue.kind,
      street: venue.street,
      postalCode: venue.postalCode,
      city: venue.city,
      bundesland: venue.bundesland,
      lat: venue.lat,
      lng: venue.lng,
      capacityCm: venue.capacityCm,
      accessInfo: venue.accessInfo,
      landownerContactId: venue.landownerContactId,
    })
    .from(venue)
    .where(and(eq(venue.id, id), isNull(venue.archivedAt)));
  if (!row) return null;
  const [rows] = await db
    .select({ lengthCm: sql<number>`coalesce(sum(${venueRow.lengthCm}), 0)::int` })
    .from(venueRow)
    .innerJoin(zone, eq(zone.id, venueRow.zoneId))
    .where(eq(zone.venueId, id));
  return { ...row, rowLengthCm: rows?.lengthCm ?? 0 };
}

export type LandownerOption = { id: string; name: string; city: string | null };

/** Landowner contacts to pick from; the venue's current one is always included. */
export async function listLandownerOptions(currentId?: string | null): Promise<LandownerOption[]> {
  const live = and(eq(contact.kind, "landowner"), isNull(contact.archivedAt));
  return db
    .select({ id: contact.id, name: contact.name, city: contact.city })
    .from(contact)
    .where(currentId && isUuid(currentId) ? or(live, eq(contact.id, currentId)) : live)
    .orderBy(asc(contact.name));
}
