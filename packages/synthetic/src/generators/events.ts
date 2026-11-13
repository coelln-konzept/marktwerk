import { defaultAnchors, type ScheduleRow, validateSchedule } from "@marktwerk/core";
import { MAX_EVENTS_PER_DAY } from "../constants";
import type { PresetBlueprint } from "../dictionaries/presets";
import { EVENT_NOTES, PUBLIC_TEXT_SENTENCES } from "../dictionaries/texts";
import type { VenueBlueprint } from "../dictionaries/venues";
import type { Clock } from "../lib/clock";
import { addDays, daysBetween, monthOf, yearOf } from "../lib/dates";
import { daysOf, occurrencesIn } from "../lib/market-dates";
import type { Rng } from "../lib/rng";
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

/** Throws if a dictionary Zeitplan breaks the rules of @marktwerk/core (a dictionary bug). */
function checkedSchedule(rows: readonly ScheduleRow[], durationDays: number, what: string) {
  const issues = validateSchedule(rows, durationDays);
  if (issues.length > 0) throw new Error(`${what}: invalid Zeitplan ${JSON.stringify(issues)}`);
  return rows.map((row) => ({ ...row }));
}

export function buildEventPresets(
  rng: Rng,
  blueprints: readonly PresetBlueprint[],
  ctx: PresetContext,
): EventPreset[] {
  const typeByKey = new Map(ctx.eventTypes.map((type) => [type.key, type]));
  const venueByKey = new Map<string, Venue>();
  for (const venue of ctx.venues) {
    const blueprint = ctx.venueBlueprintByName.get(venue.name);
    if (blueprint) venueByKey.set(blueprint.key, venue);
  }

  return blueprints.map((blueprint) => {
    const venue = venueByKey.get(blueprint.venueKey);
    const type = typeByKey.get(blueprint.eventType);
    const templateId = ctx.templateIdByTypeKey.get(blueprint.eventType);
    if (!venue || !type || !templateId) {
      throw new Error(`Preset ${blueprint.key} references an unknown venue, type or template`);
    }
    const place = ctx.venueBlueprintByName.get(venue.name)?.publicPlace ?? venue.name;
    const schedule = checkedSchedule(blueprint.schedule, blueprint.durationDays, blueprint.key);
    const opensAt = schedule.find((r) => r.audience === "visitors" && r.kind === "open")?.from;
    const typeSentences = PUBLIC_TEXT_SENTENCES[blueprint.eventType].filter(
      (sentence) =>
        (!sentence.startsWith("Drei Tage") || blueprint.durationDays === 3) &&
        (!sentence.includes("ab 08:00") || opensAt === "08:00"),
    );
    const first = rng.pick(typeSentences);
    const others = typeSentences.filter((sentence) => sentence !== first);
    const sentences = rng.chance(0.5) && others.length > 0 ? [first, rng.pick(others)] : [first];
    sentences.push(`Der Markt findet ${place} statt.`);
    return {
      id: rng.uuid(),
      key: blueprint.key,
      eventTypeId: type.id,
      venueId: venue.id,
      checklistTemplateId: templateId,
      name: blueprint.name,
      publicTitle: blueprint.name,
      publicText: sentences.join(" "),
      pricePerMCents: blueprint.pricePerMCents,
      bookingFeeCents: 250,
      schedule,
      rules: {
        ...structuredClone(type.rules),
        ...structuredClone(blueprint.rules),
      },
      color: blueprint.color,
      rrule: blueprint.rrule,
      durationDays: blueprint.durationDays,
      defaultDuties: { ...ctx.dutyDefaults },
      active: true,
    };
  });
}

export interface ScheduledDate {
  presetKey: string;
  startsOn: string;
  endsOn: string;
}

/**
 * The market dates of one season from the date rules: every market's dates for the year, placed in order (holiday
 * dates first, then the markets in dictionary order). A Sunday date takes its first candidate that keeps the venue
 * free and every day at no more than MAX_EVENTS_PER_DAY markets; a date with no such candidate is dropped (none is,
 * for the years the tests check).
 */
export function scheduleSeason(
  blueprints: readonly PresetBlueprint[],
  year: number,
): ScheduledDate[] {
  const wanted = blueprints.flatMap((blueprint, order) =>
    occurrencesIn(blueprint.dates, year, blueprint.durationDays).map((date) => ({
      blueprint,
      order,
      date,
    })),
  );
  wanted.sort(
    (a, b) =>
      Number(a.date.candidates.length > 1) - Number(b.date.candidates.length > 1) ||
      a.order - b.order,
  );

  const load = new Map<string, number>();
  const venueDays = new Set<string>();
  const placed: ScheduledDate[] = [];
  for (const { blueprint, date } of wanted) {
    const start = date.candidates.find((candidate) =>
      daysOf(candidate, date.days).every(
        (day) =>
          (load.get(day) ?? 0) < MAX_EVENTS_PER_DAY &&
          !venueDays.has(`${blueprint.venueKey}|${day}`),
      ),
    );
    if (start === undefined) continue;
    for (const day of daysOf(start, date.days)) {
      load.set(day, (load.get(day) ?? 0) + 1);
      venueDays.add(`${blueprint.venueKey}|${day}`);
    }
    placed.push({
      presetKey: blueprint.key,
      startsOn: start,
      endsOn: addDays(start, date.days - 1),
    });
  }
  return placed.sort((a, b) =>
    a.startsOn === b.startsOn
      ? a.presetKey.localeCompare(b.presetKey)
      : a.startsOn < b.startsOn
        ? -1
        : 1,
  );
}

