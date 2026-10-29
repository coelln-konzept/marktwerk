import { daysBetween } from "../dates/calendar";
import { PERMIT_HORIZON_DEFAULT_DAYS, permitUrgency } from "../deadlines/permit-horizon";
import type { HealthLevel } from "../events/health";

/**
 * Permit workflow and the derived states of the logbook (UX concept §7: Fehlt · In Vorbereitung ·
 * Beantragt · Genehmigt · Abgelehnt · Läuft ab · Abgelaufen · Nicht nötig). Pure; the database enum is
 * `permit_status`.
 */
export const PERMIT_STATUSES = [
  "not_started",
  "preparing",
  "applied",
  "granted",
  "rejected",
  "not_required",
  "superseded",
] as const;
export type PermitStatus = (typeof PERMIT_STATUSES)[number];

/** The kinds of permit (the database enum `permit_type`). */
export const PERMIT_TYPES = [
  "market_permit",
  "water",
  "signage",
  "no_parking",
  "toilets",
  "landowner_ok",
  "gema",
  "safety_concept",
  "traffic_order",
  "catering",
  "insurance",
  "other",
] as const;
export type PermitTypeKey = (typeof PERMIT_TYPES)[number];

export const PERMIT_CADENCES = [
  "per_event",
  "per_season",
  "per_year",
  "multi_year",
  "standing",
] as const;
export type PermitCadence = (typeof PERMIT_CADENCES)[number];

/**
 * Where a permit may go next. `granted` can be reached without applying (a permit that is simply held),
 * `rejected` can be tried again, `not_required` can be undone. `superseded` is final: the renewal
 * replaces it.
 */
export const PERMIT_TRANSITIONS: Record<PermitStatus, readonly PermitStatus[]> = {
  not_started: ["preparing", "applied", "granted", "not_required"],
  preparing: ["not_started", "applied", "granted", "not_required"],
  applied: ["preparing", "granted", "rejected", "not_required"],
  granted: ["superseded", "applied"],
  rejected: ["preparing", "applied", "not_required", "superseded"],
  not_required: ["not_started", "preparing"],
  superseded: [],
};

export function canTransitionPermit(from: PermitStatus, to: PermitStatus): boolean {
  return PERMIT_TRANSITIONS[from].includes(to);
}

/** The main road of a permit (the drawer's stepper); rejected / not_required / superseded branch off. */
export const PERMIT_FLOW_STEPS = ["not_started", "preparing", "applied", "granted"] as const;
const FLOW_ORDER: Partial<Record<PermitStatus, number>> = Object.fromEntries(
  PERMIT_FLOW_STEPS.map((s, i) => [s, i]),
);

/**
 * The allowed next steps sorted for the buttons of the drawer: the nearest step forward is the one primary
 * action; jumping further ahead and the authority's answers (abgelehnt, ersetzt) are quiet secondary
 * ones; going back a step and "nicht nötig" go into the "…" menu. The emphasis is never on a backward step.
 * A status off the main road (abgelehnt, nicht nötig) counts every step of the road as forward.
 */
export function splitPermitTransitions(status: PermitStatus): {
  primary: PermitStatus | null;
  secondary: PermitStatus[];
  menu: PermitStatus[];
} {
  const next = PERMIT_TRANSITIONS[status];
  const current = FLOW_ORDER[status] ?? -1;
  const order = (s: PermitStatus) => FLOW_ORDER[s];
  const forward = next
    .filter((to) => (order(to) ?? -1) > current)
    .sort((a, b) => (order(a) as number) - (order(b) as number));
  const backward = next.filter((to) => (order(to) ?? Number.POSITIVE_INFINITY) < current);
  const outcomes = next.filter((to) => order(to) === undefined && to !== "not_required");
  return {
    primary: forward[0] ?? null,
    secondary: [...forward.slice(1), ...outcomes],
    menu: [...backward, ...next.filter((to) => to === "not_required")],
  };
}

/** Statuses in which the application is still to be filed (the sweep reminds about `apply_by`). */
export function isUnfiled(status: PermitStatus): boolean {
  return status === "not_started" || status === "preparing";
}

/** Not final yet: the office still has to do something or wait for the authority. */
export function isOpenPermit(status: PermitStatus): boolean {
  return status === "not_started" || status === "preparing" || status === "applied";
}

export const PERMIT_EXPIRY_WARNING_DAYS = 60;

export type PermitDisplayState =
  | "missing"
  | "preparing"
  | "applied"
  | "granted"
  | "expiring"
  | "expired"
  | "rejected"
  | "not_required"
  /** Ran out, but only markets that are over were covered: history, not a warning (`isPermitHistory`). */
  | "past"
  | "superseded";

type StateInput = { status: PermitStatus; validUntil: string | null };

