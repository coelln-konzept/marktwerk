import { REFERENCE_DATE } from "../constants";
import type { VenueBlueprint } from "../dictionaries/venues";
import { addDays, addMonths } from "../lib/dates";
import type { Rng } from "../lib/rng";
import type {
  Event,
  Installment,
  InstallmentStatus,
  Obligation,
  Payable,
  PayableCategory,
  PayableScope,
  Permit,
  PermitRequirement,
  Vehicle,
  Venue,
} from "../types";

const VIN_ALPHABET = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";

function vin(rng: Rng): string {
  return Array.from({ length: 17 }, () =>
    VIN_ALPHABET.charAt(rng.int(0, VIN_ALPHABET.length - 1)),
  ).join("");
}

export function buildVehicles(rng: Rng): Vehicle[] {
  const specs: {
    name: string;
    plate: string;
    make: string;
    model: string;
    registered: string;
    gross: number;
  }[] = [
    {
      name: "Transporter 1",
      plate: "K-MW 1001",
      make: "Ford",
      model: "Transit Custom L2",
      registered: "2021-03-15",
      gross: 3500,
    },
    {
      name: "Transporter 2",
      plate: "K-MW 1002",
      make: "Mercedes-Benz",
      model: "Sprinter 316 CDI",
      registered: "2019-09-01",
      gross: 3880,
    },
    {
      name: "Transporter 3",
      plate: "K-MW 1003",
      make: "VW",
      model: "Crafter 35",
      registered: "2022-06-10",
      gross: 3500,
    },
  ];
  return specs.map((spec) => ({
    id: rng.uuid(),
    name: spec.name,
    plate: spec.plate,
    make: spec.make,
    model: spec.model,
    vin: vin(rng),
    firstRegistrationOn: spec.registered,
    grossWeightKg: spec.gross,
    odometerKm: rng.stepped(98000, 180000, 500),
    insurer: "Gewerbeversicherung Rheinland Makler",
    policyNumber: `KFZ-${rng.int(100000, 999999)}`,
    notes: null,
  }));
}

export interface ObligationContext {
  vehicles: Vehicle[];
  logisticsStaffId: string;
  officeManagerStaffId: string;
}

export function buildObligations(rng: Rng, ctx: ObligationContext): Obligation[] {
  const [v1, v2, v3] = ctx.vehicles;
  if (!v1 || !v2 || !v3) throw new Error("Expected three vehicles");
  const vehicles = [v1, v2, v3];
  const obligations: Obligation[] = [];
  const add = (o: Omit<Obligation, "id">): void => {
    obligations.push({ id: rng.uuid(), ...o });
  };

  // HU: 24 months up to 3.5 t, 12 months above (see legal_parameter rows).
  const huLast = ["2025-02-10", "2026-03-20", "2025-06-01"];
  vehicles.forEach((vehicle, index) => {
    const last = huLast[index] ?? "2025-01-01";
    const months = vehicle.grossWeightKg > 3500 ? 12 : 24;
    add({
      title: `HU / TÜV – ${vehicle.name}`,
      scope: "vehicle",
      vehicleId: vehicle.id,
      venueId: null,
      intervalMonths: months,
      intervalKm: null,
      nextDueOn: addMonths(last, months),
      nextDueKm: null,
      leadDays: 30,
      responsibleStaffMemberId: ctx.logisticsStaffId,
      createsPayable: false,
      lastDoneOn: last,
    });
  });

  // UVV (DGUV Vorschrift 70) yearly. Transporter 2 is deliberately overdue.
  const uvvLast = ["2025-11-05", "2025-09-30", "2025-12-01"];
  vehicles.forEach((vehicle, index) => {
    const last = uvvLast[index] ?? "2025-01-01";
    add({
      title: `UVV-Prüfung (DGUV Vorschrift 70) – ${vehicle.name}`,
      scope: "vehicle",
      vehicleId: vehicle.id,
      venueId: null,
      intervalMonths: 12,
      intervalKm: null,
      nextDueOn: addMonths(last, 12),
      nextDueKm: null,
      leadDays: 14,
      responsibleStaffMemberId: ctx.logisticsStaffId,
      createsPayable: false,
      lastDoneOn: last,
    });
  });

  // Service: yearly or every 30,000 km, whichever comes first.
  vehicles.forEach((vehicle) => {
    add({
      title: `Inspektion – ${vehicle.name}`,
      scope: "vehicle",
      vehicleId: vehicle.id,
      venueId: null,
      intervalMonths: 12,
      intervalKm: 30000,
      nextDueOn: "2026-12-15",
      nextDueKm: vehicle.odometerKm + 8000,
      leadDays: 21,
      responsibleStaffMemberId: ctx.logisticsStaffId,
      createsPayable: true,
      lastDoneOn: "2025-12-15",
    });
  });

  add({
    title: "Kfz-Versicherung (Verlängerung)",
    scope: "company",
    vehicleId: null,
    venueId: null,
    intervalMonths: 12,
    intervalKm: null,
    nextDueOn: "2027-01-01",
    nextDueKm: null,
    leadDays: 60,
    responsibleStaffMemberId: ctx.officeManagerStaffId,
    createsPayable: true,
    lastDoneOn: "2026-01-01",
  });

  add({
    title: "KSK-Jahresmeldung",
    scope: "company",
    vehicleId: null,
    venueId: null,
    intervalMonths: 12,
    intervalKm: null,
    nextDueOn: "2027-03-31",
    nextDueKm: null,
    leadDays: 30,
    responsibleStaffMemberId: ctx.officeManagerStaffId,
    createsPayable: false,
    lastDoneOn: "2026-03-31",
  });

  return obligations;
}

