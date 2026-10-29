import { permitUrgency } from "../deadlines/permit-horizon";
import type { PermitDisplayState } from "./status";

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
