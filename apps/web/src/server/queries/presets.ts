import "server-only";
import { eventPreset, eventType, staffMember, venue } from "@marktwerk/db/schema";
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
