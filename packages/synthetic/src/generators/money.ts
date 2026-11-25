import type { VenueBlueprint } from "../dictionaries/venues";
import { type Clock, laterOf } from "../lib/clock";
import { addDays, addMonths, yearOf } from "../lib/dates";
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

/**
 * Days from today to the next due date of each recurring check, per van. Everything is relative to the
 * reference date; Transporter 2's UVV is the one deliberate overdue obligation (the others are ahead).
 */
const HU_DAYS_AHEAD = [140, 200, 410];
const UVV_DAYS_AHEAD = [95, -18, 200];
const SERVICE_DAYS_AHEAD = [70, 115, 170];

/** Last HU date of a van, derived so the next one falls `HU_DAYS_AHEAD` days from today. */
function huLastDone(clock: Clock, grossWeightKg: number, index: number): string {
  const months = grossWeightKg > 3500 ? 12 : 24;
  return addMonths(addDays(clock.today, HU_DAYS_AHEAD[index] ?? 200), -months);
}

/** The next occurrence of a yearly month-day on or after `today`, and the one before it. */
function yearlyAround(today: string, md: string): { next: string; last: string } {
  const thisYear = `${yearOf(today)}-${md}`;
  const next = thisYear >= today ? thisYear : `${yearOf(today) + 1}-${md}`;
  return { next, last: `${yearOf(next) - 1}-${md}` };
}

