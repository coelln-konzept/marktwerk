import { daysBetween } from "../dates/calendar";
import { PERMIT_HORIZON_DEFAULT_DAYS, permitUrgency } from "../deadlines/permit-horizon";
import {
  type EventPermitInput,
  isHeld,
  PERMIT_CRITICAL_DAYS,
  type PermitDisplayState,
  permitStateForEvent,
} from "./status";

/**
 * When a permit needs the office, judged by its apply-by date (product owner, 2026-10-29: replaces the
 * "market within 6 months" rule). One definition for the sidebar badge, the "Jetzt zu tun" chip of the
 * Genehmigungen page and the split of its list. Pure; dates are Berlin `YYYY-MM-DD`.
 *
 * - `overdue`: the application should have been filed already (apply-by passed), or the permit was
 *   rejected / ran out: act now.
 * - `apply_now`: the apply-by date falls within the company's `permit_horizon_days` (or is unknown).
 * - `not_due`: still to be applied for, but later than the horizon ("noch nicht fällig"): no badge.
 */
export type PermitActionTier = "overdue" | "apply_now" | "not_due";

/**
 * The tier of a permit that still needs something from the office, null for every other state (granted,
 * applied for, not needed, history). A permit without an apply-by date counts as `apply_now`: nobody can
 * say it is not due yet.
 */
export function permitActionTier(
  permit: { state: PermitDisplayState; applyBy: string | null },
  today: string,
  horizonDays: number,
): PermitActionTier | null {
  switch (permit.state) {
    case "rejected":
    case "expired":
      return "overdue";
    case "missing":
    case "preparing": {
      if (permit.applyBy === null) return "apply_now";
      const urgency = permitUrgency(permit.applyBy, today, horizonDays);
      if (urgency === null) return "not_due";
      return urgency === "overdue" ? "overdue" : "apply_now";
    }
    default:
      return null;
  }
}

/** Does the permit count for the badge and the "Jetzt zu tun" chip: overdue or due within the horizon. */
export function permitNeedsActionNow(
  permit: { state: PermitDisplayState; applyBy: string | null },
  today: string,
  horizonDays: number,
): boolean {
  const tier = permitActionTier(permit, today, horizonDays);
  return tier === "overdue" || tier === "apply_now";
}

/**
 * Does a required permit count as "fehlt" for one event (Was fehlt, the readiness chip, "1 Genehmigung
 * fehlt")? Only if the office has to act, the same reading as `eventPermitHealth`:
 * - not in hand for the event (not granted, or granted but ending before the first day), and
 * - rejected / expired, or the market is within `PERMIT_CRITICAL_DAYS` days, or
 * - not filed yet with the apply-by date passed or within the permit horizon (`permitNeedsActionNow`), or
 * - filed (Beantragt) but the expected decision date has passed.
 * A filed permit that is just waiting for the authority, and one whose apply-by date lies beyond the
 * horizon, are not missing yet (product owner, 2026-10-29).
 */
export function permitNeedsActionForEvent(
  permit: EventPermitInput,
  event: { startsOn: string; endsOn?: string },
  today: string,
  horizonDays: number = PERMIT_HORIZON_DEFAULT_DAYS,
): boolean {
  if (!permit.required || permit.status === "not_required" || permit.status === "superseded")
    return false;
  const state = permitStateForEvent(permit, { endsOn: event.endsOn ?? event.startsOn }, today);
  if (isHeld(state)) return permit.validUntil !== null && permit.validUntil < event.startsOn;
  if (daysBetween(today, event.startsOn) <= PERMIT_CRITICAL_DAYS) return true;
  switch (state) {
    case "rejected":
    case "expired":
      return true;
    case "applied":
      return permit.expectedDecisionOn != null && permit.expectedDecisionOn < today;
    case "missing":
    case "preparing":
      return permitNeedsActionNow({ state, applyBy: permit.applyBy }, today, horizonDays);
    default:
      return false;
  }
}
