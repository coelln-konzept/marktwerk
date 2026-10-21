import "server-only";
import { can, isBundesland, isPostalCode, MAX_LENGTH_CM } from "@marktwerk/core";
import { auditLog, contact, venue, venueKind, venueRow, zone } from "@marktwerk/db/schema";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

export type VenueErrorCode =
  | "not_found"
  | "invalid_name"
  | "invalid_kind"
  | "invalid_street"
  | "invalid_postal_code"
  | "invalid_city"
  | "invalid_bundesland"
  | "invalid_access_info"
  | "invalid_capacity"
  | "invalid_coordinates"
  | "invalid_landowner"
  | "invalid_zone_name"
  | "invalid_row_label"
  | "invalid_length"
  | "invalid_depth"
  | "invalid_car_slots"
  | "invalid_direction"
  | "conflict"
  | "nothing_to_restore";

export class VenueInputError extends Error {
  constructor(readonly code: VenueErrorCode) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_NAME_LENGTH = 120;
export const MAX_STREET_LENGTH = 120;
export const MAX_CITY_LENGTH = 80;
export const MAX_ACCESS_INFO_LENGTH = 2000;
export const MAX_ZONE_NAME_LENGTH = 60;
export const MAX_ROW_LABEL_LENGTH = 40;
export const MAX_CAR_SLOTS = 999;
/** Undo of a delete only works for this long after it (the undo toast lasts 8 s). */
const RESTORE_WINDOW_MS = 60 * 60 * 1000;

const squash = (value: string) => value.trim().replace(/\s+/g, " ");
const orNull = (value: string | null | undefined) => {
  const text = squash(value ?? "");
  return text === "" ? null : text;
};

// ---------------------------------------------------------------------------------------------
// Venue

export type VenueInput = {
  name: string;
  kind: string;
  street: string | null;
  postalCode: string | null;
  city: string;
  bundesland: string;
  lat: number | null;
  lng: number | null;
  /** Stored frontage in cm; the detail page shows the sum of the rows instead once rows exist. */
  capacityCm: number | null;
  accessInfo: string | null;
  landownerContactId: string | null;
};

type VenueFields = typeof venue.$inferInsert;

const VENUE_FIELDS = [
  "name",
  "kind",
  "street",
  "postalCode",
  "city",
  "bundesland",
  "lat",
  "lng",
  "capacityCm",
  "accessInfo",
  "landownerContactId",
] as const satisfies readonly (keyof VenueInput & keyof VenueFields)[];

type CleanVenue = Required<Pick<VenueFields, (typeof VENUE_FIELDS)[number]>>;

const isVenueKind = (value: string): value is (typeof venueKind.enumValues)[number] =>
  (venueKind.enumValues as readonly string[]).includes(value);

const isIntBetween = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** Trims, empties to null and validates; throws the first problem found. */
function cleanVenue(input: VenueInput): CleanVenue {
  const name = squash(input.name ?? "");
  if (name === "" || name.length > MAX_NAME_LENGTH) throw new VenueInputError("invalid_name");
  if (!isVenueKind(input.kind)) throw new VenueInputError("invalid_kind");
  const street = orNull(input.street);
  if (street && street.length > MAX_STREET_LENGTH) throw new VenueInputError("invalid_street");
  const postalCode = orNull(input.postalCode);
  if (postalCode && !isPostalCode(postalCode)) throw new VenueInputError("invalid_postal_code");
  const city = squash(input.city ?? "");
  if (city === "" || city.length > MAX_CITY_LENGTH) throw new VenueInputError("invalid_city");
  if (!isBundesland(input.bundesland)) throw new VenueInputError("invalid_bundesland");
  // Access info keeps its line breaks.
  const accessText = (input.accessInfo ?? "").trim();
  const accessInfo = accessText === "" ? null : accessText;
  if (accessInfo && accessInfo.length > MAX_ACCESS_INFO_LENGTH)
    throw new VenueInputError("invalid_access_info");
  const capacityCm = input.capacityCm ?? null;
  if (capacityCm !== null && !isIntBetween(capacityCm, 1, MAX_LENGTH_CM))
    throw new VenueInputError("invalid_capacity");
  const lat = input.lat ?? null;
  const lng = input.lng ?? null;
  const validAxis = (v: number | null, limit: number) =>
    v === null || (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit);
  if ((lat === null) !== (lng === null) || !validAxis(lat, 90) || !validAxis(lng, 180))
    throw new VenueInputError("invalid_coordinates");
  const landownerContactId = input.landownerContactId || null;
  if (landownerContactId && !UUID.test(landownerContactId))
    throw new VenueInputError("invalid_landowner");
  return {
    name,
    kind: input.kind,
    street,
    postalCode,
    city,
    bundesland: input.bundesland,
    lat,
    lng,
    capacityCm,
    accessInfo,
    landownerContactId,
  };
}

/** Landowner must be a live contact of kind landowner (an archived one may stay where it already is). */
async function checkLandowner(tx: Tx, contactId: string | null, current?: string | null) {
  if (!contactId || contactId === current) return;
  const [row] = await tx
    .select({ kind: contact.kind, archivedAt: contact.archivedAt })
    .from(contact)
    .where(eq(contact.id, contactId));
  if (!row || row.archivedAt || row.kind !== "landowner")
    throw new VenueInputError("invalid_landowner");
}

async function lockVenue(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new VenueInputError("not_found");
  const [row] = await tx
    .select()
    .from(venue)
    .where(and(eq(venue.id, id), isNull(venue.archivedAt)))
    .for("update");
  if (!row) throw new VenueInputError("not_found");
  return row;
}

const snapshotOf = (row: typeof venue.$inferSelect): CleanVenue => ({
  name: row.name,
  kind: row.kind,
  street: row.street,
  postalCode: row.postalCode,
  city: row.city,
  bundesland: row.bundesland,
  lat: row.lat,
  lng: row.lng,
  capacityCm: row.capacityCm,
  accessInfo: row.accessInfo,
  landownerContactId: row.landownerContactId,
});

/** "Neuer Ort". Audited as "venue.create" with the stored values. */
export async function createVenue(actor: Actor, input: VenueInput): Promise<{ id: string }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  const values = cleanVenue(input);
  return db.transaction(async (tx) => {
    await checkLandowner(tx, values.landownerContactId);
    const [row] = await tx.insert(venue).values(values).returning({ id: venue.id });
    if (!row) throw new Error("insert failed");
    await audit(tx, actor.id, [
      { action: "venue.create", entityType: "venue", entityId: row.id, diff: { values } },
    ]);
    return row;
  });
}

