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
