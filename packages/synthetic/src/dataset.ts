import { itemPermitType } from "@marktwerk/core";
import { REFERENCE_DATE, SEED } from "./constants";
import { PRESET_BLUEPRINTS } from "./dictionaries/presets";
import { CORE_STAFF_BLUEPRINTS, FIELD_CREW_BLUEPRINTS } from "./dictionaries/staff";
import { VENUE_BLUEPRINTS } from "./dictionaries/venues";
import { buildBookings } from "./generators/bookings";
import {
  buildEventTypes,
  buildLegalParameters,
  buildSettings,
  buildVenues,
  venueName,
} from "./generators/catalogue";
import { buildEventPresets, buildEvents } from "./generators/events";
import { buildObligations, buildPayablesAndInstallments, buildVehicles } from "./generators/money";
import {
  buildContacts,
  buildDutyRoles,
  buildStaffAndDuties,
  dutyDefaults,
  withMarketStewards,
} from "./generators/people";
import { buildPermitRequirements, buildPermits, linkedPermit } from "./generators/permits";
import { buildSeasons } from "./generators/seasons";
import { buildShifts } from "./generators/shifts";
import { buildMarketTemplates, buildMasterTemplate, buildTasks } from "./generators/tasks";
import { buildVendors } from "./generators/vendors";
import { clockFor } from "./lib/clock";
import { createRng } from "./lib/rng";
import type { Dataset, EventType, Permit } from "./types";

export interface GenerateOptions {
  /** Defaults to SEED. */
  seed?: number;
  /**
   * "Today" as `YYYY-MM-DD` for every status and due date, and the base of the two seasons (this year and the
   * next). Defaults to `REFERENCE_DATE` (`SYNTHETIC_REFERENCE_DATE` or the fixed default).
   */
  referenceDate?: string;
}

/**
 * Builds the whole synthetic dataset in memory. Deterministic: the same seed always gives the same output.
 * Generation order is fixed; do not reorder generator calls without expecting the output to change.
 */
