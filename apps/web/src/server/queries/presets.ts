import "server-only";
import { dutyRole, eventPreset, eventType, staffMember, venue } from "@marktwerk/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db";

/** Presets for "Aus Vorlage erzeugen": only active ones. */
export async function listPresetsForGeneration() {
  return db
    .select({
      id: eventPreset.id,
      name: eventPreset.name,
      typeKey: eventType.key,
      typeNameDe: eventType.nameDe,
      typeNameEn: eventType.nameEn,
      venueId: venue.id,
      venueName: venue.name,
      durationDays: eventPreset.durationDays,
      rrule: eventPreset.rrule,
      pricePerMCents: eventPreset.pricePerMCents,
    })
    .from(eventPreset)
    .innerJoin(eventType, eq(eventType.id, eventPreset.eventTypeId))
    .innerJoin(venue, eq(venue.id, eventPreset.venueId))
    .where(and(isNull(eventPreset.archivedAt), eq(eventPreset.active, true)))
    .orderBy(asc(eventType.sort), asc(eventPreset.name));
}

export type GenerationPreset = Awaited<ReturnType<typeof listPresetsForGeneration>>[number];

/** All presets for the Vorlagen page, with the default team resolved to names. */
export async function listPresets() {
  const [presets, people] = await Promise.all([
    db
      .select({
        id: eventPreset.id,
        name: eventPreset.name,
        active: eventPreset.active,
        typeKey: eventType.key,
        typeNameDe: eventType.nameDe,
        typeNameEn: eventType.nameEn,
        venueId: venue.id,
        venueName: venue.name,
        durationDays: eventPreset.durationDays,
        rrule: eventPreset.rrule,
        pricePerMCents: eventPreset.pricePerMCents,
        bookingFeeCents: eventPreset.bookingFeeCents,
        defaultTimes: eventPreset.defaultTimes,
        defaultDuties: eventPreset.defaultDuties,
        publicTitle: eventPreset.publicTitle,
      })
      .from(eventPreset)
      .innerJoin(eventType, eq(eventType.id, eventPreset.eventTypeId))
      .innerJoin(venue, eq(venue.id, eventPreset.venueId))
      .where(isNull(eventPreset.archivedAt))
      .orderBy(asc(eventType.sort), asc(eventPreset.name)),
    db.select({ id: staffMember.id, name: staffMember.displayName }).from(staffMember),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  return presets.map((p) => ({
    ...p,
    team: Object.entries(p.defaultDuties).map(([roleKey, id]) => ({
      roleKey,
      name: nameOf.get(id) ?? "?",
    })),
  }));
}

const UUID = /^[0-9a-f-]{36}$/i;

/** One preset with everything the edit form needs; null if it doesn't exist or is archived. */
export async function getPresetForEdit(id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select({
      id: eventPreset.id,
      name: eventPreset.name,
      active: eventPreset.active,
      eventTypeId: eventPreset.eventTypeId,
      venueId: eventPreset.venueId,
      durationDays: eventPreset.durationDays,
      publicTitle: eventPreset.publicTitle,
      publicText: eventPreset.publicText,
      defaultTimes: eventPreset.defaultTimes,
      pricePerMCents: eventPreset.pricePerMCents,
      bookingFeeCents: eventPreset.bookingFeeCents,
      rrule: eventPreset.rrule,
      defaultDuties: eventPreset.defaultDuties,
      updatedAt: eventPreset.updatedAt,
    })
    .from(eventPreset)
    .where(and(eq(eventPreset.id, id), isNull(eventPreset.archivedAt)));
  return row ?? null;
}

export type PresetForEdit = NonNullable<Awaited<ReturnType<typeof getPresetForEdit>>>;

/**
 * Choices of the Vorlage form: event types and venues that are not archived, duty roles in their
 * order, active staff. What the preset being edited already uses stays selectable even if it has
 * been archived/deactivated since (`keep`), marked with `retired`.
 */
export async function getPresetFormOptions(keep?: {
  eventTypeId: string;
  venueId: string;
  staffIds: string[];
}) {
  const [types, venues, roles, people] = await Promise.all([
    db
      .select({
        id: eventType.id,
        key: eventType.key,
        nameDe: eventType.nameDe,
        nameEn: eventType.nameEn,
        rules: eventType.rules,
        archivedAt: eventType.archivedAt,
      })
      .from(eventType)
      .orderBy(asc(eventType.sort), asc(eventType.nameDe)),
    db
      .select({ id: venue.id, name: venue.name, city: venue.city, archivedAt: venue.archivedAt })
      .from(venue)
      .orderBy(asc(venue.name)),
    db
      .select({ key: dutyRole.key, nameDe: dutyRole.nameDe, nameEn: dutyRole.nameEn })
      .from(dutyRole)
      .orderBy(asc(dutyRole.sort), asc(dutyRole.nameDe)),
    db
      .select({
        id: staffMember.id,
        name: staffMember.displayName,
        active: staffMember.active,
        archivedAt: staffMember.archivedAt,
      })
      .from(staffMember)
      .orderBy(asc(staffMember.displayName)),
  ]);
  const keepStaff = new Set(keep?.staffIds);
  return {
    types: types
      .filter((t) => !t.archivedAt || t.id === keep?.eventTypeId)
      .map((t) => ({
        id: t.id,
        key: t.key,
        nameDe: t.nameDe,
        nameEn: t.nameEn,
        defaultPricePerMCents: t.rules.defaultPricePerMCents,
        defaultBookingFeeCents: t.rules.defaultBookingFeeCents,
        retired: t.archivedAt !== null,
      })),
    venues: venues
      .filter((v) => !v.archivedAt || v.id === keep?.venueId)
      .map((v) => ({ id: v.id, name: v.name, city: v.city, retired: v.archivedAt !== null })),
    roles,
    staff: people
      .filter((p) => (p.active && !p.archivedAt) || keepStaff.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, retired: !p.active || p.archivedAt !== null })),
  };
}

export type PresetFormOptions = Awaited<ReturnType<typeof getPresetFormOptions>>;
