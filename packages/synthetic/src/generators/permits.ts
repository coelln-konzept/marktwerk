import { itemPermitType } from "@marktwerk/core";
import {
  PERMIT_TYPE_BLUEPRINTS,
  type RequirementSpec,
  type SubmissionWindow,
  VENUE_PERMITS,
} from "../dictionaries/permits";
import type { VenueBlueprint } from "../dictionaries/venues";
import { type Clock, earlierOf, laterOf } from "../lib/clock";
import { addDays } from "../lib/dates";
import type { Rng } from "../lib/rng";
import type {
  Event,
  EventPermit,
  EventPreset,
  EventType,
  Permit,
  PermitRequirement,
  PermitStatus,
  PermitType,
  Venue,
} from "../types";

export interface RequirementContext {
  venues: Venue[];
  venueBlueprintByName: Map<string, VenueBlueprint>;
  contactIdByKey: Map<string, string>;
  eventTypes: EventType[];
}

/** The contact that issues a permit of this spec at this place. */
function authorityKey(spec: RequirementSpec, blueprint: VenueBlueprint): string {
  switch (spec.authority) {
    case "city":
      return blueprint.cityAuthorityKey;
    // Köln's traffic office handles no-parking zones and road closures; elsewhere the Ordnungsamt does.
    case "traffic":
      return blueprint.city === "Köln" ? "strassen_koeln" : blueprint.cityAuthorityKey;
    case "water":
      return blueprint.waterAuthorityKey ?? blueprint.cityAuthorityKey;
    case "landowner":
      if (!blueprint.landownerKey) throw new Error(`${blueprint.key}: landowner OK without owner`);
      return blueprint.landownerKey;
    case "supplier":
      return "dixi";
  }
}

/** Requirement records per place (`VENUE_PERMITS`), see dictionaries/permits.ts. */
export function buildPermitRequirements(rng: Rng, ctx: RequirementContext): PermitRequirement[] {
  const typeIdByKey = new Map(ctx.eventTypes.map((type) => [type.key, type.id]));
  const requirements: PermitRequirement[] = [];
  for (const venue of ctx.venues) {
    const blueprint = ctx.venueBlueprintByName.get(venue.name);
    if (!blueprint) throw new Error(`No blueprint for venue ${venue.name}`);
    const specs = VENUE_PERMITS[blueprint.key];
    if (!specs) throw new Error(`No permits listed for venue ${blueprint.key}`);
    if (blueprint.kind === "private" && specs.some((s) => s.permitType === "market_permit"))
      throw new Error(
        `${blueprint.key}: private ground needs the landowner's OK, not a market permit`,
      );
    for (const spec of specs) {
      const key = authorityKey(spec, blueprint);
      const authorityContactId = ctx.contactIdByKey.get(key);
      if (!authorityContactId) throw new Error(`Unknown contact ${key}`);
      const window = spec.window ?? null;
      requirements.push({
        id: rng.uuid(),
        venueId: venue.id,
        eventTypeId: spec.eventType ? (typeIdByKey.get(spec.eventType) ?? null) : null,
        category: spec.category,
        permitType: spec.permitType,
        title: PERMIT_TYPE_BLUEPRINTS[spec.permitType].titleDe,
        authorityContactId,
        cadence: spec.cadence,
        leadTimeDays: spec.leadTimeDays,
        submissionWindowStartMd: window?.startMd ?? null,
        submissionWindowEndMd: window?.endMd ?? null,
        expectedDecisionMd: window?.decisionMd ?? null,
        typicalFeeCents: rng.stepped(spec.fee[0], spec.fee[1], 500),
        deliverables: spec.stickers !== undefined ? { stickers: spec.stickers } : {},
        notes: [window?.note, spec.notes].filter(Boolean).join(" ") || null,
      });
    }
  }
  return requirements;
}

