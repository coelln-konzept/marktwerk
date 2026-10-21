import { MAX_MONEY_CENTS } from "./installments";

/**
 * Euro amount as typed ("12", "12,5", "12,50 €", "1.234,50", "12.50") → integer cents; null if it isn't an
 * amount, is negative or above `maxCents`. A single dot followed by exactly three digits is a thousands
 * separator ("1.500" = 1500 €), otherwise a dot is a decimal point. Same rules as `parseEuroCents`, but
 * with the higher limit that payables need (a location fee is not a stall price).
 */
export function parseMoneyCents(input: string, maxCents = MAX_MONEY_CENTS): number | null {
  let s = input.replace(/\s|€/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = "0", fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= maxCents ? cents : null;
}

/** 123456 → "1234,56" (decimal comma) or "1234.56": the way an amount is typed back into a field. */
export function centsToInput(cents: number, decimalComma = true): string {
  const text = (cents / 100).toFixed(2);
  return decimalComma ? text.replace(".", ",") : text;
}

/** VAT rate typed as percent ("19", "7", "19,5") → basis points (1900); null if not between 0 and 100. */
export function parseVatRateBp(input: string): number | null {
  const s = input.replace(/\s|%/g, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const bp = Math.round(Number(s) * 100);
  return bp >= 0 && bp <= 10_000 ? bp : null;
}