/** Lifecycle status from the reference date. Booking flags are separate (see bookingFlags). */
function lifecycleStatus(endsOn: string, season: number, clock: Clock): EventStatus {
  if (endsOn < clock.today) {
    return endsOn < addDays(clock.today, -21) ? "closed" : "completed";
  }
  if (season === clock.season) return "confirmed";
  // New dates go online right away (client decision 2026-10-22): next season's events are planned,
  // whether or not the venue has applied yet; confirmation follows the permits.
  return "planned";
}

const WINTER_MONTHS = [1, 2, 11, 12];

/** Shifts an "HH:mm" time by whole minutes (stays within the day). */
function shiftTime(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The event's Zeitplan: the market's, except on single-day markets in winter, which open an hour later (it is still
 * dark at eight) and give the vendors that hour for setting up.
 */
function eventSchedule(preset: EventPreset, startsOn: string, days: number): ScheduleRow[] {
  const rows = preset.schedule.map((row) => ({ ...row }));
  if (days > 1 || !WINTER_MONTHS.includes(monthOf(startsOn))) return rows;
  const opensAt = rows.find((r) => r.audience === "visitors" && r.kind === "open")?.from;
  return rows.map((row) => {
    if (row.audience === "visitors" && row.kind === "open")
      return { ...row, from: shiftTime(row.from, 60) };
    if (row.audience === "vendors" && row.kind === "setup" && row.to === opensAt)
      return { ...row, to: shiftTime(row.to, 60) };
    return row;
  });
}

export interface EventsBundle {
  events: Event[];
  eventAnchors: EventAnchor[];
}

const ANCHOR_KEY_BY_CORE = {
  event_day: "eventDay",
  setup_day: "setupDay",
  teardown_day: "teardownDay",
  booking_cutoff: "bookingCutoff",
} as const;

export function buildEvents(
  rng: Rng,
  presets: EventPreset[],
  blueprints: readonly PresetBlueprint[],
  ctx: PresetContext,
  clock: Clock,
): EventsBundle {
  const typeById = new Map(ctx.eventTypes.map((type) => [type.id, type]));
  const presetByKey = new Map(presets.map((preset) => [preset.key, preset]));
  const scheduled = [clock.season, clock.nextSeason].flatMap((year) =>
    scheduleSeason(blueprints, year),
  );

  const events: Event[] = [];
  const eventAnchors: EventAnchor[] = [];
  for (const date of scheduled) {
    const preset = presetByKey.get(date.presetKey);
    if (!preset) throw new Error(`No preset ${date.presetKey}`);
    const type = typeById.get(preset.eventTypeId);
    if (!type) throw new Error(`Missing type for preset ${preset.key}`);

    const season = yearOf(date.startsOn);
    const status = lifecycleStatus(date.endsOn, season, clock);
    const durationDays = daysBetween(date.startsOn, date.endsOn) + 1;
    const anchors = defaultAnchors(date.startsOn, durationDays);
    const eventId = rng.uuid();

    // Online booking only where the market allows it, and only until the cut-off in the future.
    const bookingOpen =
      preset.rules.onlineBookingAllowed &&
      status === "confirmed" &&
      anchors.booking_cutoff > clock.today;

    events.push({
      id: eventId,
      presetId: preset.id,
      eventTypeId: type.id,
      venueId: preset.venueId,
      name: preset.name,
      season,
      startsOn: date.startsOn,
      endsOn: date.endsOn,
      schedule: checkedSchedule(
        eventSchedule(preset, date.startsOn, durationDays),
        durationDays,
        `${preset.key} ${date.startsOn}`,
      ),
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
    for (const [coreKey, key] of Object.entries(ANCHOR_KEY_BY_CORE)) {
      const anchorDate = anchors[coreKey as keyof typeof ANCHOR_KEY_BY_CORE];
      eventAnchors.push({ id: rng.uuid(), eventId, key, date: anchorDate });
    }
  }

  return { events: cancelSome(rng, events, typeById, clock), eventAnchors };
}

/**
 * Up to two events of the current season that already took place are cancelled in hindsight (one flea for
 * weather, one antique for a late permit). They keep their place in the calendar but have no bookings,
 * shifts or open tasks. Nothing ahead is cancelled.
 */
function cancelSome(
  rng: Rng,
  events: Event[],
  typeById: Map<string, EventType>,
  clock: Clock,
): Event[] {
  const typeKey = (event: Event): string | undefined => typeById.get(event.eventTypeId)?.key;
  const monthOfEvent = (event: Event): string => event.startsOn.slice(5, 7);
  const fleaCandidates = events.filter(
    (e) =>
      e.season === clock.season &&
      e.endsOn < clock.today &&
      typeKey(e) === "flea" &&
      ["06", "07", "08"].includes(monthOfEvent(e)),
  );
  const antiqueCandidates = events.filter(
    (e) =>
      e.season === clock.season &&
      e.endsOn < clock.today &&
      typeKey(e) === "antique" &&
      e.startsOn === e.endsOn &&
      ["04", "05", "06"].includes(monthOfEvent(e)),
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