/** "Ort bearbeiten". Audited as "venue.update" with {field: {from, to}} for what changed. */
export async function updateVenue(
  actor: Actor,
  id: string,
  input: VenueInput,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  const next = cleanVenue(input);
  return db.transaction(async (tx) => {
    const current = await lockVenue(tx, id);
    const previous = snapshotOf(current);
    await checkLandowner(tx, next.landownerContactId, previous.landownerContactId);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of VENUE_FIELDS) {
      if (previous[field] !== next[field])
        changes[field] = { from: previous[field], to: next[field] };
    }
    if (Object.keys(changes).length === 0) return { changed: false };
    await tx.update(venue).set(next).where(eq(venue.id, id));
    await audit(tx, actor.id, [
      { action: "venue.update", entityType: "venue", entityId: id, diff: { changes } },
    ]);
    return { changed: true };
  });
}

/**
 * "Archivieren": the venue disappears from lists and pickers; events, presets and agreements keep
 * pointing at it. Nothing blocks it (decided in the task; reported as an open question).
 */
export async function archiveVenue(actor: Actor, id: string): Promise<{ name: string }> {
  if (!can(actor.role, "venue", "delete")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockVenue(tx, id);
    await tx.update(venue).set({ archivedAt: new Date() }).where(eq(venue.id, id));
    await audit(tx, actor.id, [
      {
        action: "venue.archive",
        entityType: "venue",
        entityId: id,
        diff: { name: current.name },
      },
    ]);
    return { name: current.name };
  });
}

/** Undo of "Archivieren". Audited as "venue.restore". */
export async function restoreVenue(actor: Actor, id: string): Promise<{ name: string }> {
  if (!can(actor.role, "venue", "delete")) forbidden();
  if (!UUID.test(id)) throw new VenueInputError("not_found");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(venue).where(eq(venue.id, id)).for("update");
    if (!current) throw new VenueInputError("not_found");
    if (!current.archivedAt) throw new VenueInputError("conflict");
    await tx.update(venue).set({ archivedAt: null }).where(eq(venue.id, id));
    await audit(tx, actor.id, [
      {
        action: "venue.restore",
        entityType: "venue",
        entityId: id,
        diff: { name: current.name },
      },
    ]);
    return { name: current.name };
  });
}

// ---------------------------------------------------------------------------------------------
// Zones

const cleanZoneName = (name: string) => {
  const text = squash(name ?? "");
  if (text === "" || text.length > MAX_ZONE_NAME_LENGTH)
    throw new VenueInputError("invalid_zone_name");
  return text;
};

