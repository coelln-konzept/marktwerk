import { MAX_EVENTS_PER_WEEKEND, REFERENCE_DATE, SEASONS } from "../constants";
import type { PresetBlueprint } from "../dictionaries/presets";
import { EVENT_NOTES, PUBLIC_TEXT_SENTENCES } from "../dictionaries/texts";
import type { VenueBlueprint } from "../dictionaries/venues";
import { addDays, daysBetween, mondayBefore, weekendSaturdaysTouched, yearOf } from "../lib/dates";
import type { Rng } from "../lib/rng";
import { expandRRule } from "../lib/rrule";
import type {
  DutyRoleKey,
  Event,
  EventAnchor,
  EventPreset,
  EventStatus,
  EventType,
  Venue,
} from "../types";

export interface PresetContext {
  eventTypes: EventType[];
  venues: Venue[];
  venueBlueprintByName: Map<string, VenueBlueprint>;
  templateIdByTypeKey: Map<string, string>;
  dutyDefaults: Record<DutyRoleKey, string>;
}

export function buildEventPresets(
  rng: Rng,
  blueprints: readonly PresetBlueprint[],
  ctx: PresetContext,
): EventPreset[] {
  const typeIdByKey = new Map(ctx.eventTypes.map((type) => [type.key, type.id]));
  const venueIdByKey = new Map<string, string>();
  for (const venue of ctx.venues) {
    const blueprint = ctx.venueBlueprintByName.get(venue.name);
    if (blueprint) venueIdByKey.set(blueprint.key, venue.id);
  }

  return blueprints.map((blueprint) => {
    const venueId = venueIdByKey.get(blueprint.venueKey);
    const typeId = typeIdByKey.get(blueprint.eventType);
    const templateId = ctx.templateIdByTypeKey.get(blueprint.eventType);
    const venue = ctx.venues.find((candidate) => candidate.id === venueId);
    if (!venueId || !typeId || !templateId || !venue) {
      throw new Error(`Preset ${blueprint.key} references an unknown venue, type or template`);
    }
    const venueBlueprint = ctx.venueBlueprintByName.get(venue.name);
    const place = venueBlueprint?.publicPlace ?? venue.name;
    const typeSentences = PUBLIC_TEXT_SENTENCES[blueprint.eventType];
    const first = rng.pick(typeSentences);
    const second = rng.pick(typeSentences.filter((sentence) => sentence !== first));
    const sentences = rng.chance(0.5) ? [first, second] : [first];
    sentences.push(`Der Markt findet ${place} statt.`);
    return {
      id: rng.uuid(),
      key: blueprint.key,
      eventTypeId: typeId,
      venueId,
      checklistTemplateId: templateId,
      name: blueprint.name,
      publicTitle: blueprint.name,
      publicText: sentences.join(" "),
      pricePerMCents: blueprint.pricePerMCents,
      bookingFeeCents: 250,
      defaultTimes: { ...blueprint.times },
      rrule: blueprint.rrule,
      durationDays: blueprint.durationDays,
      defaultDuties: { ...ctx.dutyDefaults },
      active: true,
    };
  });
}

interface Candidate {
  preset: EventPreset;
  startsOn: string;
  endsOn: string;
}

/**
 * Expands every preset over the seasons and applies the scheduling rules, in date order:
 * - at most MAX_EVENTS_PER_WEEKEND events touch one weekend (occurrences over the cap are dropped)
 * - no two events at the same venue on the same day (the later occurrence is dropped)
 */
function scheduleCandidates(presets: EventPreset[]): Candidate[] {
  const from = `${SEASONS[0]}-01-01`;
  const to = `${SEASONS[SEASONS.length - 1]}-12-31`;
  const all: Candidate[] = [];
  for (const preset of presets) {
    for (const startsOn of expandRRule(preset.rrule, from, to)) {
      all.push({ preset, startsOn, endsOn: addDays(startsOn, preset.durationDays - 1) });
    }
  }
  all.sort((a, b) =>
    a.startsOn === b.startsOn
      ? a.preset.key.localeCompare(b.preset.key)
      : a.startsOn < b.startsOn
        ? -1
        : 1,
  );

  const weekendCount = new Map<string, number>();
  const busyDays = new Map<string, Set<string>>();
  const accepted: Candidate[] = [];
  for (const candidate of all) {
    const weekends = weekendSaturdaysTouched(candidate.startsOn, candidate.endsOn);
    const weekendFull = weekends.some(
      (saturday) => (weekendCount.get(saturday) ?? 0) >= MAX_EVENTS_PER_WEEKEND,
    );
    const days = Array.from(
      { length: daysBetween(candidate.startsOn, candidate.endsOn) + 1 },
      (_, offset) => addDays(candidate.startsOn, offset),
    );
    const venueDays = busyDays.get(candidate.preset.venueId) ?? new Set<string>();
    const venueBusy = days.some((day) => venueDays.has(day));
    if (weekendFull || venueBusy) continue;

    for (const saturday of weekends)
      weekendCount.set(saturday, (weekendCount.get(saturday) ?? 0) + 1);
    for (const day of days) venueDays.add(day);
    busyDays.set(candidate.preset.venueId, venueDays);
    accepted.push(candidate);
  }
  return accepted;
}

