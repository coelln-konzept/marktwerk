/**
 * Recurring obligations (Firma tab, M6): HU, UVV, service, insurance, tax, KSK report … by date and/or
 * kilometres, whichever comes first (Fleetio pattern). Pure functions, no I/O; all dates are business dates
 * ("YYYY-MM-DD") and never depend on the machine's time zone.
 */

import { addDays, daysBetween, daysInMonth, isIsoDate, isoDate } from "../dates/calendar";

// ---------------------------------------------------------------------------------------------
// Month arithmetic

/**
 * `date` plus whole months. If the target month is shorter, the day is clamped to its last day
 * (31.01. + 1 month = 28.02. / 29.02., 29.02. + 12 months = 28.02.). Negative months go back.
 */
export function addMonths(date: string, months: number): string {
  if (!isIsoDate(date)) throw new Error(`Invalid date: ${date}`);
  if (!Number.isInteger(months)) throw new Error(`Invalid months: ${months}`);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return isoDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** The next `month`/`day` (e.g. KSK report: 3/31) on or after `from`. */
export function nextAnnualDate(from: string, month: number, day: number): string {
  const year = Number(from.slice(0, 4));
  const thisYear = isoDate(year, month, Math.min(day, daysInMonth(year, month)));
  if (thisYear >= from) return thisYear;
  return isoDate(year + 1, month, Math.min(day, daysInMonth(year + 1, month)));
}

// ---------------------------------------------------------------------------------------------
// Rolling forward

export type RollInput = {
  intervalMonths: number | null;
  intervalKm: number | null;
  /** Current due date / km of the obligation (before this completion). */
  nextDueOn: string | null;
  leadDays: number;
  doneOn: string;
  doneKm: number | null;
};

export type RollResult = { nextDueOn: string | null; nextDueKm: number | null };

/**
 * The next due date and km after a completion.
 *
 * Km: `done_km + interval_km` (from the reading at completion, not from the old target).
 * Date: normally `done_on + interval_months`. Exception: when it was done inside the reminder window (at most
 * `lead_days` before the due date, or later) the old due date stays the anchor, so a contract date such as
 * 31 March or an insurance renewal does not creep forward each time it is done a few days early. If the
 * anchored date would not even lie after the completion (very late), the completion date is the anchor.
 * Without an interval the matching target becomes null (a one-off duty is finished).
 */
export function rollForward(input: RollInput): RollResult {
  const { intervalMonths, intervalKm, nextDueOn, leadDays, doneOn, doneKm } = input;

  let dueOn: string | null = null;
  if (intervalMonths !== null) {
    const inWindow = nextDueOn !== null && doneOn >= addDays(nextDueOn, -leadDays);
    const anchor = inWindow && nextDueOn !== null ? nextDueOn : doneOn;
    dueOn = addMonths(anchor, intervalMonths);
    if (dueOn <= doneOn) dueOn = addMonths(doneOn, intervalMonths);
  }

  const dueKm = intervalKm !== null && doneKm !== null ? doneKm + intervalKm : null;
  return { nextDueOn: dueOn, nextDueKm: dueKm };
}

// ---------------------------------------------------------------------------------------------
// Status

export type ObligationStatus = "ok" | "soon" | "due" | "overdue";

/** Remaining km at which a km-based obligation counts as "bald" (soon). */
export const DEFAULT_KM_LEAD = 1000;

export type StatusInput = {
  nextDueOn: string | null;
  nextDueKm: number | null;
  leadDays: number;
  today: string;
  /** Current odometer of the vehicle (vehicle obligations only). */
  currentKm?: number | null;
  kmLead?: number;
};

export type StatusResult = {
  status: ObligationStatus;
  /** Days until the due date (negative = overdue); null without a date. */
  daysLeft: number | null;
  /** Km until the km target (negative = overdue); null without km data. */
  kmLeft: number | null;
  /** What put it in this status: the date or the km target. */
  trigger: "date" | "km" | null;
};

const SEVERITY: Record<ObligationStatus, number> = { ok: 0, soon: 1, due: 2, overdue: 3 };

/**
 * ok / bald (soon) / fällig (due) / überfällig (overdue). Date: soon from `lead_days` before the due date,
 * due on the day, overdue after it. Km: soon within `kmLead` km, due at the target, overdue beyond it.
 * With both, the worse of the two counts ("whichever comes first").
 */
export function obligationStatus(input: StatusInput): StatusResult {
  const {
    nextDueOn,
    nextDueKm,
    leadDays,
    today,
    currentKm = null,
    kmLead = DEFAULT_KM_LEAD,
  } = input;
  const daysLeft = nextDueOn ? daysBetween(today, nextDueOn) : null;
  const kmLeft = nextDueKm !== null && currentKm !== null ? nextDueKm - currentKm : null;

  let byDate: ObligationStatus = "ok";
  if (daysLeft !== null) {
    if (daysLeft < 0) byDate = "overdue";
    else if (daysLeft === 0) byDate = "due";
    else if (daysLeft <= leadDays) byDate = "soon";
  }
  let byKm: ObligationStatus = "ok";
  if (kmLeft !== null) {
    if (kmLeft < 0) byKm = "overdue";
    else if (kmLeft === 0) byKm = "due";
    else if (kmLeft <= kmLead) byKm = "soon";
  }

  if (SEVERITY[byKm] > SEVERITY[byDate]) return { status: byKm, daysLeft, kmLeft, trigger: "km" };
  return {
    status: byDate,
    daysLeft,
    kmLeft,
    trigger: byDate === "ok" && byKm === "ok" ? null : "date",
  };
}

export const OBLIGATION_STATUS_ORDER: readonly ObligationStatus[] = [
  "overdue",
  "due",
  "soon",
  "ok",
];

// ---------------------------------------------------------------------------------------------
// Reminders (job)

/** Manager is told this many days after the obligation became overdue (data model: "+1 day → manager"). */
export const OBLIGATION_ESCALATION_AFTER_DAYS = 1;

export type ReminderStage = "soon" | "overdue";

export type ReminderPlan = {
  /** Reminder to the responsible person, if one applies today. */
  stage: ReminderStage | null;
  /** The manager is told as well. */
  escalate: boolean;
  /** Part of the dedupe key: changes when the due date/km moves, which re-arms the reminders. */
  dueKey: string;
};

/**
 * Which reminders apply to an obligation today: `soon` (from `lead_days` before the date, on the day itself or
 * near the km target) to the responsible person; `overdue` once past due; the manager after
 * `OBLIGATION_ESCALATION_AFTER_DAYS` more days (a km overrun escalates at once, there is no day count).
 */
export function obligationReminderPlan(input: StatusInput): ReminderPlan {
  const { status, daysLeft, kmLeft } = obligationStatus(input);
  const dueKey = `${input.nextDueOn ?? "-"}|${input.nextDueKm ?? "-"}`;
  if (status === "ok") return { stage: null, escalate: false, dueKey };
  if (status !== "overdue") return { stage: "soon", escalate: false, dueKey };
  const overdueDays = daysLeft !== null && daysLeft < 0 ? -daysLeft : 0;
  const kmOverrun = kmLeft !== null && kmLeft < 0;
  return {
    stage: "overdue",
    escalate: overdueDays > OBLIGATION_ESCALATION_AFTER_DAYS || (kmOverrun && overdueDays === 0),
    dueKey,
  };
}

/** Deterministic key per (obligation, stage, due date/km); `soon` and `overdue` are different notifications. */
export function obligationDedupeKey(
  obligationId: string,
  stage: ReminderStage | "escalated",
  dueKey: string,
): string {
  return `obligation:${obligationId}:${stage}:${dueKey}`;
}

// ---------------------------------------------------------------------------------------------
// Legal intervals

/** Vans up to 3.5 t gross weight take the longer HU interval (legal_parameter, research 07 §D). */
export const HU_WEIGHT_LIMIT_KG = 3500;

/** Keys of the legal numbers used here; values live in `legal_parameter`. */
export const LEGAL_KEYS = {
  huUpTo3500: "hu_interval_months_up_to_3500kg",
  huOver3500: "hu_interval_months_over_3500kg",
  uvv: "uvv_interval_months",
} as const;

/**
 * HU interval in months for a vehicle by gross weight. Unknown weight takes the shorter interval (the
 * conservative choice). Returns null when the legal number is not available.
 */
export function huIntervalMonths(
  grossWeightKg: number | null,
  legal: { upTo3500: number | null; over3500: number | null },
): number | null {
  if (grossWeightKg !== null && grossWeightKg <= HU_WEIGHT_LIMIT_KG) return legal.upTo3500;
  return legal.over3500;
}

// ---------------------------------------------------------------------------------------------
// Presets ("Pflicht anlegen")

export const OBLIGATION_KINDS = [
  "hu",
  "uvv",
  "service",
  "tyres",
  "insurance",
  "vehicle_tax",
  "licence_check",
  "report",
  "other",
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];
export type ObligationScope = "company" | "vehicle" | "venue";

export type ObligationPreset = {
  key: string;
  kind: ObligationKind;
  scope: ObligationScope;
  /** Fixed practice default; null where the legal number applies (`legal`) or none is suggested. */
  intervalMonths: number | null;
  intervalKm: number | null;
  /** Interval from `legal_parameter` (HU by weight, UVV) instead of `intervalMonths`. */
  legal: "hu" | "uvv" | null;
  leadDays: number;
  createsPayable: boolean;
  /** First due date suggestion as a fixed yearly date (KSK: 31 March). */
  annualDate: { month: number; day: number } | null;
};

/**
 * Starting points offered in the "Pflicht anlegen" form (data model, "Seeds"). Titles are in the message files
 * (`company.presets.<key>`). Everything is editable; only the HU and UVV intervals are legal numbers.
 */
export const OBLIGATION_PRESETS: readonly ObligationPreset[] = [
  preset("hu", "hu", "vehicle", { legal: "hu", lead: 30, payable: true }),
  preset("uvv", "uvv", "vehicle", { legal: "uvv", lead: 30, payable: true }),
  preset("service", "service", "vehicle", { months: 12, lead: 30, payable: true }),
  preset("tyres", "tyres", "vehicle", { months: 6, lead: 14 }),
  preset("vehicleInsurance", "insurance", "vehicle", { months: 12, lead: 60, payable: true }),
  preset("liabilityInsurance", "insurance", "company", { months: 12, lead: 60, payable: true }),
  preset("equipmentInsurance", "insurance", "company", { months: 12, lead: 60, payable: true }),
  preset("vehicleTax", "vehicle_tax", "vehicle", { months: 12, lead: 30, payable: true }),
  preset("licenceCheck", "licence_check", "company", { months: 6, lead: 14 }),
  preset("kskReport", "report", "company", { months: 12, lead: 30, annual: [3, 31] }),
];

function preset(
  key: string,
  kind: ObligationKind,
  scope: ObligationScope,
  o: {
    months?: number;
    km?: number;
    legal?: "hu" | "uvv";
    lead: number;
    payable?: boolean;
    annual?: [number, number];
  },
): ObligationPreset {
  return {
    key,
    kind,
    scope,
    intervalMonths: o.months ?? null,
    intervalKm: o.km ?? null,
    legal: o.legal ?? null,
    leadDays: o.lead,
    createsPayable: o.payable ?? false,
    annualDate: o.annual ? { month: o.annual[0], day: o.annual[1] } : null,
  };
}