/** Locks the venue (serialises edits of its zones and rows) and returns the zone. */
async function lockZone(tx: Tx, zoneId: string) {
  if (!UUID.test(zoneId)) throw new VenueInputError("not_found");
  const [found] = await tx.select().from(zone).where(eq(zone.id, zoneId));
  if (!found) throw new VenueInputError("not_found");
  await lockVenue(tx, found.venueId);
  const [row] = await tx.select().from(zone).where(eq(zone.id, zoneId)).for("update");
  if (!row) throw new VenueInputError("not_found");
  return row;
}

/** "Zone hinzufügen": goes to the end. Audited as "venue.zone.create". */
export async function createZone(
  actor: Actor,
  venueId: string,
  name: string,
): Promise<{ id: string }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  const clean = cleanZoneName(name);
  return db.transaction(async (tx) => {
    await lockVenue(tx, venueId);
    const [last] = await tx
      .select({ max: sql<number | null>`max(${zone.sort})` })
      .from(zone)
      .where(eq(zone.venueId, venueId));
    const sort = (last?.max ?? -1) + 1;
    const [row] = await tx
      .insert(zone)
      .values({ venueId, name: clean, sort })
      .returning({ id: zone.id });
    if (!row) throw new Error("insert failed");
    await audit(tx, actor.id, [
      {
        action: "venue.zone.create",
        entityType: "zone",
        entityId: row.id,
        diff: { venueId, name: clean, sort },
      },
    ]);
    return row;
  });
}

/** "Umbenennen". Audited as "venue.zone.update". */
export async function renameZone(
  actor: Actor,
  zoneId: string,
  name: string,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  const clean = cleanZoneName(name);
  return db.transaction(async (tx) => {
    const current = await lockZone(tx, zoneId);
    if (current.name === clean) return { changed: false };
    await tx.update(zone).set({ name: clean }).where(eq(zone.id, zoneId));
    await audit(tx, actor.id, [
      {
        action: "venue.zone.update",
        entityType: "zone",
        entityId: zoneId,
        diff: { venueId: current.venueId, changes: { name: { from: current.name, to: clean } } },
      },
    ]);
    return { changed: true };
  });
}

/**
 * "Nach oben / unten": swaps the zone with its neighbour. The sort numbers of the venue are rewritten
 * as 0..n-1 (older data may have gaps or ties), in the order the detail page shows them.
 */
export async function moveZone(
  actor: Actor,
  zoneId: string,
  direction: string,
): Promise<{ changed: boolean; position: number; count: number }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  if (direction !== "up" && direction !== "down") throw new VenueInputError("invalid_direction");
  return db.transaction(async (tx) => {
    const current = await lockZone(tx, zoneId);
    const zones = await tx
      .select({ id: zone.id, sort: zone.sort })
      .from(zone)
      .where(eq(zone.venueId, current.venueId))
      .orderBy(asc(zone.sort), asc(zone.name), asc(zone.id));
    const from = zones.findIndex((z) => z.id === zoneId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= zones.length)
      return { changed: false, position: from + 1, count: zones.length };
    const order = zones.map((z) => z.id);
    order.splice(to, 0, ...order.splice(from, 1));
    for (const [index, id] of order.entries()) {
      if (zones.find((z) => z.id === id)?.sort !== index)
        await tx.update(zone).set({ sort: index }).where(eq(zone.id, id));
    }
    await audit(tx, actor.id, [
      {
        action: "venue.zone.move",
        entityType: "zone",
        entityId: zoneId,
        diff: { venueId: current.venueId, name: current.name, from: from + 1, to: to + 1 },
      },
    ]);
    return { changed: true, position: to + 1, count: zones.length };
  });
}

type RowSnapshot = {
  id: string;
  zoneId: string;
  label: string;
  lengthCm: number;
  depthCm: number;
  carAllowed: boolean;
  carSlots: number;
  power: boolean;
  water: boolean;
  sort: number;
  createdAt: string;
};

type ZoneSnapshot = {
  id: string;
  venueId: string;
  name: string;
  sort: number;
  createdAt: string;
};

const snapshotRow = (r: typeof venueRow.$inferSelect): RowSnapshot => ({
  id: r.id,
  zoneId: r.zoneId,
  label: r.label,
  lengthCm: r.lengthCm,
  depthCm: r.depthCm,
  carAllowed: r.carAllowed,
  carSlots: r.carSlots,
  power: r.power,
  water: r.water,
  sort: r.sort,
  createdAt: r.createdAt.toISOString(),
});