/* ------------------------------------------------------------------------------------------------
 * Payables and instalments
 * --------------------------------------------------------------------------------------------- */

export interface Schedule {
  dueOn: string;
  /** Share of the total in percent. The last instalment absorbs rounding so the sum is exact. */
  share: number;
  paid?: "full" | "half";
}

/** Installment rows for one payable. `paid` decides the status; unpaid rows are open. */
function buildInstallments(
  rng: Rng,
  payableId: string,
  totalCents: number,
  schedule: Schedule[],
  reference: string,
): Installment[] {
  const amounts: number[] = [];
  let remaining = totalCents;
  schedule.forEach((row, index) => {
    const amount =
      index === schedule.length - 1
        ? remaining
        : Math.round((totalCents * row.share) / 100 / 100) * 100;
    amounts.push(amount);
    remaining -= amount;
  });

  return schedule.map((row, index): Installment => {
    const amount = amounts[index] ?? 0;
    // Unpaid rows stay open; if their due date has passed, the payable status turns overdue.
    let status: InstallmentStatus = "open";
    let paidOn: string | null = null;
    let paidAmountCents: number | null = null;
    if (row.paid === "full") {
      status = "paid";
      paidOn = addDays(row.dueOn, -rng.int(0, 5));
      paidAmountCents = amount;
    } else if (row.paid === "half") {
      status = "partially_paid";
      paidOn = addDays(row.dueOn, 1);
      paidAmountCents = Math.round(amount / 2 / 100) * 100;
    }
    return {
      id: rng.uuid(),
      payableId,
      sort: index + 1,
      dueOn: row.dueOn,
      amountCents: amount,
      status,
      paidOn,
      paidAmountCents,
      method: status === "open" ? null : "bank_transfer",
      reference: `${reference}-${index + 1}`,
    };
  });
}

interface PayableDraft {
  title: string;
  scope: PayableScope;
  eventId: string | null;
  venueId: string | null;
  season: number | null;
  vehicleId: string | null;
  permitId: string | null;
  counterpartyContactId: string | null;
  category: PayableCategory;
  totalGrossCents: number;
  critical: boolean;
  notes: string | null;
  schedule: Schedule[];
}

/** Derived status: all paid → paid; unpaid and past due → overdue; some paid → partially_paid; else open. */
function payableStatus(installments: Installment[]): Payable["status"] {
  if (installments.every((i) => i.status === "paid")) return "paid";
  if (installments.some((i) => i.status !== "paid" && i.dueOn < REFERENCE_DATE)) return "overdue";
  if (installments.some((i) => i.status === "paid" || i.status === "partially_paid"))
    return "partially_paid";
  return "open";
}

export interface MoneyContext {
  venues: Venue[];
  venueBlueprintByName: Map<string, VenueBlueprint>;
  contactIdByKey: Map<string, string>;
  events: Event[];
  eventTypeKeyById: Map<string, string>;
  permits: Permit[];
  requirements: PermitRequirement[];
  feeCentsByPermitId: Map<string, number>;
  vehicles: Vehicle[];
}

export interface MoneyBundle {
  payables: Payable[];
  installments: Installment[];
}

