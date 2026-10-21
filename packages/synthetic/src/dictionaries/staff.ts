import type { DateString, DutyRoleKey, EmploymentType, PermissionRole } from "../types";

export interface StaffBlueprint {
  key: string;
  /** Short role title, German. Used for notes only, names are generated. */
  titleDe: string;
  permissionRole: PermissionRole | null;
  contract: {
    type: EmploymentType;
    hourlyRateCents: number | null;
    fixedMonthlyPayCents: number | null;
    hoursPerWeek: number | null;
    validFrom: DateString;
  };
  /** Duty roles this person is the default for (one default per role). */
  defaultDuties: DutyRoleKey[];
  /** Whether this person is part of the crew for shifts on event days. */
  crew: boolean;
  /** Whether the person has an email address on an example domain. */
  hasEmail: boolean;
  notes: string | null;
}

/** 14 people: owner, office manager, two office staff with login, logistics lead, nine field crew. */
export const CORE_STAFF_BLUEPRINTS: readonly StaffBlueprint[] = [
  {
    key: "owner",
    titleDe: "Geschäftsführung",
    permissionRole: "owner",
    contract: {
      type: "full_time",
      hourlyRateCents: null,
      fixedMonthlyPayCents: 480000,
      hoursPerWeek: 40,
      validFrom: "2019-04-01",
    },
    defaultDuties: ["market_lead"],
    crew: false,
    hasEmail: true,
    notes: "Entscheidet über Standorte, Preise und Personal.",
  },
  {
    key: "office_manager",
    titleDe: "Büroleitung",
    permissionRole: "manager",
    contract: {
      type: "full_time",
      hourlyRateCents: null,
      fixedMonthlyPayCents: 340000,
      hoursPerWeek: 38.5,
      validFrom: "2021-04-01",
    },
    defaultDuties: ["office", "permits"],
    crew: false,
    hasEmail: true,
    notes: "Erhält Eskalationen. Genehmigungen, Website und Lohnstunden laufen über sie.",
  },
  {
    key: "office_staff_1",
    titleDe: "Büro (Telefon und Buchungen)",
    permissionRole: "staff",
    contract: {
      type: "part_time",
      hourlyRateCents: 1900,
      fixedMonthlyPayCents: null,
      hoursPerWeek: 20,
      validFrom: "2024-09-01",
    },
    defaultDuties: ["cash"],
    crew: false,
    hasEmail: true,
    notes: "Nimmt Buchungen am Telefon entgegen.",
  },
  {
    key: "office_staff_2",
    titleDe: "Büro (Kommunikation)",
    permissionRole: "staff",
    contract: {
      type: "part_time",
      hourlyRateCents: 1850,
      fixedMonthlyPayCents: null,
      hoursPerWeek: 15,
      validFrom: "2025-03-01",
    },
    defaultDuties: ["communication"],
    crew: false,
    hasEmail: true,
    notes: "Flyer, Social Media und Newsletter.",
  },
  {
    key: "logistics_lead",
    titleDe: "Logistikleitung",
    permissionRole: null,
    contract: {
      type: "part_time",
      hourlyRateCents: 1800,
      fixedMonthlyPayCents: null,
      hoursPerWeek: 30,
      validFrom: "2022-05-01",
    },
    defaultDuties: ["setup_crew", "water_power"],
    crew: true,
    hasEmail: false,
    notes: "Leitet Aufbau und Abbau am Veranstaltungstag.",
  },
];

/** Field crew without login. Seven Minijob, one student, one part-time. Rates are cents per hour. */
export const FIELD_CREW_BLUEPRINTS: readonly StaffBlueprint[] = [
  ...Array.from(
    { length: 7 },
    (_, index): StaffBlueprint => ({
      key: `field_minijob_${index + 1}`,
      titleDe: "Platzteam (Minijob)",
      permissionRole: null,
      contract: {
        type: "minijob",
        hourlyRateCents: null,
        fixedMonthlyPayCents: null,
        hoursPerWeek: 8,
        validFrom: "2025-01-01",
      },
      defaultDuties: [],
      crew: true,
      hasEmail: index % 3 === 0,
      notes: null,
    }),
  ),
  {
    key: "field_student",
    titleDe: "Platzteam (Studentin/Student)",
    permissionRole: null,
    contract: {
      type: "student",
      hourlyRateCents: 1450,
      fixedMonthlyPayCents: null,
      hoursPerWeek: 10,
      validFrom: "2025-09-01",
    },
    defaultDuties: [],
    crew: true,
    hasEmail: false,
    notes: "Nur an Wochenenden verfügbar.",
  },
  {
    key: "field_part_time",
    titleDe: "Platzteam (Teilzeit)",
    permissionRole: null,
    contract: {
      type: "part_time",
      hourlyRateCents: 1550,
      fixedMonthlyPayCents: null,
      hoursPerWeek: 15,
      validFrom: "2024-04-01",
    },
    defaultDuties: [],
    crew: true,
    hasEmail: false,
    notes: null,
  },
];

/** Hourly rate choices for Minijob crew, in cents. All within 1390–1600 (2026 minimum wage up to typical Minijob rates). */
export const MINIJOB_RATE_CENTS: readonly number[] = [1390, 1390, 1420, 1450, 1500, 1550, 1600];
