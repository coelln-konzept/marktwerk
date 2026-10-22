import type { PermitDisplayState, PermitStatus } from "./status";

/**
 * Pure rules about a permit judged *for one event* (UX pass 2026-10-22): a one-day permit valid exactly
 * on the market day is fine for that market, it does not "run out" for it. Dates are Berlin `YYYY-MM-DD`.
 */

/**
 * Does this status already cover the *application* task ("beantragen")? Once a permit is applied for or
 * granted, the work of applying is done; everything else (not started, preparing, rejected, ...) still
 * needs the application. Used to complete the linked template task automatically.
 */
export function permitCoversApplication(status: PermitStatus): boolean {
  return status === "applied" || status === "granted";
}

/**
 * Does a permit's end date matter, given the markets it covers? Not when it reaches the last day of the
 * latest market it is required for ("Läuft ab" would only say that the permit runs out after its job is
 * done). Without any such market the end date is the only information there is, so it matters.
 */
export function permitExpiryMatters(validUntil: string, latestEventEndsOn: string | null): boolean {
  return latestEventEndsOn === null || validUntil < latestEventEndsOn;
}

/**
 * A permit that ran out although all the events it covers are over is history, not a warning: it must
 * not count as "Abgelaufen" in the needs-action numbers. A permit without any linked event stays a
 * warning (nothing says it was only needed once).
 */
export function isPermitHistory(row: {
  state: PermitDisplayState;
  linkedEvents: number;
  upcomingEvents: number;
}): boolean {
  return row.state === "expired" && row.linkedEvents > 0 && row.upcomingEvents === 0;
}