function venueSchedule(venueKey: string, index: number, season: number): Schedule[] {
  if (season !== 2026) {
    return index % 2 === 0
      ? [
          { dueOn: "2027-02-28", share: 40 },
          { dueOn: "2027-06-30", share: 40 },
          { dueOn: "2027-10-31", share: 20 },
        ]
      : [{ dueOn: "2027-03-31", share: 100 }];
  }
  // Deliberate overdue cases (2 location fees) and due-soon instalments (due in the next 14 days).
  if (venueKey === "heumarkt") {
    return [
      { dueOn: "2026-02-28", share: 40, paid: "full" },
      { dueOn: "2026-06-30", share: 40, paid: "full" },
      { dueOn: "2026-09-30", share: 20 },
    ];
  }
  if (venueKey === "bonn") {
    return [
      { dueOn: "2026-02-28", share: 40, paid: "full" },
      { dueOn: "2026-06-30", share: 40, paid: "full" },
      { dueOn: "2026-09-30", share: 20, paid: "half" },
    ];
  }
  if (index % 2 === 0) {
    return [
      { dueOn: "2026-02-28", share: 40, paid: "full" },
      { dueOn: "2026-06-30", share: 40, paid: "full" },
      { dueOn: "2026-10-31", share: 20 },
    ];
  }
  return [{ dueOn: "2026-03-31", share: 100, paid: "full" }];
}

