import { PERMIT_TYPE_BLUEPRINTS } from "../dictionaries/permits";
import type { VenueBlueprint } from "../dictionaries/venues";
import { type Clock, earlierOf } from "../lib/clock";
import { addDays } from "../lib/dates";
import type { Rng } from "../lib/rng";
import type {
  Event,
  EventPermit,
  EventType,
  Permit,
  PermitCadence,
  PermitCategory,
  PermitRequirement,
  PermitType,
  Venue,
} from "../types";

export interface RequirementContext {
  venues: Venue[];
  venueBlueprintByName: Map<string, VenueBlueprint>;
  contactIdByKey: Map<string, string>;
}

interface RequirementSpec {
  category: PermitCategory;
  permitType: PermitType;
  cadence: PermitCadence;
  leadTimeDays: number;
  fee: [number, number];
  deliverables: { stickers?: number };
  authority: "city" | "water" | "landowner" | "supplier";
}

/** Requirement blueprints per venue, see docs: city permits for all venues, external ones where the ground is not public. */
function specsFor(blueprint: VenueBlueprint): RequirementSpec[] {
  const specs: RequirementSpec[] = [
    {
      category: "city",
      permitType: "market_permit",
      cadence: "per_season",
      leadTimeDays: 120,
      fee: [15000, 45000],
      deliverables: {},
      authority: "city",
    },
    {
      category: "city",
      permitType: "water",
      cadence: "per_season",
      leadTimeDays: 30,
      fee: [18000, 18000],
      deliverables: {},
      authority: "water",
    },
    {
      category: "city",
      permitType: "signage",
      cadence: "per_season",
      leadTimeDays: 45,
      fee: [8000, 12000],
      deliverables: { stickers: 100 },
      authority: "city",
    },
    {
      category: "city",
      permitType: "no_parking",
      cadence: "per_event",
      leadTimeDays: 21,
      fee: [6000, 9000],
      deliverables: {},
      authority: "city",
    },
    {
      category: "external",
      permitType: "toilets",
      cadence: "per_season",
      leadTimeDays: 60,
      fee: [0, 0],
      deliverables: {},
      authority: "supplier",
    },
  ];
  if (blueprint.kind === "private") {
    specs.push({
      category: "external",
      permitType: "landowner_ok",
      cadence: "multi_year",
      leadTimeDays: 90,
      fee: [0, 0],
      deliverables: {},
      authority: "landowner",
    });
  }
  return specs;
}

export function buildPermitRequirements(rng: Rng, ctx: RequirementContext): PermitRequirement[] {
  const requirements: PermitRequirement[] = [];
  for (const venue of ctx.venues) {
    const blueprint = ctx.venueBlueprintByName.get(venue.name);
    if (!blueprint) throw new Error(`No blueprint for venue ${venue.name}`);
    for (const spec of specsFor(blueprint)) {
      const authorityKey =
        spec.authority === "city"
          ? blueprint.cityAuthorityKey
          : spec.authority === "water"
            ? (blueprint.waterAuthorityKey ?? blueprint.cityAuthorityKey)
            : spec.authority === "supplier"
              ? "dixi"
              : (blueprint.landownerKey ?? blueprint.cityAuthorityKey);
      const authorityContactId = ctx.contactIdByKey.get(authorityKey);
      if (!authorityContactId) throw new Error(`Unknown contact ${authorityKey}`);

      const collective = spec.permitType === "market_permit" && blueprint.collectiveApplication;
      requirements.push({
        id: rng.uuid(),
        venueId: venue.id,
        category: spec.category,
        permitType: spec.permitType,
        title: PERMIT_TYPE_BLUEPRINTS[spec.permitType].titleDe,
        authorityContactId,
        cadence: spec.cadence,
        leadTimeDays: spec.leadTimeDays,
        submissionWindowStartMd: collective ? "10-01" : null,
        submissionWindowEndMd: collective ? "11-30" : null,
        expectedDecisionMd: collective ? "01-15" : null,
        typicalFeeCents: rng.stepped(spec.fee[0], spec.fee[1], 500),
        deliverables: spec.deliverables,
        notes: collective
          ? "Sammelantrag: die Stadt nimmt alle Anträge im Herbst gesammelt entgegen."
          : null,
      });
    }
  }
  return requirements;
}