export interface ObligationContext {
  clock: Clock;
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
  vehicles.forEach((vehicle, index) => {
    const last = huLastDone(ctx.clock, vehicle.grossWeightKg, index);
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
  vehicles.forEach((vehicle, index) => {
    const next = addDays(ctx.clock.today, UVV_DAYS_AHEAD[index] ?? 120);
    const last = addMonths(next, -12);
    add({
      title: `UVV-Prüfung (DGUV Vorschrift 70) – ${vehicle.name}`,
      scope: "vehicle",
      vehicleId: vehicle.id,
      venueId: null,
      intervalMonths: 12,
      intervalKm: null,
      nextDueOn: next,
      nextDueKm: null,
      leadDays: 14,
      responsibleStaffMemberId: ctx.logisticsStaffId,
      createsPayable: false,
      lastDoneOn: last,
    });
  });

  // Service: yearly or every 30,000 km, whichever comes first.
  vehicles.forEach((vehicle, index) => {
    const next = addDays(ctx.clock.today, SERVICE_DAYS_AHEAD[index] ?? 120);
    add({
      title: `Inspektion – ${vehicle.name}`,
      scope: "vehicle",
      vehicleId: vehicle.id,
      venueId: null,
      intervalMonths: 12,
      intervalKm: 30000,
      nextDueOn: next,
      nextDueKm: vehicle.odometerKm + 8000,
      leadDays: 21,
      responsibleStaffMemberId: ctx.logisticsStaffId,
      createsPayable: true,
      lastDoneOn: addMonths(next, -12),
    });
  });

  const insuranceYear = yearlyAround(addDays(ctx.clock.today, 1), "01-01");
  add({
    title: "Kfz-Versicherung (Verlängerung)",
    scope: "company",
    vehicleId: null,
    venueId: null,
    intervalMonths: 12,
    intervalKm: null,
    nextDueOn: insuranceYear.next,
    nextDueKm: null,
    leadDays: 60,
    responsibleStaffMemberId: ctx.officeManagerStaffId,
    createsPayable: true,
    lastDoneOn: insuranceYear.last,
  });

  const ksk = yearlyAround(ctx.clock.today, "03-31");
  add({
    title: "KSK-Jahresmeldung",
    scope: "company",
    vehicleId: null,
    venueId: null,
    intervalMonths: 12,
    intervalKm: null,
    nextDueOn: ksk.next,
    nextDueKm: null,
    leadDays: 30,
    responsibleStaffMemberId: ctx.officeManagerStaffId,
    createsPayable: false,
    lastDoneOn: ksk.last,
  });

  return obligations;
}

export interface CompanyObligationContext {
  clock: Clock;
  ownerStaffId: string;
  officeManagerStaffId: string;
  bookingsStaffId: string;
  communicationStaffId: string;
  logisticsStaffId: string;
}

/** Marketing runs every 4 months: before the season, mid-season and towards its end. */
const MARKETING_MONTH_DAYS = ["02-15", "06-15", "10-15"] as const;
const MARKETING_INTERVAL_MONTHS = 4;

/** Days from today to the electricity contract's renewal: inside its 30-day reminder, so a fresh seed shows one. */
const POWER_CONTRACT_DAYS_AHEAD = 12;

/**
 * The office's yearly company work (ADR 0024, level 3: Pflichten with `scope = company`). Fixed calendar points
 * roll to their next occurrence on or after today, so none of them is overdue; the electricity contract's
 * renewal is a contract anniversary and sits a few days ahead, so one company Pflicht is always in its reminder
 * window. Built after everything else so its random draws do not shift the rest of the dataset.
 */
export function buildCompanyObligations(rng: Rng, ctx: CompanyObligationContext): Obligation[] {
  const today = ctx.clock.today;
  const obligations: Obligation[] = [];
  const add = (o: Omit<Obligation, "id" | "scope" | "vehicleId" | "venueId">): void => {
    obligations.push({
      id: rng.uuid(),
      scope: "company",
      vehicleId: null,
      venueId: null,
      ...o,
    });
  };
  const yearly = {
    intervalMonths: 12,
    intervalKm: null,
    nextDueKm: null,
  } as const;

  // Dates first: the city's season applications go out around September (ADR 0024).
  const planning = yearlyAround(today, "08-01");
  add({
    ...yearly,
    title: "Termine für die neue Saison planen",
    nextDueOn: planning.next,
    leadDays: 30,
    responsibleStaffMemberId: ctx.ownerStaffId,
    createsPayable: false,
    lastDoneOn: planning.last,
    notes:
      "Termine aller Märkte für die nächste Saison festlegen. Die Anträge bei der Stadt gehen ab September raus.",
  });

  const insurance = yearlyAround(today, "01-01");
  add({
    ...yearly,
    title: "Versicherung für alle Märkte erneuern",
    nextDueOn: insurance.next,
    leadDays: 30,
    responsibleStaffMemberId: ctx.officeManagerStaffId,
    createsPayable: true,
    lastDoneOn: insurance.last,
    notes:
      "Veranstalterhaftpflicht für alle Märkte der Saison. Die Jahresprämie wird als Zahlung angelegt.",
  });

  const toilets = yearlyAround(today, "01-31");
  add({
    ...yearly,
    title: "Toiletten für die Saison buchen",
    nextDueOn: toilets.next,
    leadDays: 30,
    responsibleStaffMemberId: ctx.bookingsStaffId,
    createsPayable: false,
    lastDoneOn: toilets.last,
    notes:
      "Toilettenwagen für alle Märkte der Saison buchen. Bei Planänderungen einzeln nachbuchen.",
  });

  const power = addDays(today, POWER_CONTRACT_DAYS_AHEAD);
  add({
    ...yearly,
    title: "Stromvertrag prüfen und verlängern",
    nextDueOn: power,
    leadDays: 30,
    responsibleStaffMemberId: ctx.logisticsStaffId,
    createsPayable: false,
    lastDoneOn: addMonths(power, -12),
    notes:
      "Ein Vertrag für den Baustrom aller Märkte. Preise vergleichen, bevor er sich verlängert.",
  });

  const marketing = MARKETING_MONTH_DAYS.flatMap((md) => [
    `${yearOf(today)}-${md}`,
    `${yearOf(today) + 1}-${md}`,
  ])
    .filter((date) => date >= today)
    .sort()[0];
  if (!marketing) throw new Error("No marketing date after today");
  add({
    title: "Marketing: Saisonwerbung",
    intervalMonths: MARKETING_INTERVAL_MONTHS,
    intervalKm: null,
    nextDueOn: marketing,
    nextDueKm: null,
    leadDays: 21,
    responsibleStaffMemberId: ctx.communicationStaffId,
    createsPayable: false,
    lastDoneOn: addMonths(marketing, -MARKETING_INTERVAL_MONTHS),
    notes: "Flyer, Plakate und Social Media: zum Saisonstart, zur Saisonmitte und zum Saisonende.",
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
  /**
   * Left out, the status follows the date: due on or before today means paid, later means open. "open" keeps a
   * past-due row unpaid on purpose (an overdue example); "half" is a partial payment.
   */
  paid?: "full" | "half" | "open";
}

/** Installment rows for one payable. `paid` decides the status; unpaid rows are open. */
function buildInstallments(
  rng: Rng,
  payableId: string,
  totalCents: number,
  schedule: Schedule[],
  reference: string,
  today: string,
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
    const paid = row.paid ?? (row.dueOn <= today ? "full" : "open");
    if (paid === "full") {
      status = "paid";
      paidOn = addDays(row.dueOn, -rng.int(0, 5));
      paidAmountCents = amount;
    } else if (paid === "half") {
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
function payableStatus(installments: Installment[], today: string): Payable["status"] {
  if (installments.every((i) => i.status === "paid")) return "paid";
  if (installments.some((i) => i.status !== "paid" && i.dueOn < today)) return "overdue";
  if (installments.some((i) => i.status === "paid" || i.status === "partially_paid"))
    return "partially_paid";
  return "open";
}

export interface MoneyContext {
  clock: Clock;
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

/** Location fee instalments: three per season for every other venue, one for the rest. Dates follow the season. */
function venueSchedule(index: number, season: number): Schedule[] {
  return index % 2 === 0
    ? [
        { dueOn: `${season}-02-28`, share: 40 },
        { dueOn: `${season}-06-30`, share: 40 },
        { dueOn: `${season}-10-31`, share: 20 },
      ]
    : [{ dueOn: `${season}-03-31`, share: 100 }];
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
  const { today, season: currentSeason, nextSeason } = ctx.clock;
  const seasons = [currentSeason, nextSeason];
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
    for (const season of seasons) {
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
        schedule: venueSchedule(index, season),
      });
    }
  });

  // Market permit fees (permits are payables too).
  for (const permit of ctx.permits) {
    if (permit.permitType !== "market_permit") continue;
    const fee = ctx.feeCentsByPermitId.get(permit.id) ?? 0;
    // Invoice 14 days after the decision (the expected one while it is pending, at the earliest in 30 days).
    const decided =
      permit.grantedAt ?? laterOf(permit.expectedDecisionOn ?? today, addDays(today, 16));
    const due = addDays(decided, 14);
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
      schedule: [{ dueOn: due, share: 100 }],
    });
  }

  // Festsetzung (§ 69 GewO): the fee notice comes with the decision, so only a granted Festsetzung is a payable
  // (due a month after it). Named after the market where several share a place.
  const venueNameById = new Map(ctx.venues.map((venue) => [venue.id, venue.name]));
  for (const permit of ctx.permits) {
    if (permit.permitType !== "market_fixing" || permit.grantedAt === null) continue;
    const market = permit.title.split(" – ")[1] ?? venueNameById.get(permit.venueId ?? "") ?? "";
    drafts.push({
      ...blank,
      title: `Festsetzungsgebühr ${market} ${permit.season}`,
      scope: "company",
      venueId: permit.venueId,
      season: permit.season,
      permitId: permit.id,
      counterpartyContactId: permit.authorityContactId,
      category: "permit",
      totalGrossCents: ctx.feeCentsByPermitId.get(permit.id) ?? 0,
      critical: true,
      schedule: [{ dueOn: addDays(permit.grantedAt, 30), share: 100 }],
    });
  }

  // Toilet framework contracts (one per venue and season; Hoffnungsthal uses the school's toilets). The Südstadt's
  // current invoice is overdue (a deliberate example), Rudolfplatz's falls due within the next two weeks.
  ctx.venues.forEach((venue, index) => {
    const venueKey = ctx.venueBlueprintByName.get(venue.name)?.key;
    if (venueKey === "hoffnungsthal") return;
    for (const season of seasons) {
      const current = season === currentSeason;
      const schedule: Schedule[] =
        current && venueKey === "suedstadt"
          ? [{ dueOn: addDays(today, -12), share: 100, paid: "open" }]
          : current && venueKey === "rudolfplatz"
            ? [{ dueOn: addDays(today, 6), share: 100 }]
            : [{ dueOn: `${season}-03-31`, share: 100 }];
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
    for (const season of seasons) {
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
          season === currentSeason && blueprint.key === "altstadt"
            ? [{ dueOn: addDays(today, -7), share: 100, paid: "open" }]
            : [{ dueOn: `${season}-04-30`, share: 100 }],
      });
    }
  });