/** The window of a requirement, looked up again from its spec (for the permit notes). */
function windowOf(
  requirement: PermitRequirement,
  blueprint: VenueBlueprint | undefined,
): SubmissionWindow | null {
  if (requirement.submissionWindowEndMd === null || !blueprint) return null;
  return (
    VENUE_PERMITS[blueprint.key]?.find(
      (spec) => spec.permitType === requirement.permitType && spec.window,
    )?.window ?? null
  );
}

export interface PermitsBundle {
  permits: Permit[];
  eventPermits: EventPermit[];
  /** Permit id → fee in cents, for the payables generator (requirement typical fee). */
  feeCentsByPermitId: Map<string, number>;
}

export interface PermitContext {
  events: Event[];
  presets: EventPreset[];
  eventTypes: EventType[];
  requirements: PermitRequirement[];
  venueBlueprintByName: Map<string, VenueBlueprint>;
  venues: Venue[];
  permitsStaffId: string;
  /** The market's Saison record, which a season permit (one per market and season) belongs to. */
  seasonIdOf: (presetId: string, season: number) => string;
  clock: Clock;
}

/** Typical days the authority needs to decide, per permit type (Marktgenehmigung and Festsetzung: see `decide`). */
const TURNAROUND_DAYS: Record<PermitType, number> = {
  market_permit: 60,
  market_fixing: 60,
  water: 10,
  signage: 21,
  no_parking: 14,
  traffic_order: 21,
  toilets: 14,
  landowner_ok: 30,
  other: 14,
};

/** The office files a few days before the apply-by date (the sheets' deadline) and prepares a month before that. */
const FILING_EARLY_DAYS: readonly [number, number] = [3, 14];
const PREPARING_DAYS = 30;
/** Deliberately late permits (apply-by passed, not filed): kept as examples of what "Fehlt" looks like. */
const LATE_EXAMPLES = 2;
/** Only permits whose apply-by passed this recently may become a late example. */
const LATE_WINDOW_DAYS = 30;
/** Late examples come from permits no template task applies for, so no done task contradicts them. */
const LATE_TYPES: readonly PermitType[] = ["no_parking", "toilets", "traffic_order"];
/** Applied permits whose expected decision has passed without an answer: the authority is late. */
export const DECISION_OVERDUE = 2;
const DECISION_OVERDUE_TYPES: readonly PermitType[] = [
  "market_fixing",
  "traffic_order",
  "landowner_ok",
  "signage",
];

interface Decision {
  status: Permit["status"];
  appliedAt: string | null;
  expectedDecisionOn: string | null;
  grantedAt: string | null;
}

function notFiled(preparing: boolean): Decision {
  return {
    status: preparing ? "preparing" : "not_started",
    appliedAt: null,
    expectedDecisionOn: null,
    grantedAt: null,
  };
}

function filed(today: string, appliedAt: string, decisionOn: string): Decision {
  return decisionOn <= today
    ? { status: "granted", appliedAt, expectedDecisionOn: decisionOn, grantedAt: decisionOn }
    : { status: "applied", appliedAt, expectedDecisionOn: decisionOn, grantedAt: null };
}

/**
 * Where a permit stands today. The office prepares from a month before filing and files a few days before the
 * apply-by date (never later than yesterday). The authority decides after its typical turnaround; the city decides
 * a Marktgenehmigung or Festsetzung some weeks before the first date it covers. A decision in the past means granted,
 * and no permit is undecided past the first date it covers. Windowed applications (Altstadt, Stadion) are filed
 * early in the window and decided on the window's decision day.
 */