/** Lifecycle status from the reference date. Booking flags are separate (see bookingFlags). */
function lifecycleStatus(endsOn: string, season: number): EventStatus {
  if (endsOn < REFERENCE_DATE) {
    return endsOn < addDays(REFERENCE_DATE, -21) ? "closed" : "completed";
  }
  if (season === SEASONS[0]) return "confirmed";
  // New dates go online right away (client decision 2026-10-22): next season's events are planned,
  // whether or not the venue has applied yet; confirmation follows the permits.
  return "planned";
}

export interface EventsBundle {
  events: Event[];
  eventAnchors: EventAnchor[];
}

export function buildEvents(rng: Rng, presets: EventPreset[], ctx: PresetContext): EventsBundle {
  const typeById = new Map(ctx.eventTypes.map((type) => [type.id, type]));
  const venueById = new Map(ctx.venues.map((venue) => [venue.id, venue]));
  const scheduled = scheduleCandidates(presets);

  const events: Event[] = [];
  const eventAnchors: EventAnchor[] = [];
  for (const candidate of scheduled) {
    const preset = candidate.preset;
    const type = typeById.get(preset.eventTypeId);
    const venue = venueById.get(preset.venueId);
    const blueprint = venue ? ctx.venueBlueprintByName.get(venue.name) : undefined;
    if (!type || !venue || !blueprint)
      throw new Error(`Missing type or venue for preset ${preset.key}`);

    const season = yearOf(candidate.startsOn);
    const status = lifecycleStatus(candidate.endsOn, season);
    const eventId = rng.uuid();
    const setupDay = preset.durationDays > 1 ? addDays(candidate.startsOn, -1) : candidate.startsOn;
    const bookingCutoff = mondayBefore(candidate.startsOn);

    // Online booking only for types that allow it, and only until the cut-off in the future.
    const bookingOpen =
      type.rules.onlineBookingAllowed && status === "confirmed" && bookingCutoff > REFERENCE_DATE;

    events.push({
      id: eventId,
      presetId: preset.id,
      eventTypeId: type.id,
      venueId: venue.id,
      name: preset.name,
      season,
      startsOn: candidate.startsOn,
      endsOn: candidate.endsOn,
      times: { ...preset.defaultTimes },
      status,
      bookingOpen,
      fullyBooked: false,
      carSpacesFull: false,
      pricePerMCents: preset.pricePerMCents,
      bookingFeeCents: preset.bookingFeeCents,
      cancelledReason: null,
      notes: rng.chance(0.15) ? rng.pick(EVENT_NOTES) : null,
      duties: { ...preset.defaultDuties },
    });
    eventAnchors.push(
      { id: rng.uuid(), eventId, key: "eventDay", date: candidate.startsOn },
      { id: rng.uuid(), eventId, key: "setupDay", date: setupDay },
      { id: rng.uuid(), eventId, key: "bookingCutoff", date: bookingCutoff },
    );
  }

  return { events: cancelSome(rng, events, typeById), eventAnchors };
}

/**
 * Two events of the 2026 season are cancelled (one flea for weather, one antique for a late permit).
 * They keep their place in the calendar but have no bookings, shifts or open tasks.
 */
function cancelSome(rng: Rng, events: Event[], typeById: Map<string, EventType>): Event[] {
  const typeKey = (event: Event): string | undefined => typeById.get(event.eventTypeId)?.key;
  const monthOf = (event: Event): string => event.startsOn.slice(5, 7);
  const fleaCandidates = events.filter(
    (e) => e.season === 2026 && typeKey(e) === "flea" && ["06", "07", "08"].includes(monthOf(e)),
  );
  const antiqueCandidates = events.filter(
    (e) => e.season === 2026 && typeKey(e) === "antique" && monthOf(e) === "05",
  );
  const toCancel = new Map<string, string>();
  const flea = fleaCandidates[rng.int(0, Math.max(0, fleaCandidates.length - 1))];
  const antique = antiqueCandidates[rng.int(0, Math.max(0, antiqueCandidates.length - 1))];
  if (flea) toCancel.set(flea.id, "Abgesagt wegen Starkregenwarnung der Stadt.");
  if (antique) toCancel.set(antique.id, "Sondernutzungserlaubnis nicht rechtzeitig erteilt.");
  return events.map((event): Event => {
    const reason = toCancel.get(event.id);
    return reason === undefined
      ? event
      : { ...event, status: "cancelled", cancelledReason: reason, bookingOpen: false };
  });
}
