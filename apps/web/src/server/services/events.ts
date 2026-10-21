import "server-only";
import {
  can,
  checkEventTimes,
  defaultAnchors,
  endsOnFor,
  isIsoDate,
  MAX_PRICE_CENTS,
  normalizeClockTime,
  type ScheduledEvent,
} from "@marktwerk/core";
import {
  type DefaultDuties,
  dutyRole,
  type EventTimes,
  event,
  eventAnchor,
  eventDuty,
  eventPreset,
  eventType,
  venue,
} from "@marktwerk/db/schema";
import { and, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

/** At most this many events per run (a full season of one preset is ~10). */
export const MAX_DATES_PER_RUN = 60;

/** Events last 1 to 14 days (same limit as presets, db check event_preset_duration). */
export const MAX_EVENT_DAYS = 14;

const MAX_NAME_LENGTH = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EventInputError extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export function validateDates(dates: string[]): string[] {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) throw new EventInputError("no_dates");
  if (unique.length > MAX_DATES_PER_RUN) throw new EventInputError("too_many_dates");
  if (!unique.every(isIsoDate)) throw new EventInputError("invalid_date");
  return unique;
}

export type EventSource = "preset" | "manual" | "agreement";

/** What every new event is copied from: a preset, or the data typed for a single event. */
export type EventTemplate = {
  presetId: string | null;
  eventTypeId: string;
  venueId: string;
  name: string;
  durationDays: number;
  times: EventTimes;
  pricePerMCents: number;
  bookingFeeCents: number;
  /** duty_role.key → staff_member.id; empty for events without a preset. */
  defaultDuties: DefaultDuties;
};

export type CreatedEvent = { id: string; startsOn: string };

/**
 * THE one service path that creates events (CLAUDE.md, data model "Generating events"): copies type,
 * venue, times and prices from the template, sets the named anchors and the default duties, all inside
 * the caller's transaction with an audit entry per event. Presets, single events and location
 * agreements only differ in where the template comes from (and the audit `source`); nothing else may
 * insert into `event`. Warnings (holidays, weekend cap, venue already booked) never block; the office
 * decides in the preview.
 *
 * `days` must already be validated (`validateDates`). Extended in M2 (checklists + tasks from the
 * preset's published templates) and M3 (logbook fill).
 */
export async function instantiateEvents(
  tx: Tx,
  actor: Actor,
  template: EventTemplate,
  days: string[],
  source: EventSource,
  links: { locationAgreementId?: string } = {},
): Promise<CreatedEvent[]> {
  if (!can(actor.role, "event", "write")) forbidden();
  const hasDuties = Object.keys(template.defaultDuties).length > 0;
  const roles = hasDuties
    ? await tx.select({ id: dutyRole.id, key: dutyRole.key }).from(dutyRole)
    : [];
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));

  const created: CreatedEvent[] = [];
  for (const startsOn of days) {
    const endsOn = endsOnFor(startsOn, template.durationDays);
    const [row] = await tx
      .insert(event)
      .values({
        presetId: template.presetId,
        locationAgreementId: links.locationAgreementId ?? null,
        eventTypeId: template.eventTypeId,
        venueId: template.venueId,
        name: template.name,
        season: Number(startsOn.slice(0, 4)),
        startsOn,
        endsOn,
        times: template.times,
        status: "draft",
        pricePerMCents: template.pricePerMCents,
        bookingFeeCents: template.bookingFeeCents,
      })
      .returning({ id: event.id });
    if (!row) throw new Error("insert failed");
    const anchors = defaultAnchors(startsOn, template.durationDays);
    await tx
      .insert(eventAnchor)
      .values(Object.entries(anchors).map(([key, date]) => ({ eventId: row.id, key, date })));
    const duties = Object.entries(template.defaultDuties).flatMap(([key, staffMemberId]) => {
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
      diff: {
        ...(template.presetId ? { presetId: template.presetId } : {}),
        ...(links.locationAgreementId ? { locationAgreementId: links.locationAgreementId } : {}),
        startsOn: c.startsOn,
        source,
      },
    })),
  );
  return created;
}

