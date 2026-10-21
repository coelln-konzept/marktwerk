/**
 * Parsing of what the office types into the Firma forms. Pure functions: a value that isn't usable gives null
 * (the form shows its error), an empty field is handled by the caller before it gets here.
 */

/**
 * A whole number as typed in Germany: "90000", "90.000", "90 000", "90.000 km" -> 90000. A dot only counts as a
 * thousands separator (groups of exactly three digits); decimals and signs are rejected.
 */
export function parseWholeNumber(input: string): number | null {
  const s = input.replace(/\s|km|kg/gi, "");
  if (!/^\d+$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
  const value = Number(s.replace(/\./g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

/** Upper bound for what one completion may cost (1.000.000 €), well above the 10.000 € of event prices. */
export const MAX_COST_CENTS = 100_000_000;

/**
 * A cost in euros as typed ("12", "12,5", "1.234,50 €", "12.50") -> integer cents; null if it isn't an amount.
 * A single dot followed by exactly three digits is a thousands separator ("1.500" = 1500 EUR).
 */
export function parseCostCents(input: string): number | null {
  let s = input.replace(/\s|€/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = "0", fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_COST_CENTS ? cents : null;
}
