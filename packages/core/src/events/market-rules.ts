import { MAX_PRICE_CENTS } from "./details";

/**
 * "Marktregeln": the rules of an event type, and (decision D2-3) the market's own copy of them on its
 * preset. Same shape as `event_type.rules` / `event_preset.rules` in @marktwerk/db.
 */
export type MarketRules = {
  /** Highest share of new goods, 0..1 (0.2 = 20 %). */
  newGoodsMaxShare: number;
  bannedGoods: string[];
  onlineBookingAllowed: boolean;
  defaultPricePerMCents: number | null;
  defaultBookingFeeCents: number | null;
  vendorContractModel: "per_event" | "yearly_contract";
};

export type MarketRulesError = "invalid_input" | "invalid_share" | "invalid_banned_goods";

export const MAX_BANNED_GOODS = 50;
export const MAX_BANNED_GOOD_LENGTH = 100;

const CONTRACT_MODELS = ["per_event", "yearly_contract"] as const;

const isPrice = (value: unknown) =>
  value === null ||
  (typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PRICE_CENTS);

/**
 * Checks and normalises rules from a form or an action: banned goods are trimmed, blanks dropped and
 * duplicates (ignoring case) removed; the share is rounded to whole basis points. Anything that isn't
 * the rules shape is "invalid_input".
 */
export function normalizeMarketRules(
  input: unknown,
): { ok: true; rules: MarketRules } | { ok: false; error: MarketRulesError } {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    return { ok: false, error: "invalid_input" };
  const raw = input as Record<string, unknown>;
  if (
    typeof raw.onlineBookingAllowed !== "boolean" ||
    !isPrice(raw.defaultPricePerMCents) ||
    !isPrice(raw.defaultBookingFeeCents) ||
    !CONTRACT_MODELS.includes(raw.vendorContractModel as MarketRules["vendorContractModel"])
  )
    return { ok: false, error: "invalid_input" };

  const share = raw.newGoodsMaxShare;
  if (typeof share !== "number" || !Number.isFinite(share) || share < 0 || share > 1)
    return { ok: false, error: "invalid_share" };

  if (!Array.isArray(raw.bannedGoods) || !raw.bannedGoods.every((g) => typeof g === "string"))
    return { ok: false, error: "invalid_input" };
  const seen = new Set<string>();
  const bannedGoods: string[] = [];
  for (const item of raw.bannedGoods as string[]) {
    const good = item.trim().replace(/\s+/g, " ");
    if (good === "") continue;
    if (good.length > MAX_BANNED_GOOD_LENGTH) return { ok: false, error: "invalid_banned_goods" };
    const folded = good.toLocaleLowerCase("de");
    if (seen.has(folded)) continue;
    seen.add(folded);
    bannedGoods.push(good);
  }
  if (bannedGoods.length > MAX_BANNED_GOODS) return { ok: false, error: "invalid_banned_goods" };

  return {
    ok: true,
    rules: {
      newGoodsMaxShare: Math.round(share * 10_000) / 10_000,
      bannedGoods,
      onlineBookingAllowed: raw.onlineBookingAllowed,
      defaultPricePerMCents: raw.defaultPricePerMCents as number | null,
      defaultBookingFeeCents: raw.defaultBookingFeeCents as number | null,
      vendorContractModel: raw.vendorContractModel as MarketRules["vendorContractModel"],
    },
  };
}

/** Same rules, field by field (banned goods in order). */
export function sameMarketRules(a: MarketRules, b: MarketRules): boolean {
  return (
    a.newGoodsMaxShare === b.newGoodsMaxShare &&
    a.onlineBookingAllowed === b.onlineBookingAllowed &&
    a.defaultPricePerMCents === b.defaultPricePerMCents &&
    a.defaultBookingFeeCents === b.defaultBookingFeeCents &&
    a.vendorContractModel === b.vendorContractModel &&
    a.bannedGoods.length === b.bannedGoods.length &&
    a.bannedGoods.every((good, i) => good === b.bannedGoods[i])
  );
}

/** A share typed as percent ("20", "12,5", "20 %") → 0..1; null if it isn't a number from 0 to 100. */
export function parseSharePercent(input: string): number | null {
  const s = input.replace(/\s|%/g, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const percent = Number(s);
  return percent >= 0 && percent <= 100 ? Math.round(percent * 100) / 10_000 : null;
}

/** 0.125 → "12,5" (decimal comma) or "12.5": the way a share is typed back into a field. */
export function shareToPercentInput(share: number, decimalComma = true): string {
  const text = String(Math.round(share * 10_000) / 100);
  return decimalComma ? text.replace(".", ",") : text;
}

/** One banned good per line (the dialog's text area) → the list; blank lines are dropped. */
export function parseBannedGoods(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
