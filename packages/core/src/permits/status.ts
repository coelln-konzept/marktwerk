import { daysBetween } from "../dates/calendar";
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
  superseded: 8,
};

/** Within this many days of the event a permit that is not granted yet is critical. */
export const PERMIT_CRITICAL_DAYS = 14;

export type EventPermitInput = {
  status: PermitStatus;
  applyBy: string | null;
  validUntil: string | null;
  /** event_permit.required; false = not applicable for this event. */
  required: boolean;
};

/**
 * Permit dimension of an event's health: ok when everything required is granted, warn while something is
 * open, critical when something is rejected / expired, the application is overdue, or the event is close.
 * Null when the event needs no permit at all (nothing to track).
 */
export function eventPermitHealth(
  permits: readonly EventPermitInput[],
  eventStartsOn: string,
  today: string,
): HealthLevel | null {
  const relevant = permits.filter((p) => p.required && p.status !== "not_required");
  if (relevant.length === 0) return permits.length > 0 ? "ok" : null;
  const untilEvent = daysBetween(today, eventStartsOn);
  let level: HealthLevel = "ok";
  for (const p of relevant) {
    const state = permitDisplayState(p, today);
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
    if (overdue || untilEvent <= PERMIT_CRITICAL_DAYS) return "critical";
    level = "warn";
  }
  return level;
}