/** The last delete entry of a zone or row, if it is recent enough to undo. */
async function lastDeleteEntry(tx: Tx, action: string, entityId: string) {
  if (!UUID.test(entityId)) throw new VenueInputError("nothing_to_restore");
  const [entry] = await tx
    .select({ diff: auditLog.diff })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, action),
        eq(auditLog.entityId, entityId),
        gte(auditLog.at, new Date(Date.now() - RESTORE_WINDOW_MS)),
      ),
    )
    .orderBy(desc(auditLog.at))
    .limit(1);
  const snapshot = (entry?.diff as { snapshot?: unknown } | null | undefined)?.snapshot;
  if (!snapshot) throw new VenueInputError("nothing_to_restore");
  return snapshot;
}

/**
 * "Zone löschen" removes the zone with its rows. The audit entry keeps everything needed to put it
 * back ("venue.zone.restore", used by the undo toast), so no client data is trusted for the undo.
 */
export async function deleteZone(
  actor: Actor,
  zoneId: string,
): Promise<{ name: string; rowCount: number }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockZone(tx, zoneId);
    const rows = await tx
      .select()
      .from(venueRow)
      .where(eq(venueRow.zoneId, zoneId))
      .orderBy(asc(venueRow.sort), asc(venueRow.label));
    await tx.delete(zone).where(eq(zone.id, zoneId));
    const snapshot: { zone: ZoneSnapshot; rows: RowSnapshot[] } = {
      zone: {
        id: current.id,
        venueId: current.venueId,
        name: current.name,
        sort: current.sort,
        createdAt: current.createdAt.toISOString(),
      },
      rows: rows.map(snapshotRow),
    };
    await audit(tx, actor.id, [
      {
        action: "venue.zone.delete",
        entityType: "zone",
        entityId: zoneId,
        diff: { venueId: current.venueId, name: current.name, rowCount: rows.length, snapshot },
      },
    ]);
    return { name: current.name, rowCount: rows.length };
  });
}

/** Undo of "Zone löschen": inserts the zone and its rows again with the same ids. */
export async function restoreZone(
  actor: Actor,
  zoneId: string,
): Promise<{ name: string; rowCount: number }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  return db.transaction(async (tx) => {
    const snapshot = (await lastDeleteEntry(tx, "venue.zone.delete", zoneId)) as {
      zone: ZoneSnapshot;
      rows: RowSnapshot[];
    };
    await lockVenue(tx, snapshot.zone.venueId);
    const [existing] = await tx.select({ id: zone.id }).from(zone).where(eq(zone.id, zoneId));
    if (existing) throw new VenueInputError("conflict");
    await tx.insert(zone).values({
      id: snapshot.zone.id,
      venueId: snapshot.zone.venueId,
      name: snapshot.zone.name,
      sort: snapshot.zone.sort,
      createdAt: new Date(snapshot.zone.createdAt),
    });
    if (snapshot.rows.length > 0)
      await tx
        .insert(venueRow)
        .values(snapshot.rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })));
    await audit(tx, actor.id, [
      {
        action: "venue.zone.restore",
        entityType: "zone",
        entityId: zoneId,
        diff: {
          venueId: snapshot.zone.venueId,
          name: snapshot.zone.name,
          rowCount: snapshot.rows.length,
        },
      },
    ]);
    return { name: snapshot.zone.name, rowCount: snapshot.rows.length };
  });
}

// ---------------------------------------------------------------------------------------------
// Rows

export type RowInput = {
  label: string;
  lengthCm: number;
  depthCm: number;
  carAllowed: boolean;
  carSlots: number;
  power: boolean;
  water: boolean;
};

const ROW_FIELDS = [
  "label",
  "lengthCm",
  "depthCm",
  "carAllowed",
  "carSlots",
  "power",
  "water",
] as const satisfies readonly (keyof RowInput)[];

/** Car slots only count where cars are allowed: without that flag they are stored as 0. */
function cleanRow(input: RowInput): RowInput {
  const label = squash(input.label ?? "");
  if (label === "" || label.length > MAX_ROW_LABEL_LENGTH)
    throw new VenueInputError("invalid_row_label");
  if (!isIntBetween(input.lengthCm, 1, MAX_LENGTH_CM)) throw new VenueInputError("invalid_length");
  if (!isIntBetween(input.depthCm, 1, MAX_LENGTH_CM)) throw new VenueInputError("invalid_depth");
  const carAllowed = input.carAllowed === true;
  const carSlots = carAllowed ? input.carSlots : 0;
  if (!isIntBetween(carSlots, 0, MAX_CAR_SLOTS)) throw new VenueInputError("invalid_car_slots");
  return {
    label,
    lengthCm: input.lengthCm,
    depthCm: input.depthCm,
    carAllowed,
    carSlots,
    power: input.power === true,
    water: input.water === true,
  };
}

