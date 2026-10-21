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
export const VENUE_KINDS = ["outdoor_public", "outdoor_private", "indoor"] as const;

/** Anchors with a name of their own; others are shown by their key. */
export const KNOWN_ANCHORS = [
  "event_day",
  "setup_day",
  "teardown_day",
  "booking_cutoff",
  "permit_decision",
] as const;
