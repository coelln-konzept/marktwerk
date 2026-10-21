/** Longest length or width we accept: 10 km in centimetres (fits an int4 with room to spare). */
export const MAX_LENGTH_CM = 1_000_000;

/**
 * Metres as people type them ("4,5", "4.5", "4,50 m", "12") to integer centimetres, or null for
 * anything that isn't a plain non-negative length with at most two decimals. Like `parseEuroCents`, a
 * single dot followed by exactly three figures is a thousands separator ("1.250" = 1250 m).
 */
export function parseMetresToCm(input: string): number | null {
  let s = input.replace(/\s/g, "").replace(/m$/i, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = "0", fraction = ""] = s.split(".");
  const cm = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cm) && cm <= MAX_LENGTH_CM ? cm : null;
}

/**
 * Centimetres as the shortest metre text that reads back the same ("4,5", "4", "4,25"): comma for
 * German, dot for English. No unit and no thousands separator, so it fits an input field.
 */
export function formatMetres(cm: number, locale = "de"): string {
  const text = String(cm / 100);
  return locale === "en" ? text : text.replace(".", ",");
}

/** Latitude and longitude as typed ("50,9375", "6.96"); null if not a number in range. */
export function parseCoordinate(input: string, axis: "lat" | "lng"): number | null {
  const s = input.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const value = Number(s);
  const limit = axis === "lat" ? 90 : 180;
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

/** Coordinates for an input field: comma for German, dot for English. */
export function formatCoordinate(value: number, locale = "de"): string {
  const text = String(value);
  return locale === "en" ? text : text.replace(".", ",");
}

/** German postal codes have five figures. */
export function isPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value);
}

/** Federal states (ISO 3166-2:DE without the prefix). Holidays are only known for "NW" so far. */
export const BUNDESLAENDER = [
  "BW",
  "BY",
  "BE",
  "BB",
  "HB",
  "HH",
  "HE",
  "MV",
  "NI",
  "NW",
  "RP",
  "SL",
  "SN",
  "ST",
  "SH",
  "TH",
] as const;
export type BundeslandCode = (typeof BUNDESLAENDER)[number];

export const isBundesland = (value: string): value is BundeslandCode =>
  (BUNDESLAENDER as readonly string[]).includes(value);