export interface PermitsBundle {
  permits: Permit[];
  eventPermits: EventPermit[];
  /** Permit id → fee in cents, for the payables generator (requirement typical fee). */
  feeCentsByPermitId: Map<string, number>;
}

export interface PermitContext {
  events: Event[];
  eventTypes: EventType[];
  requirements: PermitRequirement[];
  permitsStaffId: string;
  clock: Clock;
}

/** Earliest non-cancelled event date for a venue in a season (used for per-season apply-by dates). */
function firstEventDate(events: Event[], venueId: string, season: number): string | null {
  const dates = events
    .filter((e) => e.venueId === venueId && e.season === season && e.status !== "cancelled")
    .map((e) => e.startsOn)
    .sort();
  return dates[0] ?? null;
}

/** Typical days the authority needs to decide, per permit type. */
const TURNAROUND_DAYS: Record<PermitType, number> = {
  market_permit: 60,
  water: 21,
  signage: 28,
  no_parking: 14,
  toilets: 14,
  landowner_ok: 30,
};

/** A well-run office files this many days before the apply-by date, and starts preparing a month earlier. */
const FILING_BUFFER_DAYS = 45;
const PREPARING_DAYS = 30;
/** Deliberately late permits (apply-by passed, not filed): kept as examples of what "Fehlt" looks like. */
const LATE_EXAMPLES = 2;
/** Only permits whose apply-by passed this recently may become a late example. */
const LATE_WINDOW_DAYS = 30;

interface Decision {
  status: Permit["status"];
  appliedAt: string | null;
  expectedDecisionOn: string | null;
  grantedAt: string | null;
}

