import "server-only";
import {
  can,
  defaultAnchors,
  defaultSchedule,
  endsOnFor,
  groupConsecutiveDates,
  isIsoDate,
  MAX_PRICE_CENTS,
  parseSchedule,
  type Schedule,
  type ScheduledEvent,
  validateSchedule,
} from "@marktwerk/core";
import {
  auditLog,
  type DefaultDuties,
  dutyRole,
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
import { fillLogbookForEvents } from "./permits";
import { ensureSeasonsTx, syncSeasonsTx } from "./seasons";
import { instantiateTemplatesForEvents } from "./task-instantiation";

/** At most this many events per run (a full season of one preset is ~10). */
export const MAX_DATES_PER_RUN = 60;

/** Events last 1 to 14 days (same limit as presets, db check event_preset_duration). */
export const MAX_EVENT_DAYS = 14;

const MAX_NAME_LENGTH = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EventInputError extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A scheduled event plus its market (preset), so "Markt planen" can spot dates that exist already. */
export type ScheduleContextEvent = ScheduledEvent & { presetId: string | null };

/** Existing (not cancelled, not archived) events in a date window, for conflict checks. */
export async function scheduledEventsBetween(
  from: string,
  to: string,
): Promise<ScheduleContextEvent[]> {
  return db
    .select({
      id: event.id,
      name: event.name,
      presetId: event.presetId,
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
  /** The Zeitplan every new event gets a copy of (ADR 0022). */
  schedule: Schedule;
  pricePerMCents: number;
  bookingFeeCents: number;
  /** duty_role.key → staff_member.id; empty for events without a preset. */
  defaultDuties: DefaultDuties;
};

export type CreatedEvent = { id: string; startsOn: string };

/** A day to create an event on; with `durationDays` it overrides the template's length (merged days). */
export type EventDay = string | { startsOn: string; durationDays: number };

/**
 * THE one service path that creates events (CLAUDE.md, data model "Generating events"): copies type,
 * venue, Zeitplan and prices from the template, sets the named anchors and the default duties, all inside
 * the caller's transaction with an audit entry per event. Presets, single events and location
 * agreements only differ in where the template comes from (and the audit `source`); nothing else may
 * insert into `event`. Warnings (holidays, weekend cap, venue already booked) never block; the office
 * decides in the preview.
 *
 * `days` must already be validated (`validateDates`); a day with its own `durationDays` (merged days in
 * "Markt planen") overrides the template's length. Extended in M2 (checklists + tasks from the
 * preset's published templates) and M3 (logbook fill).
 */
export async function instantiateEvents(
  tx: Tx,
  actor: Actor,
  template: EventTemplate,
  days: EventDay[],
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
  for (const day of days) {
    const startsOn = typeof day === "string" ? day : day.startsOn;
    const durationDays = typeof day === "string" ? template.durationDays : day.durationDays;
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > MAX_EVENT_DAYS)
      throw new EventInputError("invalid_duration");
    const endsOn = endsOnFor(startsOn, durationDays);
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
        schedule: template.schedule.map((row) => ({ ...row })),
        status: "planned",
        pricePerMCents: template.pricePerMCents,
        bookingFeeCents: template.bookingFeeCents,
      })
      .returning({ id: event.id });
    if (!row) throw new Error("insert failed");
    const anchors = defaultAnchors(startsOn, durationDays);
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
  // M2: one checklist per template linked to the preset, with its tasks (one service path, same transaction).
  await instantiateTemplatesForEvents(
    tx,
    actor,
    created.map((c) => c.id),
  );
  // M3: logbook fill for the new events (covering permits, missing ones + their tasks).
  await fillLogbookForEvents(
    tx,
    created.map((c) => c.id),
    actor,
  );
  // Saison (research 13 §6.2): the market has its record for every season it now has dates in, and the anchors
  // of records that existed already follow the new dates (their open season tasks move along).
  if (template.presetId) {
    const presetId = template.presetId;
    const seasons = [...new Set(created.map((c) => Number(c.startsOn.slice(0, 4))))].sort();
    const keys = seasons.map((season) => ({ presetId, season }));
    await ensureSeasonsTx(tx, actor, keys, source === "agreement" ? "agreement" : "markt_planen");
    await syncSeasonsTx(tx, actor, keys, "event_create");
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
    schedule: preset.schedule,
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
  /** The Zeitplan as edited; left out = the default Zeitplan of a new market (ADR 0022). */
  schedule?: Schedule;
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
  const schedule = input.schedule === undefined ? defaultSchedule() : parseSchedule(input.schedule);
  if (!schedule || validateSchedule(schedule, input.durationDays).length > 0)
    throw new EventInputError("invalid_schedule");
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
    schedule,
    pricePerMCents: input.pricePerMCents,
    bookingFeeCents: input.bookingFeeCents,
    defaultDuties: {},
  };
}

/**
 * Generation from a preset ("Aus Vorlage erzeugen"): one planned event per date, or with `merge` one event per
 * run of consecutive dates (Saturday + Sunday → one two-day event; never shorter than the preset).
 */
export async function createEventsFromPreset(
  actor: Actor,
  presetId: string,
  dates: string[],
  options: { merge?: boolean } = {},
) {
  if (!can(actor.role, "event", "write")) forbidden();
  const days = validateDates(dates);
  const template = await presetTemplate(presetId);
  const plan: EventDay[] = options.merge
    ? groupConsecutiveDates(days, template.durationDays, MAX_EVENT_DAYS)
    : days;
  return db.transaction((tx) => instantiateEvents(tx, actor, template, plan, "preset"));
}

/** "Neue Veranstaltung ohne Vorlage" (Einzeltermin): one planned event, no preset, empty team. */
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

/** Did this audit entry belong to the creation of the event (not to later work on it)? */
function isCreationEntry(entry: { action: string; diff: unknown }): boolean {
  if (entry.action === "event.create") return true;
  // Confirmed right away because existing permits already cover it (logbook fill, same transaction).
  const diff = (entry.diff ?? {}) as { auto?: boolean; source?: string };
  return entry.action === "event.status" && diff.auto === true && diff.source === "logbook_fill";
}

/**
 * Undo of a generation run ("Rückgängig" toast): archives the events the run just created. Freshly
 * created events are recognised by their audit trail, not by status (new events start as "geplant", or
 * "bestätigt" if existing permits cover them): the event must have an `event.create` entry and nothing
 * else except its automatic confirmation at creation. Anything anyone changed since (status, notes,
 * dates, …) stays untouched.
 */
export async function undoGeneratedEvents(actor: Actor, ids: string[]) {
  if (!can(actor.role, "event", "write")) forbidden();
  if (ids.length === 0 || ids.length > MAX_DATES_PER_RUN)
    throw new EventInputError("invalid_selection");
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)))];
  return db.transaction(async (tx) => {
    if (wanted.length === 0) return 0;
    const rows = await tx
      .select({ id: event.id })
      .from(event)
      .where(and(inArray(event.id, wanted), isNull(event.archivedAt)))
      .orderBy(event.id)
      .for("update");
    if (rows.length === 0) return 0;
    const trail = await tx
      .select({ entityId: auditLog.entityId, action: auditLog.action, diff: auditLog.diff })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, "event"),
          inArray(
            auditLog.entityId,
            rows.map((r) => r.id),
          ),
        ),
      );
    const untouched = rows.filter((r) => {
      const own = trail.filter((t) => t.entityId === r.id);
      return own.some((t) => t.action === "event.create") && own.every(isCreationEntry);
    });
    if (untouched.length === 0) return 0;
    const archived = await tx
      .update(event)
      .set({ archivedAt: new Date() })
      .where(
        inArray(
          event.id,
          untouched.map((u) => u.id),
        ),
      )
      .returning({ id: event.id, presetId: event.presetId, season: event.season });
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
    // Archived dates no longer count for their season (R10).
    await syncSeasonsTx(tx, actor, archived, "event_archive");
    return archived.length;
  });
}