/** The label a person sees: derived from the status plus the validity (granted, but running out / out). */
export function permitDisplayState(
  permit: StateInput,
  today: string,
  warnDays: number = PERMIT_EXPIRY_WARNING_DAYS,
): PermitDisplayState {
  switch (permit.status) {
    case "not_started":
      return "missing";
    case "preparing":
      return "preparing";
    case "applied":
      return "applied";
    case "rejected":
      return "rejected";
    case "not_required":
      return "not_required";
    case "superseded":
      return "superseded";
    case "granted": {
      if (!permit.validUntil) return "granted";
      const left = daysBetween(today, permit.validUntil);
      if (left < 0) return "expired";
      return left <= warnDays ? "expiring" : "granted";
    }
  }
}

/**
 * The state of a permit for one event. Same as `permitDisplayState`, except that a granted permit whose
 * validity reaches the event's last day is simply "granted" for that event: "Läuft ab" (and "Abgelaufen"
 * after the market is over) says something about the permit, not about this market. A permit that ends
 * before the event's last day keeps the permit-wide state.
 */
export function permitStateForEvent(
  permit: { status: PermitStatus; validUntil: string | null },
  event: { endsOn: string },
  today: string,
  warnDays: number = PERMIT_EXPIRY_WARNING_DAYS,
): PermitDisplayState {
  const state = permitDisplayState(permit, today, warnDays);
  if (
    permit.status === "granted" &&
    (state === "expiring" || state === "expired") &&
    permit.validUntil !== null &&
    permit.validUntil >= event.endsOn
  )
    return "granted";
  return state;
}

/** Held = counts as "we have it" (the event may happen). */
export function isHeld(state: PermitDisplayState): boolean {
  return state === "granted" || state === "expiring" || state === "not_required";
}

/** Sort key for "the worst first": what needs attention most comes first in a matrix cell. */
export const DISPLAY_STATE_SEVERITY: Record<PermitDisplayState, number> = {
  rejected: 0,
  expired: 1,
  missing: 2,
  preparing: 3,
  applied: 4,
  expiring: 5,
  granted: 6,
  not_required: 7,
  past: 8,
  superseded: 9,
};

/** Within this many days of the event a permit that is not granted yet is critical. */
export const PERMIT_CRITICAL_DAYS = 14;

export type EventPermitInput = {
  status: PermitStatus;
  applyBy: string | null;
  validUntil: string | null;
  /** event_permit.required; false = not applicable for this event. */
  required: boolean;
  /** When the authority is expected to decide; only read for applied permits. */
  expectedDecisionOn?: string | null;
};

/**
 * Permit dimension of an event's health: ok when nothing needs the office, warn while something is
 * actionable, critical when something is rejected / expired, the application is overdue, or the market
 * is within `PERMIT_CRITICAL_DAYS` and a required permit is still not in hand. Null when the event needs
 * no permit at all (nothing to track).
 *
 * Only permits somebody can act on make an event "Achtung" (2026-10-29): one that is filed (Beantragt)
 * and whose expected decision has not passed yet is just waiting, and one that is not filed but whose
 * apply-by date lies beyond the company's permit horizon is "noch nicht fällig". Both keep the event
 * "ok" until the market is close.
 */
export function eventPermitHealth(
  permits: readonly EventPermitInput[],
  eventStartsOn: string,
  today: string,
  eventEndsOn: string = eventStartsOn,
  horizonDays: number = PERMIT_HORIZON_DEFAULT_DAYS,
): HealthLevel | null {
  const relevant = permits.filter((p) => p.required && p.status !== "not_required");
  if (relevant.length === 0) return permits.length > 0 ? "ok" : null;
  const close = daysBetween(today, eventStartsOn) <= PERMIT_CRITICAL_DAYS;
  let level: HealthLevel = "ok";
  for (const p of relevant) {
    const state = permitStateForEvent(p, { endsOn: eventEndsOn }, today);
    if (state === "granted") continue;
    if (state === "expiring") {
      // Running out only matters if it ends before the event takes place.
      if (p.validUntil && p.validUntil < eventStartsOn) return "critical";
      level = "warn";
      continue;
    }
    if (state === "rejected" || state === "expired") return "critical";
    if (state === "superseded") continue;
    const overdue = isUnfiled(p.status) && p.applyBy !== null && p.applyBy < today;
    if (overdue || close) return "critical";
    if (p.status === "applied") {
      // Waiting for the authority is fine until the expected decision has passed.
      if (p.expectedDecisionOn != null && p.expectedDecisionOn < today) level = "warn";
      continue;
    }
    // Not filed yet: actionable once the apply-by date is within the horizon (or unknown).
    if (p.applyBy === null || permitUrgency(p.applyBy, today, horizonDays) !== null) level = "warn";
  }
  return level;
}