export function buildPayablesAndInstallments(
  rng: Rng,
  ctx: MoneyContext,
  ids: {
    insuranceId: string;
    musicRightsId: string;
    securityId: string;
    dixiId: string;
    sanitaerId: string;
  },
): MoneyBundle {
  const drafts: PayableDraft[] = [];
  const blank = {
    eventId: null,
    venueId: null,
    season: null,
    vehicleId: null,
    permitId: null,
    notes: null,
    critical: false,
  };

  // Location fees per venue and season. Counterparty: the landowner, or the city for public ground.
  ctx.venues.forEach((venue, index) => {
    const blueprint = ctx.venueBlueprintByName.get(venue.name);
    if (!blueprint) throw new Error(`No blueprint for ${venue.name}`);
    for (const season of [2026, 2027]) {
      const counterpartyKey = blueprint.landownerKey ?? blueprint.cityAuthorityKey;
      drafts.push({
        ...blank,
        title: `Standgebühr / Platzmiete ${venue.name} ${season}`,
        scope: "company",
        venueId: venue.id,
        season,
        counterpartyContactId: ctx.contactIdByKey.get(counterpartyKey) ?? null,
        category: "location",
        totalGrossCents: rng.stepped(800000, 2500000, 10000),
        critical: true,
        schedule: venueSchedule(blueprint.key, index, season),
      });
    }
  });

  // Market permit fees (permits are payables too).
  for (const permit of ctx.permits) {
    if (permit.permitType !== "market_permit") continue;
    const fee = ctx.feeCentsByPermitId.get(permit.id) ?? 0;
    const due =
      permit.season === 2026
        ? addDays(permit.grantedAt ?? "2026-01-15", 14)
        : `${permit.season}-03-31`;
    drafts.push({
      ...blank,
      title: `Genehmigungsgebühr ${permit.title} ${permit.season}`,
      scope: "company",
      venueId: permit.venueId,
      season: permit.season,
      permitId: permit.id,
      counterpartyContactId: permit.authorityContactId,
      category: "permit",
      totalGrossCents: fee,
      critical: true,
      schedule: [
        { dueOn: due, share: 100, ...(permit.season === 2026 ? { paid: "full" as const } : {}) },
      ],
    });
  }

  // Toilet framework contracts (one per venue and season). Ehrenfeld's 2026 invoice is overdue.
  ctx.venues.forEach((venue, index) => {
    for (const season of [2026, 2027]) {
      const overdue = season === 2026 && venue.name.startsWith("Köln-Ehrenfeld");
      const schedule: Schedule[] = overdue
        ? [{ dueOn: "2026-10-01", share: 100 }]
        : season === 2026
          ? [{ dueOn: "2026-03-31", share: 100, paid: "full" }]
          : [{ dueOn: "2027-03-31", share: 100 }];
      drafts.push({
        ...blank,
        title: `Toilettenrahmenvertrag ${venue.name} ${season}`,
        scope: "company",
        venueId: venue.id,
        season,
        counterpartyContactId: index % 2 === 0 ? ids.dixiId : ids.sanitaerId,
        category: "toilets",
        totalGrossCents: rng.stepped(40000, 120000, 1000),
        critical: false,
        schedule,
      });
    }
  });

  // Standpipe rentals where a utility supplies standpipes.
  ctx.venues.forEach((venue) => {
    const blueprint = ctx.venueBlueprintByName.get(venue.name);
    if (!blueprint?.waterAuthorityKey) return;
    const counterpartyId = ctx.contactIdByKey.get(blueprint.waterAuthorityKey);
    for (const season of [2026, 2027]) {
      drafts.push({
        ...blank,
        title: `Standrohr-Miete ${venue.name} ${season}`,
        scope: "company",
        venueId: venue.id,
        season,
        counterpartyContactId: counterpartyId ?? null,
        category: "water_power",
        totalGrossCents: 18000,
        critical: false,
        schedule:
          season === 2026
            ? [{ dueOn: "2026-04-30", share: 100, paid: "full" }]
            : [{ dueOn: "2027-04-30", share: 100 }],
      });
    }
  });

  // Vehicle insurance, paid once per year.
  ctx.vehicles.forEach((vehicle) => {
    drafts.push({
      ...blank,
      title: `Kfz-Versicherung 2026 – ${vehicle.name}`,
      scope: "vehicle",
      vehicleId: vehicle.id,
      counterpartyContactId: ids.insuranceId,
      category: "insurance",
      totalGrossCents: rng.stepped(60000, 95000, 100),
      critical: true,
      schedule: [{ dueOn: "2026-01-15", share: 100, paid: "full" }],
    });
  });

  // Motor tax per van, and the HU fee for Transporter 2 (inspected in March 2026).
  ctx.vehicles.forEach((vehicle, index) => {
    drafts.push({
      ...blank,
      title: `Kfz-Steuer 2026 – ${vehicle.name}`,
      scope: "vehicle",
      vehicleId: vehicle.id,
      counterpartyContactId: null,
      category: "vehicle",
      totalGrossCents: rng.stepped(9000, 16000, 100),
      critical: false,
      schedule: [{ dueOn: "2026-07-01", share: 100, paid: "full" }],
    });
    if (index === 1) {
      drafts.push({
        ...blank,
        title: `HU / TÜV-Gebühr – ${vehicle.name} 2026`,
        scope: "vehicle",
        vehicleId: vehicle.id,
        counterpartyContactId: null,
        category: "vehicle",
        totalGrossCents: 12500,
        critical: false,
        schedule: [{ dueOn: "2026-03-20", share: 100, paid: "full" }],
      });
    }
  });

  // Company liability insurance, quarterly.
  drafts.push({
    ...blank,
    title: "Betriebs- und Veranstalterhaftpflicht 2026",
    scope: "company",
    counterpartyContactId: ids.insuranceId,
    category: "insurance",
    totalGrossCents: 240000,
    critical: true,
    schedule: [
      { dueOn: "2026-01-15", share: 25, paid: "full" },
      { dueOn: "2026-04-15", share: 25, paid: "full" },
      { dueOn: "2026-07-15", share: 25, paid: "full" },
      { dueOn: "2026-10-15", share: 25, paid: "full" },
    ],
  });

  // Event costs for the Stadtfest (security, music rights).
  const festival = ctx.events.find(
    (event) =>
      event.season === 2026 &&
      ctx.eventTypeKeyById.get(event.eventTypeId) === "city_festival" &&
      event.status !== "cancelled",
  );
  if (festival) {
    drafts.push({
      ...blank,
      title: `Sicherheitsdienst Stadtfest ${festival.startsOn}`,
      scope: "event",
      eventId: festival.id,
      counterpartyContactId: ids.securityId,
      category: "security",
      totalGrossCents: 180000,
      critical: false,
      schedule: [
        { dueOn: addDays(festival.startsOn, -30), share: 50, paid: "full" },
        { dueOn: addDays(festival.startsOn, -5), share: 50, paid: "full" },
      ],
    });
    drafts.push({
      ...blank,
      title: `Musiklizenzen Stadtfest ${festival.startsOn}`,
      scope: "event",
      eventId: festival.id,
      counterpartyContactId: ids.musicRightsId,
      category: "gema",
      totalGrossCents: 48000,
      critical: false,
      schedule: [{ dueOn: addDays(festival.startsOn, -14), share: 100, paid: "full" }],
    });
  }

  const payables: Payable[] = [];
  const installments: Installment[] = [];
  drafts.forEach((draft, index) => {
    const id = rng.uuid();
    const rows = buildInstallments(
      rng,
      id,
      draft.totalGrossCents,
      draft.schedule,
      `RE-${draft.season ?? "F"}-${String(index + 1).padStart(4, "0")}`,
    );
    installments.push(...rows);
    payables.push({
      id,
      title: draft.title,
      scope: draft.scope,
      eventId: draft.eventId,
      venueId: draft.venueId,
      season: draft.season,
      vehicleId: draft.vehicleId,
      permitId: draft.permitId,
      counterpartyContactId: draft.counterpartyContactId,
      category: draft.category,
      totalGrossCents: draft.totalGrossCents,
      vatRateBp: 1900,
      critical: draft.critical,
      status: payableStatus(rows),
      notes: draft.notes,
    });
  });
  return { payables, installments };
}