/** Locks the venue and returns the row and its zone. */
async function lockRow(tx: Tx, rowId: string) {
  if (!UUID.test(rowId)) throw new VenueInputError("not_found");
  const [found] = await tx
    .select({ zoneId: venueRow.zoneId, venueId: zone.venueId })
    .from(venueRow)
    .innerJoin(zone, eq(zone.id, venueRow.zoneId))
    .where(eq(venueRow.id, rowId));
  if (!found) throw new VenueInputError("not_found");
  await lockVenue(tx, found.venueId);
  const [row] = await tx.select().from(venueRow).where(eq(venueRow.id, rowId)).for("update");
  if (!row) throw new VenueInputError("not_found");
  return { row, venueId: found.venueId };
}

/** "Reihe hinzufügen": goes to the end of the zone. Audited as "venue.row.create". */
export async function createRow(
  actor: Actor,
  zoneId: string,
  input: RowInput,
): Promise<{ id: string }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  const values = cleanRow(input);
  return db.transaction(async (tx) => {
    const parent = await lockZone(tx, zoneId);
    const [last] = await tx
      .select({ max: sql<number | null>`max(${venueRow.sort})` })
      .from(venueRow)
      .where(eq(venueRow.zoneId, zoneId));
    const sort = (last?.max ?? -1) + 1;
    const [row] = await tx
      .insert(venueRow)
      .values({ ...values, zoneId, sort })
      .returning({ id: venueRow.id });
    if (!row) throw new Error("insert failed");
    await audit(tx, actor.id, [
      {
        action: "venue.row.create",
        entityType: "row",
        entityId: row.id,
        diff: { venueId: parent.venueId, zoneId, zoneName: parent.name, values },
      },
    ]);
    return row;
  });
}

/** "Reihe bearbeiten". Audited as "venue.row.update" with {field: {from, to}}. */
export async function updateRow(
  actor: Actor,
  rowId: string,
  input: RowInput,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  const next = cleanRow(input);
  return db.transaction(async (tx) => {
    const { row: current, venueId } = await lockRow(tx, rowId);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of ROW_FIELDS) {
      if (current[field] !== next[field])
        changes[field] = { from: current[field], to: next[field] };
    }
    if (Object.keys(changes).length === 0) return { changed: false };
    await tx.update(venueRow).set(next).where(eq(venueRow.id, rowId));
    await audit(tx, actor.id, [
      {
        action: "venue.row.update",
        entityType: "row",
        entityId: rowId,
        diff: { venueId, zoneId: current.zoneId, changes },
      },
    ]);
    return { changed: true };
  });
}

/** "Reihe löschen"; the audit entry keeps the row for the undo. */
export async function deleteRow(actor: Actor, rowId: string): Promise<{ label: string }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  return db.transaction(async (tx) => {
    const { row, venueId } = await lockRow(tx, rowId);
    await tx.delete(venueRow).where(eq(venueRow.id, rowId));
    await audit(tx, actor.id, [
      {
        action: "venue.row.delete",
        entityType: "row",
        entityId: rowId,
        diff: { venueId, zoneId: row.zoneId, label: row.label, snapshot: snapshotRow(row) },
      },
    ]);
    return { label: row.label };
  });
}

/** Undo of "Reihe löschen": inserts the row again with the same id, if its zone still exists. */
export async function restoreRow(actor: Actor, rowId: string): Promise<{ label: string }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  return db.transaction(async (tx) => {
    const snapshot = (await lastDeleteEntry(tx, "venue.row.delete", rowId)) as RowSnapshot;
    const parent = await lockZone(tx, snapshot.zoneId);
    const [existing] = await tx
      .select({ id: venueRow.id })
      .from(venueRow)
      .where(eq(venueRow.id, rowId));
    if (existing) throw new VenueInputError("conflict");
    await tx.insert(venueRow).values({ ...snapshot, createdAt: new Date(snapshot.createdAt) });
    await audit(tx, actor.id, [
      {
        action: "venue.row.restore",
        entityType: "row",
        entityId: rowId,
        diff: { venueId: parent.venueId, zoneId: parent.id, label: snapshot.label },
      },
    ]);
    return { label: snapshot.label };
  });
}
