/** The business date (YYYY-MM-DD) an instant falls on in the company time zone. */
export function dateOfInstant(at: Date, timeZone = "Europe/Berlin"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export const PHASES = ["pre", "live", "post"] as const;

/** Venue kinds a condition can name (venue.kind enum). */
export { VENUE_KINDS } from "@marktwerk/core";