function decide(
  rng: Rng,
  clock: Clock,
  requirement: PermitRequirement,
  season: number,
  applyBy: string,
  eventDate: string,
): Decision {
  const today = clock.today;
  const startMd = requirement.submissionWindowStartMd;
  const decisionMd = requirement.expectedDecisionMd;
  if (startMd !== null && decisionMd !== null) {
    const windowStart = `${season - 1}-${startMd}`;
    if (today < windowStart) return notFiled(today >= addDays(windowStart, -PREPARING_DAYS));
    const appliedAt = addDays(windowStart, rng.int(2, 18));
    if (appliedAt >= today) return notFiled(true);
    const decisionMonthDay = `${season - 1}-${decisionMd}`;
    // a December decision is the year before the season, a January one in the season itself
    const decisionOn = decisionMonthDay > appliedAt ? decisionMonthDay : `${season}-${decisionMd}`;
    return filed(today, appliedAt, decisionOn);
  }

  const target = addDays(applyBy, -rng.int(FILING_EARLY_DAYS[0], FILING_EARLY_DAYS[1]));
  if (today <= target) return notFiled(today >= addDays(target, -PREPARING_DAYS));
  const appliedAt = earlierOf(target, addDays(today, -rng.int(1, 4)));
  let decisionOn =
    requirement.permitType === "market_permit" || requirement.permitType === "market_fixing"
      ? laterOf(addDays(appliedAt, 30), addDays(eventDate, -rng.int(35, 75)))
      : addDays(appliedAt, TURNAROUND_DAYS[requirement.permitType] + rng.int(-3, 7));
  const latest = addDays(eventDate, -2);
  if (decisionOn > latest && latest >= appliedAt) decisionOn = latest;
  return filed(today, appliedAt, decisionOn);
}

/**
 * The Festsetzung goes in with the Marktgenehmigung ("Antrag stellen, Festsetzung") and comes back one to three
 * weeks after it.
 */
function decideWithMarketPermit(
  rng: Rng,
  clock: Clock,
  marketPermit: Permit,
  eventDate: string,
): Decision {
  if (marketPermit.appliedAt === null || marketPermit.expectedDecisionOn === null)
    return notFiled(marketPermit.status === "preparing");
  let decisionOn = addDays(marketPermit.expectedDecisionOn, rng.int(7, 21));
  const latest = addDays(eventDate, -2);
  if (decisionOn > latest) decisionOn = laterOf(latest, marketPermit.expectedDecisionOn);
  return filed(clock.today, marketPermit.appliedAt, decisionOn);
}

/** Events grouped by market (preset), in the order of their first date. */
function byMarket(events: readonly Event[]): Event[][] {
  const groups = new Map<string, Event[]>();
  for (const event of [...events].sort((a, b) => a.startsOn.localeCompare(b.startsOn)))
    groups.set(event.presetId, [...(groups.get(event.presetId) ?? []), event]);
  return [...groups.values()];
}