  // Vehicle insurance, paid once per year.
  ctx.vehicles.forEach((vehicle) => {
    drafts.push({
      ...blank,
      title: `Kfz-Versicherung ${currentSeason} – ${vehicle.name}`,
      scope: "vehicle",
      vehicleId: vehicle.id,
      counterpartyContactId: ids.insuranceId,
      category: "insurance",
      totalGrossCents: rng.stepped(60000, 95000, 100),
      critical: true,
      schedule: [{ dueOn: `${currentSeason}-01-15`, share: 100 }],
    });
  });

  // Motor tax per van, and the HU fee for Transporter 2 (paid when it was last inspected).
  ctx.vehicles.forEach((vehicle, index) => {
    drafts.push({
      ...blank,
      title: `Kfz-Steuer ${currentSeason} – ${vehicle.name}`,
      scope: "vehicle",
      vehicleId: vehicle.id,
      counterpartyContactId: null,
      category: "vehicle",
      totalGrossCents: rng.stepped(9000, 16000, 100),
      critical: false,
      schedule: [{ dueOn: `${currentSeason}-07-01`, share: 100 }],
    });
    if (index === 1) {
      const huDone = huLastDone(ctx.clock, vehicle.grossWeightKg, index);
      drafts.push({
        ...blank,
        title: `HU / TÜV-Gebühr – ${vehicle.name} ${yearOf(huDone)}`,
        scope: "vehicle",
        vehicleId: vehicle.id,
        counterpartyContactId: null,
        category: "vehicle",
        totalGrossCents: 12500,
        critical: false,
        schedule: [{ dueOn: huDone, share: 100 }],
      });
    }
  });

  // Company liability insurance, quarterly.
  drafts.push({
    ...blank,
    title: `Betriebs- und Veranstalterhaftpflicht ${currentSeason}`,
    scope: "company",
    counterpartyContactId: ids.insuranceId,
    category: "insurance",
    totalGrossCents: 240000,
    critical: true,
    schedule: [
      { dueOn: `${currentSeason}-01-15`, share: 25 },
      { dueOn: `${currentSeason}-04-15`, share: 25 },
      { dueOn: `${currentSeason}-07-15`, share: 25 },
      { dueOn: `${currentSeason}-10-15`, share: 25 },
    ],
  });

  // Event costs for the Stadtfest (security, music rights).
  const festival = ctx.events.find(
    (event) =>
      event.season === currentSeason &&
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
        { dueOn: addDays(festival.startsOn, -30), share: 50 },
        { dueOn: addDays(festival.startsOn, -5), share: 50 },
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
      schedule: [{ dueOn: addDays(festival.startsOn, -14), share: 100 }],
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
      today,
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
      status: payableStatus(rows, today),
      notes: draft.notes,
    });
  });
  return { payables, installments };
}
