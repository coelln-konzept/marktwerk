/*
 * Links from an Ort or a contact address to a maps app (UX-016). Google Maps' universal URLs open the
 * app on phones and the website elsewhere. Stored coordinates are more exact than the address, so they
 * win when both are there.
 */

export type MapPlace = {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
};

/** What the maps app searches for: "50.9375,6.9603" or "Straße 1, 50667 Köln"; null when nothing is known. */
export function mapsQuery(place: MapPlace): string | null {
  if (
    typeof place.lat === "number" &&
    typeof place.lng === "number" &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lng)
  )
    return `${place.lat},${place.lng}`;
  const town = [place.postalCode, place.city]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const street = (place.street ?? "").trim();
  // A street alone could be anywhere; it needs at least the postcode or the town.
  if (town === "") return null;
  return [street, town].filter(Boolean).join(", ");
}

/** The place on a map; null when neither coordinates nor a town are known. */
export function mapsSearchUrl(place: MapPlace): string | null {
  const query = mapsQuery(place);
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

/** Directions to the place from where the phone is ("Route"); null like `mapsSearchUrl`. */
export function mapsRouteUrl(place: MapPlace): string | null {
  const query = mapsQuery(place);
  return query
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`
    : null;
}