export function buildPermits(rng: Rng, ctx: PermitContext): PermitsBundle {
  const clock = ctx.clock;
  const permits: Permit[] = [];
  const eventPermits: EventPermit[] = [];
  const feeCentsByPermitId = new Map<string, number>();
  /** Permits that may become a late example afterwards: [permit, first event date it covers]. */
  const lateCandidates: [Permit, string][] = [];
  /** Filed permits whose decision may turn overdue afterwards: [permit, first event date it covers]. */
  const decisionCandidates: [Permit, string][] = [];
  /** The Marktgenehmigung of each market and season, for its Festsetzung. */
  const marketPermitBy = new Map<string, Permit>();

  const typeKeyById = new Map(ctx.eventTypes.map((type) => [type.id, type.key]));
  const presetNameById = new Map(ctx.presets.map((preset) => [preset.id, preset.name]));
  const blueprintByVenueId = new Map(
    ctx.venues.map((venue) => [venue.id, ctx.venueBlueprintByName.get(venue.name)]),
  );

  for (const season of [clock.season, clock.nextSeason]) {
    for (const requirement of ctx.requirements) {
      const applies = (e: Event) =>
        e.venueId === requirement.venueId &&
        (requirement.eventTypeId === null || e.eventTypeId === requirement.eventTypeId);
      const venueEvents = ctx.events.filter(
        (e) => applies(e) && e.season === season && e.status !== "cancelled",
      );
      // Several markets at one place (Rodenkirchen, Kerpen, Stadion + P6): season permits carry the market's name.
      const sharedPlace =
        new Set(ctx.presets.filter((p) => p.venueId === requirement.venueId).map((p) => p.id))
          .size > 1;
      const window = windowOf(requirement, blueprintByVenueId.get(requirement.venueId));

      const makePermit = (
        title: string,
        applyBy: string,
        validFrom: string,
        validUntil: string,
        decision: Decision,
        seasonId: string | null = null,
      ): Permit => {
        const stickers = requirement.deliverables.stickers;
        const received =
          stickers !== undefined && decision.status === "granted" ? { stickers } : {};
        const notes = !window
          ? null
          : decision.status === "granted"
            ? window.grantedNote
            : decision.status === "applied"
              ? window.appliedNote
              : null;
        const permit: Permit = {
          id: rng.uuid(),
          requirementId: requirement.id,
          venueId: requirement.venueId,
          season,
          seasonId,
          category: requirement.category,
          permitType: requirement.permitType,
          title,
          authorityContactId: requirement.authorityContactId,
          referenceNo: `OA-${season}-${String(rng.int(1000, 9999))}`,
          status: decision.status,
          applyBy,
          appliedAt: decision.appliedAt,
          expectedDecisionOn: decision.expectedDecisionOn,
          grantedAt: decision.grantedAt,
          validFrom,
          validUntil,
          conditions: [...PERMIT_TYPE_BLUEPRINTS[requirement.permitType].conditions],
          deliverablesReceived: received,
          responsibleStaffMemberId: ctx.permitsStaffId,
          notes,
        };
        feeCentsByPermitId.set(permit.id, requirement.typicalFeeCents);
        permits.push(permit);
        return permit;
      };
      const link = (permit: Permit, event: Event) => {
        const required = !(
          requirement.permitType === "toilets" && typeKeyById.get(event.eventTypeId) === "food_wine"
        );
        eventPermits.push({ id: rng.uuid(), eventId: event.id, permitId: permit.id, required });
      };

      if (requirement.cadence === "per_season") {
        // One permit per market and season, from the market's first date.
        for (const marketEvents of byMarket(venueEvents)) {
          const [first] = marketEvents;
          if (!first) continue;
          const applyBy = window
            ? `${season - 1}-${window.endMd}`
            : addDays(first.startsOn, -requirement.leadTimeDays);
          const marketPermit = marketPermitBy.get(`${first.presetId}|${season}`);
          const decision =
            requirement.permitType === "market_fixing" && marketPermit
              ? decideWithMarketPermit(rng, clock, marketPermit, first.startsOn)
              : decide(rng, clock, requirement, season, applyBy, first.startsOn);
          const marketName = presetNameById.get(first.presetId) ?? first.name;
          const title = sharedPlace ? `${requirement.title} – ${marketName}` : requirement.title;
          const permit = makePermit(
            title,
            applyBy,
            `${season}-01-01`,
            `${season}-12-31`,
            decision,
            ctx.seasonIdOf(first.presetId, season),
          );
          if (requirement.permitType === "market_permit")
            marketPermitBy.set(`${first.presetId}|${season}`, permit);
          if (!window && LATE_TYPES.includes(requirement.permitType))
            lateCandidates.push([permit, first.startsOn]);
          if (!window && DECISION_OVERDUE_TYPES.includes(requirement.permitType))
            decisionCandidates.push([permit, first.startsOn]);
          for (const event of marketEvents) link(permit, event);
        }
        continue;
      }

      // per_event: one permit per date (PVBT, Standrohr, Schaustellerliste).
      for (const event of venueEvents) {
        const applyBy = addDays(event.startsOn, -requirement.leadTimeDays);
        const decision = decide(rng, clock, requirement, season, applyBy, event.startsOn);
        const title = `${requirement.title} – ${event.startsOn}`;
        const permit = makePermit(title, applyBy, event.startsOn, event.endsOn, decision);
        if (LATE_TYPES.includes(requirement.permitType))
          lateCandidates.push([permit, event.startsOn]);
        link(permit, event);
      }
    }
  }

  markLateExamples(rng, clock, lateCandidates);
  markOverdueDecisions(rng, clock, decisionCandidates);
  return { permits, eventPermits, feeCentsByPermitId };
}

