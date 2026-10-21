import { REFERENCE_DATE, SEASONS } from "../constants";
import { PERMIT_TYPE_BLUEPRINTS } from "../dictionaries/permits";
import type { VenueBlueprint } from "../dictionaries/venues";
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
  PermitStatus,
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
  if (blueprint.kind !== "outdoor_public") {
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
  if (blueprint.kind === "indoor") {
    // Indoor halls have no street no-parking zones.
    return specs.filter((spec) => spec.permitType !== "no_parking");
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
  /** Venue id → whether the market permit for the 2027 season is already applied for. */
  appliedFor2027ByVenueId: Map<string, boolean>;
  permitsStaffId: string;
}

/** Earliest non-cancelled event date for a venue in a season (used for per-season apply-by dates). */
function firstEventDate(events: Event[], venueId: string, season: number): string | null {
  const dates = events
    .filter((e) => e.venueId === venueId && e.season === season && e.status !== "cancelled")
    .map((e) => e.startsOn)
    .sort();
  return dates[0] ?? null;
}

function permitStatus(
  applyBy: string,
  season: number,
  appliedFor2027: boolean,
): {
  status: PermitStatus;
  appliedAt: string | null;
  expectedDecisionOn: string | null;
  grantedAt: string | null;
} {
  if (season === SEASONS[0]) {
    return {
      status: "granted",
      appliedAt: addDays(applyBy, -10),
      expectedDecisionOn: addDays(applyBy, 20),
      grantedAt: addDays(applyBy, 20),
    };
  }
  if (appliedFor2027) {
    const appliedAt = addDays(REFERENCE_DATE, -20);
    return {
      status: "applied",
      appliedAt,
      expectedDecisionOn: addDays(appliedAt, 60),
      grantedAt: null,
    };
  }
  const preparing = applyBy <= addDays(REFERENCE_DATE, 60);
  return {
    status: preparing ? "preparing" : "not_started",
    appliedAt: null,
    expectedDecisionOn: null,
    grantedAt: null,
  };
}

export function buildPermits(rng: Rng, ctx: PermitContext): PermitsBundle {
  const permits: Permit[] = [];
  const eventPermits: EventPermit[] = [];
  const feeCentsByPermitId = new Map<string, number>();

  const typeKeyById = new Map(ctx.eventTypes.map((type) => [type.id, type.key]));

  for (const season of SEASONS) {
    for (const requirement of ctx.requirements) {
      const venueEvents = ctx.events.filter(
        (e) => e.venueId === requirement.venueId && e.season === season && e.status !== "cancelled",
      );
      const appliedFor2027 = ctx.appliedFor2027ByVenueId.get(requirement.venueId) ?? false;
      const isCollective = requirement.submissionWindowEndMd !== null;

      const makePermit = (
        applyBy: string,
        validFrom: string,
        validUntil: string,
        eventOwner: Event | null,
      ): Permit => {
        const decision = permitStatus(applyBy, season, appliedFor2027);
        const stickers = requirement.deliverables.stickers;
        const received = stickers !== undefined && season === SEASONS[0] ? { stickers } : {};
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
          notes:
            isCollective && season === SEASONS[0]
              ? "Sammelantrag 2025/26 über die Stadt bearbeitet."
              : null,
        };
        feeCentsByPermitId.set(permit.id, requirement.typicalFeeCents);
        permits.push(permit);
        return permit;
      };

      if (requirement.cadence === "multi_year") {
        if (season !== SEASONS[0]) continue;
        const permit = makePermit("2025-03-01", "2025-01-01", "2029-12-31", null);
        permit.status = "granted";
        permit.grantedAt = "2025-03-01";
        permit.appliedAt = "2025-02-01";
        permit.expectedDecisionOn = null;
        for (const event of venueEvents) {
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
          ? `${season - 1}-11-30`
          : addDays(first, -requirement.leadTimeDays);
        const permit = makePermit(applyBy, `${season}-01-01`, `${season}-12-31`, null);
        if (isCollective && season === SEASONS[0]) {
          // Altstadt 2026: applied in November 2025, granted in January 2026.
          permit.appliedAt = "2025-11-20";
          permit.expectedDecisionOn = "2026-01-15";
          permit.grantedAt = "2026-01-15";
        }
        if (isCollective && season !== SEASONS[0]) {
          // Altstadt: applied in the autumn window, decision expected in January.
          permit.status = "applied";
          permit.appliedAt = "2026-10-05";
          permit.expectedDecisionOn = "2027-01-15";
          permit.notes = "Antrag 2027 eingereicht, Entscheidung der Stadt im Januar erwartet.";
        }
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
        const validFrom = event.startsOn;
        const validUntil = event.endsOn;
        const permit = makePermit(applyBy, validFrom, validUntil, event);
        eventPermits.push({
          id: rng.uuid(),
          eventId: event.id,
          permitId: permit.id,
          required: true,
        });
      }
    }
  }
  return { permits, eventPermits, feeCentsByPermitId };
}