/**
 * Where a permit stands today. Per-season and per-event permits follow the office's rhythm: preparing from
 * `apply-by − 75 days`, filed around `apply-by − 45 days` (never later than yesterday), decided after the
 * authority's typical turnaround (spread by a little jitter, so decisions do not pile up on one day). A decision
 * that lies in the past means granted. A permit is never undecided past the first event it covers.
 * Collective applications follow the venue's submission window instead.
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
  const notFiled = (preparing: boolean): Decision => ({
    status: preparing ? "preparing" : "not_started",
    appliedAt: null,
    expectedDecisionOn: null,
    grantedAt: null,
  });
  const filed = (appliedAt: string, decisionOn: string): Decision =>
    decisionOn <= today
      ? { status: "granted", appliedAt, expectedDecisionOn: decisionOn, grantedAt: decisionOn }
      : { status: "applied", appliedAt, expectedDecisionOn: decisionOn, grantedAt: null };

  const startMd = requirement.submissionWindowStartMd;
  const decisionMd = requirement.expectedDecisionMd;
  if (startMd !== null && decisionMd !== null) {
    const windowStart = `${season - 1}-${startMd}`;
    const decisionOn = `${season}-${decisionMd}`;
    if (today < windowStart) return notFiled(today >= addDays(windowStart, -PREPARING_DAYS));
    const appliedAt = addDays(windowStart, rng.int(2, 25));
    if (appliedAt > today) return notFiled(true);
    return filed(appliedAt, decisionOn);
  }

  const target = addDays(applyBy, -FILING_BUFFER_DAYS);
  if (today < target) return notFiled(today >= addDays(target, -PREPARING_DAYS));
  const wished = addDays(target, rng.int(-10, 7));
  const appliedAt = earlierOf(wished, addDays(today, -rng.int(1, 4)));
  let decisionOn = addDays(appliedAt, TURNAROUND_DAYS[requirement.permitType] + rng.int(-5, 10));
  const latest = addDays(eventDate, -2);
  if (decisionOn > latest && latest >= appliedAt) decisionOn = latest;
  return filed(appliedAt, decisionOn);
}

export function buildPermits(rng: Rng, ctx: PermitContext): PermitsBundle {
  const clock = ctx.clock;
  const permits: Permit[] = [];
  const eventPermits: EventPermit[] = [];
  const feeCentsByPermitId = new Map<string, number>();
  /** Permits that may become a late example afterwards: [permit, first event date it covers]. */
  const lateCandidates: [Permit, string][] = [];

  const typeKeyById = new Map(ctx.eventTypes.map((type) => [type.id, type.key]));

  for (const season of [clock.season, clock.nextSeason]) {
    for (const requirement of ctx.requirements) {
      const venueEvents = ctx.events.filter(
        (e) => e.venueId === requirement.venueId && e.season === season && e.status !== "cancelled",
      );
      const isCollective = requirement.submissionWindowEndMd !== null;

      const makePermit = (
        applyBy: string,
        validFrom: string,
        validUntil: string,
        eventOwner: Event | null,
        decision: Decision,
      ): Permit => {
        const stickers = requirement.deliverables.stickers;
        const received =
          stickers !== undefined && decision.status === "granted" ? { stickers } : {};
        const notes = !isCollective
          ? null
          : decision.status === "granted"
            ? `Sammelantrag ${season - 1}/${season} über die Stadt bearbeitet.`
            : decision.status === "applied"
              ? `Antrag ${season} eingereicht, Entscheidung der Stadt im Januar erwartet.`
              : null;
        const permit: Permit = {
          id: rng.uuid(),
          requirementId: requirement.id,
          venueId: requirement.venueId,
          season,
          category: requirement.category,
          permitType: requirement.permitType,
          title: eventOwner ? `${requirement.title} – ${eventOwner.startsOn}` : requirement.title,
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

      if (requirement.cadence === "multi_year") {
        // One landowner OK for years: granted last year, valid for the current and the next season.
        if (season !== clock.season) continue;
        const grantedAt = `${season - 1}-03-01`;
        const permit = makePermit(grantedAt, `${season - 1}-01-01`, `${season + 3}-12-31`, null, {
          status: "granted",
          appliedAt: `${season - 1}-02-01`,
          expectedDecisionOn: null,
          grantedAt,
        });
        const covered = ctx.events.filter(
          (e) => e.venueId === requirement.venueId && e.status !== "cancelled",
        );
        for (const event of covered) {
          eventPermits.push({
            id: rng.uuid(),
            eventId: event.id,
            permitId: permit.id,
            required: true,
          });
        }
        continue;
      }

      if (requirement.cadence === "per_season") {
        const first = firstEventDate(ctx.events, requirement.venueId, season);
        if (first === null) continue;
        const applyBy = isCollective
          ? `${season - 1}-${requirement.submissionWindowEndMd}`
          : addDays(first, -requirement.leadTimeDays);
        const decision = decide(rng, clock, requirement, season, applyBy, first);
        const permit = makePermit(applyBy, `${season}-01-01`, `${season}-12-31`, null, decision);
        if (!isCollective && requirement.permitType !== "market_permit")
          lateCandidates.push([permit, first]);
        for (const event of venueEvents) {
          const required = !(
            requirement.permitType === "toilets" &&
            typeKeyById.get(event.eventTypeId) === "food_wine"
          );
          eventPermits.push({ id: rng.uuid(), eventId: event.id, permitId: permit.id, required });
        }
        continue;
      }

      // per_event: one permit per event (no-parking orders are issued per date).
      for (const event of venueEvents) {
        const applyBy = addDays(event.startsOn, -requirement.leadTimeDays);
        const decision = decide(rng, clock, requirement, season, applyBy, event.startsOn);
        const permit = makePermit(applyBy, event.startsOn, event.endsOn, event, decision);
        lateCandidates.push([permit, event.startsOn]);
        eventPermits.push({
          id: rng.uuid(),
          eventId: event.id,
          permitId: permit.id,
          required: true,
        });
      }
    }
  }

  markLateExamples(rng, clock, lateCandidates);
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
