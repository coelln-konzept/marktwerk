import "server-only";
import {
  checklistTemplate,
  dutyRole,
  event,
  eventPreset,
  eventPresetTemplate,
  eventType,
  staffMember,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, eq, isNull, lte, max, ne } from "drizzle-orm";
import { db } from "../db";

/**
 * The markets (presets) for "Markt planen": only active ones, most recently held first (latest
 * non-cancelled event on or before `today`), markets that were never held last, each group by name.
 */
export async function listPresetsForGeneration(today: string) {
  const lastHeld = db
    .select({ presetId: event.presetId, lastHeldOn: max(event.startsOn).as("last_held_on") })
    .from(event)
    .where(and(lte(event.startsOn, today), ne(event.status, "cancelled")))
    .groupBy(event.presetId)
    .as("last_held");
  const rows = await db
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
      color: eventPreset.color,
      lastHeldOn: lastHeld.lastHeldOn,
    })
    .from(eventPreset)
    .innerJoin(eventType, eq(eventType.id, eventPreset.eventTypeId))
    .innerJoin(venue, eq(venue.id, eventPreset.venueId))
    .leftJoin(lastHeld, eq(lastHeld.presetId, eventPreset.id))
    .where(and(isNull(eventPreset.archivedAt), eq(eventPreset.active, true)));
  return rows.sort((a, b) => {
    if (a.lastHeldOn !== b.lastHeldOn) {
      if (!a.lastHeldOn) return 1;
      if (!b.lastHeldOn) return -1;
      return a.lastHeldOn < b.lastHeldOn ? 1 : -1;
    }
    return a.name.localeCompare(b.name, "de");
  });
}

export type GenerationPreset = Awaited<ReturnType<typeof listPresetsForGeneration>>[number];

/** All markets (presets) for Einstellungen → Bibliothek, with the default team resolved to names. */
export async function listPresets() {
  const [presets, people, linkedTemplates] = await Promise.all([
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
        color: eventPreset.color,
      })
      .from(eventPreset)
      .innerJoin(eventType, eq(eventType.id, eventPreset.eventTypeId))
      .innerJoin(venue, eq(venue.id, eventPreset.venueId))
      .where(isNull(eventPreset.archivedAt))
      .orderBy(asc(eventType.sort), asc(eventPreset.name)),
    db.select({ id: staffMember.id, name: staffMember.displayName }).from(staffMember),
    db
      .select({
        presetId: eventPresetTemplate.presetId,
        id: checklistTemplate.id,
        name: checklistTemplate.name,
        ownerPresetId: checklistTemplate.ownerPresetId,
      })
      .from(eventPresetTemplate)
      .innerJoin(checklistTemplate, eq(checklistTemplate.id, eventPresetTemplate.templateId))
      .where(and(eq(checklistTemplate.kind, "event"), isNull(checklistTemplate.archivedAt)))
      .orderBy(asc(eventPresetTemplate.sort), asc(checklistTemplate.name)),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  return presets.map((p) => {
    const linked = linkedTemplates.filter((l) => l.presetId === p.id);
    const own = linked.find((l) => l.ownerPresetId === p.id) ?? null;
    return {
      ...p,
      /** The market's own task template (made from the master), if it has one. */
      ownTemplate: own ? { id: own.id, name: own.name } : null,
      /** The library templates it still uses (existing markets keep their per-type templates). */
      sharedTemplates: linked
        .filter((l) => l.ownerPresetId === null)
        .map((l) => ({ id: l.id, name: l.name })),
      team: Object.entries(p.defaultDuties).map(([roleKey, id]) => ({
        roleKey,
        name: nameOf.get(id) ?? "?",
      })),
    };
  });
}

const UUID = /^[0-9a-f-]{36}$/i;

/** The task templates of one market: its own copy of the Grundvorlage and/or the shared ones it still uses. */
export async function getPresetTaskTemplates(presetId: string) {
  if (!UUID.test(presetId)) return { own: null, shared: [] };
  const rows = await db
    .select({
      id: checklistTemplate.id,
      name: checklistTemplate.name,
      ownerPresetId: checklistTemplate.ownerPresetId,
    })
    .from(eventPresetTemplate)
    .innerJoin(checklistTemplate, eq(checklistTemplate.id, eventPresetTemplate.templateId))
    .where(
      and(
        eq(eventPresetTemplate.presetId, presetId),
        eq(checklistTemplate.kind, "event"),
        isNull(checklistTemplate.archivedAt),
      ),
    )
    .orderBy(asc(eventPresetTemplate.sort), asc(checklistTemplate.name));
  const own = rows.find((r) => r.ownerPresetId === presetId) ?? null;
  return {
    own: own ? { id: own.id, name: own.name } : null,
    shared: rows.filter((r) => r.ownerPresetId === null).map((r) => ({ id: r.id, name: r.name })),
  };
}

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
      color: eventPreset.color,
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
