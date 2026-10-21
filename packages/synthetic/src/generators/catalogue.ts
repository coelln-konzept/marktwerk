import { COMPANY_NAME } from "../constants";
import { EVENT_TYPE_BLUEPRINTS } from "../dictionaries/event-types";
import { VENUE_BLUEPRINTS, type VenueBlueprint, ZONE_NAMES } from "../dictionaries/venues";
import type { Rng } from "../lib/rng";
import type { EventType, LegalParameter, Row, Settings, Venue, Zone } from "../types";

export function buildSettings(rng: Rng): Settings {
  return {
    id: rng.uuid(),
    companyName: COMPANY_NAME,
    legalForm: "GmbH",
    street: "Demostraße 7",
    postalCode: "50667",
    city: "Köln",
    country: "DE",
    phoneE164: "+493023125100",
    email: "info@example.com",
    website: "https://www.example.com",
    taxId: "DE999999999",
    iban: "DE02120300000000202051",
    bic: "DEMODEM1XXX",
    timeZone: "Europe/Berlin",
    bundesland: "NW",
    currency: "EUR",
    defaultVatRateBp: 1900,
    defaultDueTime: "09:00",
    reminderPolicy: { overdueEscalationDays: 1, rolloverEscalationAt: 3 },
  };
}

/** Legal numbers as data, with valid-from dates (principle 12 in the data model). */
export function buildLegalParameters(rng: Rng): LegalParameter[] {
  const rows: [string, number, string][] = [
    ["minimum_wage_cents_per_hour", 1390, "2026-01-01"],
    ["minijob_limit_cents_per_month", 60300, "2026-01-01"],
    ["minimum_wage_cents_per_hour", 1460, "2027-01-01"],
    ["minijob_limit_cents_per_month", 63300, "2027-01-01"],
    ["minijob_overrun_ceiling_factor", 2, "2026-01-01"],
    ["minijob_max_overrun_months_12", 2, "2026-01-01"],
    ["hu_interval_months_up_to_3500kg", 24, "2026-01-01"],
    ["hu_interval_months_over_3500kg", 12, "2026-01-01"],
  ];
  return rows.map(([key, value, validFrom]) => ({ id: rng.uuid(), key, value, validFrom }));
}

export function buildEventTypes(rng: Rng): EventType[] {
  return EVENT_TYPE_BLUEPRINTS.map((blueprint) => ({
    id: rng.uuid(),
    key: blueprint.key,
    nameDe: blueprint.nameDe,
    nameEn: blueprint.nameEn,
    colour: blueprint.colour,
    rules: { ...blueprint.rules, bannedGoods: [...blueprint.rules.bannedGoods] },
  }));
}

const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function buildRows(
  rng: Rng,
  zoneId: string,
  rowOffset: number,
  rowCount: number,
  blueprint: VenueBlueprint,
): Row[] {
  return Array.from({ length: rowCount }, (_, index) => {
    const indoor = blueprint.kind === "indoor";
    const carAllowed = !indoor && rng.chance(blueprint.kind === "outdoor_private" ? 0.7 : 0.4);
    return {
      id: rng.uuid(),
      zoneId,
      label: ROW_LETTERS.charAt((rowOffset + index) % ROW_LETTERS.length),
      lengthCm: rng.stepped(2500, 6000, 100),
      depthCm: rng.pickWeighted([
        { value: 200, weight: 3 },
        { value: 250, weight: 2 },
        { value: 300, weight: 1 },
      ]),
      carAllowed,
      carSlots: carAllowed ? rng.int(1, 3) : 0,
      power: rng.chance(0.35),
      water: rng.chance(0.2),
    };
  });
}

/** Twelve venues with 2–5 zones each and 3–5 rows per zone. Capacity is the sum of all row lengths. */
export function buildVenues(rng: Rng, landownerIdByKey: Map<string, string>): Venue[] {
  return VENUE_BLUEPRINTS.map((blueprint) => {
    const venueId = rng.uuid();
    const zoneCount = rng.int(2, 5);
    const zoneNames = rng.shuffle(ZONE_NAMES).slice(0, zoneCount);
    let rowOffset = 0;
    const zones: Zone[] = zoneNames.map((name) => {
      const zoneId = rng.uuid();
      const rowCount = rng.int(3, 5);
      const rows = buildRows(rng, zoneId, rowOffset, rowCount, blueprint);
      rowOffset += rowCount;
      return { id: zoneId, venueId, name, rows };
    });
    const capacityCm = zones.reduce(
      (sum, zone) => sum + zone.rows.reduce((s, row) => s + row.lengthCm, 0),
      0,
    );
    return {
      id: venueId,
      name: blueprint.name,
      kind: blueprint.kind,
      street: blueprint.street,
      postalCode: blueprint.postalCode,
      city: blueprint.city,
      bundesland: "NW",
      lat: blueprint.lat,
      lng: blueprint.lng,
      capacityCm,
      accessInfo: blueprint.accessInfo,
      landownerContactId: blueprint.landownerKey
        ? (landownerIdByKey.get(blueprint.landownerKey) ?? null)
        : null,
      archivedAt: null,
      zones,
    };
  });
}