/**
 * Turns up to `LATE_EXAMPLES` permits whose apply-by passed a few days ago back into "not filed": the first
 * stays `not_started` (shows as Fehlt), the second `preparing`. They are the deliberate exceptions in an
 * otherwise well-run office; only permits of markets still ahead qualify.
 */
function markLateExamples(rng: Rng, clock: Clock, candidates: [Permit, string][]): void {
  const windowStart = addDays(clock.today, -LATE_WINDOW_DAYS);
  const eligible = candidates.filter(
    ([permit, eventDate]) =>
      permit.applyBy < clock.today &&
      permit.applyBy >= windowStart &&
      eventDate > addDays(clock.today, 14),
  );
  const picked = rng.shuffle(eligible).slice(0, LATE_EXAMPLES);
  picked.forEach(([permit], index) => {
    permit.status = index === 0 ? "not_started" : "preparing";
    permit.appliedAt = null;
    permit.expectedDecisionOn = null;
    permit.grantedAt = null;
    permit.deliverablesReceived = {};
    permit.notes = "Antrag noch nicht gestellt, die Frist ist überschritten.";
  });
}

/**
 * The authority is late on `DECISION_OVERDUE` applications: filed weeks ago, the expected decision passed a few days
 * ago, no answer yet, and the market is still well ahead (a Festsetzung, a road closure, a landowner's OK, a poster
 * permit). One per place.
 */
function markOverdueDecisions(rng: Rng, clock: Clock, candidates: [Permit, string][]): void {
  const eligible = candidates.filter(
    ([permit, eventDate]) =>
      permit.status === "applied" &&
      permit.appliedAt !== null &&
      permit.appliedAt <= addDays(clock.today, -21) &&
      eventDate > addDays(clock.today, 30),
  );
  const venues = new Set<string>();
  let marked = 0;
  for (const [permit] of rng.shuffle(eligible)) {
    if (marked >= DECISION_OVERDUE || venues.has(permit.venueId)) continue;
    venues.add(permit.venueId);
    marked += 1;
    const expected = addDays(clock.today, -rng.int(2, 9));
    permit.expectedDecisionOn = expected;
    const ask = permit.permitType === "landowner_ok" ? "beim Eigentümer" : "beim Amt";
    permit.notes = `Entscheidung war für den ${germanDate(expected)} erwartet und ist noch nicht da – ${ask} nachfragen.`;
  }
}

function germanDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

/** Order of preference when several permits of one type cover an event (as `linkPermitTasks` in the app). */
const LINK_STATUS_ORDER: readonly PermitStatus[] = [
  "granted",
  "applied",
  "preparing",
  "not_started",
  "rejected",
  "not_required",
];

/**
 * The permit a template task of `permitType` is linked to on its event: the seed's and the app's
 * `linkPermitTasks` rule (required links first, then the permit that is furthest along). A "Genehmigung" item
 * (market_permit) applies for the owner's OK on private ground (Fahrplan R30, core `itemPermitType`).
 */
export function linkedPermit(
  candidates: readonly { permit: Permit; required: boolean }[],
  permitType: string,
): Permit | undefined {
  const rank = ({ permit, required }: { permit: Permit; required: boolean }) =>
    (required && permit.status !== "not_required" ? 0 : 100) +
    LINK_STATUS_ORDER.indexOf(permit.status);
  const type = itemPermitType(
    permitType,
    candidates.map((c) => c.permit.permitType),
  );
  return [...candidates]
    .filter((c) => c.permit.permitType === type)
    .sort((a, b) => rank(a) - rank(b))[0]?.permit;
}

/** Applied or granted: the application is in, so the task that applies for it is done (`permitCoversApplication`). */
export function permitIsFiled(permit: Permit | undefined): boolean {
  return permit?.status === "applied" || permit?.status === "granted";
}
