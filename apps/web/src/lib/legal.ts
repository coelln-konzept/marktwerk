import { formatMoney, formatNumber } from "./format";

/**
 * `legal_parameter` stores a bare integer per key. The unit follows from the key's naming scheme
 * (`..._cents_per_hour`, `..._cents_per_month`, `..._months_...`, `..._factor`); unknown keys show the plain number.
 */
export type LegalUnit = "money_hour" | "money_month" | "money" | "months" | "factor" | "plain";

export function legalUnit(key: string): LegalUnit {
  if (key.endsWith("_cents_per_hour")) return "money_hour";
  if (key.endsWith("_cents_per_month")) return "money_month";
  if (key.includes("_cents")) return "money";
  if (key.includes("_months")) return "months";
  if (key.endsWith("_factor")) return "factor";
  return "plain";
}

/** The number part: money as "13,90 €", everything else as a German-formatted number. */
export function formatLegalAmount(key: string, value: number, locale: string): string {
  const unit = legalUnit(key);
  return unit === "money_hour" || unit === "money_month" || unit === "money"
    ? formatMoney(value, locale)
    : formatNumber(value, locale, 2);
}