export function generateDataset(options: GenerateOptions = {}): Dataset {
  const rng = createRng(options.seed ?? SEED);
  const clock = clockFor(options.referenceDate ?? REFERENCE_DATE);
  const today = clock.today;

  const settings = buildSettings(rng);
  const legalParameters = buildLegalParameters(rng);
  const eventTypes = buildEventTypes(rng);
  const eventTypeKeyById = new Map(eventTypes.map((type: EventType) => [type.id, type.key]));
  const contactBundle = buildContacts(rng);
  const contactId = (key: string): string => {
    const id = contactBundle.idByKey.get(key);
    if (id === undefined) throw new Error(`Unknown contact key ${key}`);
    return id;
  };

  const venues = buildVenues(rng, contactBundle.idByKey);
  const venueBlueprintByName = new Map(
    VENUE_BLUEPRINTS.map((blueprint) => [venueName(blueprint), blueprint]),
  );

  const people = buildStaffAndDuties(rng, buildDutyRoles(rng));
  const duties = dutyDefaults(people.dutyRoles);
  const dutyRoleIdByKey = new Map(people.dutyRoles.map((role) => [role.key, role.id]));
  const staffId = (key: string): string => {
    const id = people.staffIdByKey.get(key);
    if (id === undefined) throw new Error(`Unknown staff key ${key}`);
    return id;
  };

  // The Grundvorlage first; every preset gets its own copy once the presets exist (buildMarketTemplates).
  const masterTemplate = buildMasterTemplate(rng, clock);
  const templateIdByTypeKey = new Map(eventTypes.map((type) => [type.key, masterTemplate.id]));

  // Every market starts from the default duty holders; the Ordner rotates through the Minijob crew per market.
  const minijobStaffIds = FIELD_CREW_BLUEPRINTS.filter((b) => b.contract.type === "minijob").map(
    (b) => staffId(b.key),
  );
  const blueprintPresets = withMarketStewards(
    buildEventPresets(rng, PRESET_BLUEPRINTS, {
      eventTypes,
      venues,
      venueBlueprintByName,
      templateIdByTypeKey,
      dutyDefaults: duties,
    }),
    minijobStaffIds,
  );
  // Events create all four anchors themselves, teardownDay (the last market day) included.
  const { events: scheduledEvents, eventAnchors } = buildEvents(
    rng,
    blueprintPresets,
    PRESET_BLUEPRINTS,
    {
      eventTypes,
      venues,
      venueBlueprintByName,
      templateIdByTypeKey,
      dutyDefaults: duties,
    },
    clock,
  );

  const marketTemplates = buildMarketTemplates(rng, blueprintPresets, eventTypes, clock);
  const checklistTemplates = [masterTemplate, ...marketTemplates.templates];
  const eventPresets = blueprintPresets.map((preset) => ({
    ...preset,
    checklistTemplateId:
      marketTemplates.templateIdByPresetId.get(preset.id) ?? preset.checklistTemplateId,
  }));

  // One Saison record per market and year (research 13 §6), before the season permits and tasks that belong to it.
  const seasons = buildSeasons(rng, eventPresets, scheduledEvents, clock);

  // Permits before tasks: a task that applies for a permit follows it (done once the permit is applied for).
  const permitRequirements = buildPermitRequirements(rng, {
    venues,
    venueBlueprintByName,
    contactIdByKey: contactBundle.idByKey,
    eventTypes,
  });
  const permitBundle = buildPermits(rng, {
    events: scheduledEvents,
    presets: eventPresets,
    eventTypes,
    requirements: permitRequirements,
    venueBlueprintByName,
    venues,
    permitsStaffId: duties.permits,
    seasonIdOf: seasons.seasonIdOf,
    clock,
  });
  const permitById = new Map(permitBundle.permits.map((permit) => [permit.id, permit]));
  const permitLinksByEvent = new Map<string, { permit: Permit; required: boolean }[]>();
  for (const link of permitBundle.eventPermits) {
    const permit = permitById.get(link.permitId);
    if (!permit) continue;
    const links = permitLinksByEvent.get(link.eventId) ?? [];
    links.push({ permit, required: link.required });
    permitLinksByEvent.set(link.eventId, links);
  }

  const seasonPermits = new Map<string, Permit>();
  const seasonPermitTypes = new Map<string, string[]>();
  for (const permit of permitBundle.permits)
    if (permit.seasonId !== null) {
      seasonPermits.set(`${permit.seasonId}|${permit.permitType}`, permit);
      seasonPermitTypes.set(permit.seasonId, [
        ...(seasonPermitTypes.get(permit.seasonId) ?? []),
        permit.permitType,
      ]);
    }

  const tasks = buildTasks(rng, {
    events: scheduledEvents,
    eventAnchors,
    eventSeasons: seasons.eventSeasons,
    eventSeasonAnchors: seasons.eventSeasonAnchors,
    presets: eventPresets,
    templates: checklistTemplates,
    templateIdByPresetId: marketTemplates.templateIdByPresetId,
    dutyRoleIdByKey,
    permitFor: (eventId, permitType) =>
      linkedPermit(permitLinksByEvent.get(eventId) ?? [], permitType),
    // A "Genehmigung" item applies for the owner's OK on private ground (Fahrplan R30), as in the app.
    seasonPermitFor: (seasonId, permitType) =>
      seasonPermits.get(
        `${seasonId}|${itemPermitType(permitType, seasonPermitTypes.get(seasonId) ?? [])}`,
      ),
    clock,
  });

  const vehicles = buildVehicles(rng);
  const obligations = buildObligations(rng, {
    clock,
    vehicles,
    logisticsStaffId: staffId("logistics_lead"),
    officeManagerStaffId: staffId("office_manager"),
  });

  const money = buildPayablesAndInstallments(
    rng,
    {
      clock,
      venues,
      venueBlueprintByName,
      contactIdByKey: contactBundle.idByKey,
      events: scheduledEvents,
      eventTypeKeyById,
      permits: permitBundle.permits,
      requirements: permitRequirements,
      feeCentsByPermitId: permitBundle.feeCentsByPermitId,
      vehicles,
    },
    {
      insuranceId: contactId("versicherung"),
      musicRightsId: contactId("musikrechte"),
      securityId: contactId("sicherheit"),
      dixiId: contactId("dixi"),
      sanitaerId: contactId("sanitaer"),
    },
  );

  const crewStaffIds = [...CORE_STAFF_BLUEPRINTS, ...FIELD_CREW_BLUEPRINTS]
    .filter((blueprint) => blueprint.crew)
    .map((blueprint) => people.staffIdByKey.get(blueprint.key))
    .filter((id): id is string => id !== undefined);
  const dutyRoleIdByStaffId = new Map(
    people.staffMembers.map((member) => [member.id, member.preferredDutyRoleIds[0] ?? ""]),
  );
  const shifts = buildShifts(rng, {
    events: scheduledEvents,
    today,
    season: clock.season,
    contracts: people.employmentContracts,
    crewStaffIds,
    recordedById: staffId("office_manager"),
    dutyRoleIdByStaffId,
    setupDutyRoleId: dutyRoleIdByKey.get("setup_crew") ?? "",
  });

  const vendors = buildVendors(rng);
  const bookings = buildBookings(rng, {
    events: scheduledEvents,
    eventTypes,
    venues,
    vendors,
    clock,
  });
  const events = scheduledEvents.map((event) => {
    const flags = bookings.flagsByEventId.get(event.id);
    return flags
      ? { ...event, fullyBooked: flags.fullyBooked, carSpacesFull: flags.carSpacesFull }
      : event;
  });

  return {
    settings,
    legalParameters,
    eventTypes,
    venues,
    contacts: contactBundle.contacts,
    staffMembers: people.staffMembers,
    employmentContracts: people.employmentContracts,
    dutyRoles: people.dutyRoles,
    eventPresets,
    events,
    eventAnchors,
    eventSeasons: seasons.eventSeasons,
    eventSeasonAnchors: seasons.eventSeasonAnchors,
    checklistTemplates,
    tasks,
    permitRequirements,
    permits: permitBundle.permits,
    eventPermits: permitBundle.eventPermits,
    payables: money.payables,
    installments: money.installments,
    vehicles,
    obligations,
    shifts,
    vendors,
    bookingRequests: bookings.bookingRequests,
    bookingDates: bookings.bookingDates,
  };
}
