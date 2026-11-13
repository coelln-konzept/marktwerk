/** Longest Ort name (the `venue.name` limit the service checks). */
export const VENUE_NAME_MAX = 120;

const squash = (text: string | null | undefined) => (text ?? "").trim().replace(/\s+/g, " ");

/**
 * The name an Ort gets when none is typed (user test 2, UT2-02): "Stadt – Straße", or just the city without a
 * street; "" while the city is empty too. Cut to {@link VENUE_NAME_MAX}.
 */
export function venueNameFromAddress(
  city: string | null | undefined,
  street?: string | null,
): string {
  const c = squash(city);
  const s = squash(street);
  const name = c && s ? `${c} – ${s}` : c || s;
  return name.slice(0, VENUE_NAME_MAX).trim();
}

/** Ort types (user test 2, UT2-03): "Städtisch" / "Privat". */
export const VENUE_KINDS = ["municipal", "private"] as const;
export type VenueKindKey = (typeof VENUE_KINDS)[number];

/**
 * A venue kind as stored today, also from data written before UT2-03 (outdoor_public → municipal,
 * outdoor_private / indoor → private), e.g. a synthetic dataset that still uses the old kinds.
 */
export function toVenueKind(kind: string): VenueKindKey {
  return kind === "municipal" || kind === "outdoor_public" ? "municipal" : "private";
}