/** Template from an active preset. */
export async function presetTemplate(presetId: string): Promise<EventTemplate> {
  const preset = UUID.test(presetId)
    ? await db.query.eventPreset.findFirst({
        where: and(eq(eventPreset.id, presetId), isNull(eventPreset.archivedAt)),
      })
    : undefined;
  if (!preset?.active) throw new EventInputError("preset_not_found");
  return {
    presetId: preset.id,
    eventTypeId: preset.eventTypeId,
    venueId: preset.venueId,
    name: preset.name,
    durationDays: preset.durationDays,
    times: preset.defaultTimes,
    pricePerMCents: preset.pricePerMCents,
    bookingFeeCents: preset.bookingFeeCents,
    defaultDuties: preset.defaultDuties,
  };
}

/** Event data typed in the office ("Einzeltermin" and agreement dates without a preset). */
export type ManualEventInput = {
  name: string;
  eventTypeId: string;
  venueId: string;
  durationDays: number;
  times: EventTimes;
  pricePerMCents: number;
  bookingFeeCents: number;
};

const validCents = (cents: unknown) =>
  typeof cents === "number" &&
  Number.isSafeInteger(cents) &&
  cents >= 0 &&
  cents <= MAX_PRICE_CENTS;

/** Validates typed event data and turns it into a template (no preset, no default duties). */
export async function manualTemplate(input: ManualEventInput): Promise<EventTemplate> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "" || name.length > MAX_NAME_LENGTH) throw new EventInputError("invalid_name");
  if (
    !Number.isInteger(input.durationDays) ||
    input.durationDays < 1 ||
    input.durationDays > MAX_EVENT_DAYS
  )
    throw new EventInputError("invalid_duration");
  const clock = (value: unknown) => normalizeClockTime(String(value ?? "")) ?? "";
  const times: EventTimes = {
    setup: clock(input.times?.setup),
    open: clock(input.times?.open),
    close: clock(input.times?.close),
    teardown: clock(input.times?.teardown),
  };
  const timesError = checkEventTimes(times, input.durationDays > 1);
  if (timesError) throw new EventInputError(timesError);
  if (!validCents(input.pricePerMCents) || !validCents(input.bookingFeeCents))
    throw new EventInputError("invalid_price");

  const [type] = UUID.test(input.eventTypeId)
    ? await db
        .select({ id: eventType.id })
        .from(eventType)
        .where(and(eq(eventType.id, input.eventTypeId), isNull(eventType.archivedAt)))
    : [];
  if (!type) throw new EventInputError("invalid_event_type");
  const [place] = UUID.test(input.venueId)
    ? await db
        .select({ id: venue.id })
        .from(venue)
        .where(and(eq(venue.id, input.venueId), isNull(venue.archivedAt)))
    : [];
  if (!place) throw new EventInputError("invalid_venue");

  return {
    presetId: null,
    eventTypeId: type.id,
    venueId: place.id,
    name,
    durationDays: input.durationDays,
    times,
    pricePerMCents: input.pricePerMCents,
    bookingFeeCents: input.bookingFeeCents,
    defaultDuties: {},
  };
}

/** Generation from a preset ("Aus Vorlage erzeugen"): one draft event per date. */
export async function createEventsFromPreset(actor: Actor, presetId: string, dates: string[]) {
  if (!can(actor.role, "event", "write")) forbidden();
  const days = validateDates(dates);
  const template = await presetTemplate(presetId);
  return db.transaction((tx) => instantiateEvents(tx, actor, template, days, "preset"));
}

/** "Neue Veranstaltung ohne Vorlage" (Einzeltermin): one draft event, no preset, empty team. */
export async function createManualEvent(
  actor: Actor,
  input: ManualEventInput & { startsOn: string },
): Promise<CreatedEvent> {
  if (!can(actor.role, "event", "write")) forbidden();
  const days = validateDates([input.startsOn]);
  const template = await manualTemplate(input);
  const [created] = await db.transaction((tx) =>
    instantiateEvents(tx, actor, template, days, "manual"),
  );
  if (!created) throw new Error("insert failed");
  return created;
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
