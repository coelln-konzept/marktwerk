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
} from "./generators/catalogue";
import { buildEventPresets, buildEvents } from "./generators/events";
import { buildObligations, buildPayablesAndInstallments, buildVehicles } from "./generators/money";
import {
  buildContacts,
  buildDutyRoles,
  buildStaffAndDuties,
  dutyDefaults,
} from "./generators/people";
import { buildPermitRequirements, buildPermits } from "./generators/permits";
import { buildShifts } from "./generators/shifts";
import { buildChecklistTemplates, buildTasks } from "./generators/tasks";
import { buildVendors } from "./generators/vendors";
import { createRng } from "./lib/rng";
import type { Dataset, EventType } from "./types";

export interface GenerateOptions {
  /** Defaults to SEED. The reference date is fixed and cannot be changed. */
  seed?: number;
}

/**
 * Builds the whole synthetic dataset in memory. Deterministic: the same seed always gives the same output.
 * Generation order is fixed; do not reorder generator calls without expecting the output to change.
 */
export function generateDataset(options: GenerateOptions = {}): Dataset {
  const rng = createRng(options.seed ?? SEED);
  const today = REFERENCE_DATE;

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
    VENUE_BLUEPRINTS.map((blueprint) => [blueprint.name, blueprint]),
  );

  const people = buildStaffAndDuties(rng, buildDutyRoles(rng));
  const duties = dutyDefaults(people.dutyRoles);
  const dutyRoleIdByKey = new Map(people.dutyRoles.map((role) => [role.key, role.id]));
  const staffId = (key: string): string => {
    const id = people.staffIdByKey.get(key);
    if (id === undefined) throw new Error(`Unknown staff key ${key}`);
    return id;
  };

  const checklistTemplates = buildChecklistTemplates(rng, eventTypes);
  const templateIdByTypeKey = new Map(
    checklistTemplates.map((template) => [
      eventTypeKeyById.get(template.eventTypeId) ?? "",
      template.id,
    ]),
  );

  const eventPresets = buildEventPresets(rng, PRESET_BLUEPRINTS, {
    eventTypes,
    venues,
    venueBlueprintByName,
    templateIdByTypeKey,
    dutyDefaults: duties,
  });
  const { events: scheduledEvents, eventAnchors } = buildEvents(rng, eventPresets, {
    eventTypes,
    venues,
    venueBlueprintByName,
    templateIdByTypeKey,
    dutyDefaults: duties,
  });

  const tasks = buildTasks(rng, {
    events: scheduledEvents,
    eventAnchors,
    templates: checklistTemplates,
    dutyRoleIdByKey,
  });

  const permitRequirements = buildPermitRequirements(rng, {
    venues,
    venueBlueprintByName,
    contactIdByKey: contactBundle.idByKey,
  });
  const appliedFor2027ByVenueId = new Map(
    venues.map((venue) => [
      venue.id,
      venueBlueprintByName.get(venue.name)?.permitsApplied2027 ?? false,
    ]),
  );
  const permitBundle = buildPermits(rng, {
    events: scheduledEvents,
    eventTypes,
    requirements: permitRequirements,
    appliedFor2027ByVenueId,
    permitsStaffId: duties.permits,
  });

  const vehicles = buildVehicles(rng);
  const obligations = buildObligations(rng, {
    vehicles,
    logisticsStaffId: staffId("logistics_lead"),
    officeManagerStaffId: staffId("office_manager"),
  });

  const money = buildPayablesAndInstallments(
    rng,
    {
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
    contracts: people.employmentContracts,
    crewStaffIds,
    recordedById: staffId("office_manager"),
    dutyRoleIdByStaffId,
    setupDutyRoleId: dutyRoleIdByKey.get("setup_crew") ?? "",
  });

  const vendors = buildVendors(rng);
  const bookings = buildBookings(rng, { events: scheduledEvents, eventTypes, venues, vendors });
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
