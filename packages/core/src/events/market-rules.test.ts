import { describe, expect, it } from "vitest";
import {
  MAX_BANNED_GOOD_LENGTH,
  MAX_BANNED_GOODS,
  type MarketRules,
  normalizeMarketRules,
  parseBannedGoods,
  parseSharePercent,
  sameMarketRules,
  shareToPercentInput,
} from "./market-rules";

const valid: MarketRules = {
  newGoodsMaxShare: 0.2,
  bannedGoods: ["Waffen", "Tiere"],
  onlineBookingAllowed: true,
  defaultPricePerMCents: 1200,
  defaultBookingFeeCents: null,
  vendorContractModel: "per_event",
};

const errorOf = (patch: Record<string, unknown>) => {
  const result = normalizeMarketRules({ ...valid, ...patch });
  return result.ok ? null : result.error;
};

describe("normalizeMarketRules", () => {
  it("accepts valid rules unchanged", () => {
    expect(normalizeMarketRules(valid)).toEqual({ ok: true, rules: valid });
  });

  it("trims banned goods, drops blanks and case-insensitive duplicates", () => {
    const result = normalizeMarketRules({
      ...valid,
      bannedGoods: ["  Waffen ", "", "   ", "waffen", "Lebende  Tiere", "Ölgemälde", "ÖLGEMÄLDE"],
    });
    expect(result).toEqual({
      ok: true,
      rules: { ...valid, bannedGoods: ["Waffen", "Lebende Tiere", "Ölgemälde"] },
    });
  });

  it("checks the share range 0..1 and rounds to basis points", () => {
    expect(errorOf({ newGoodsMaxShare: -0.01 })).toBe("invalid_share");
    expect(errorOf({ newGoodsMaxShare: 1.01 })).toBe("invalid_share");
    expect(errorOf({ newGoodsMaxShare: Number.NaN })).toBe("invalid_share");
    expect(errorOf({ newGoodsMaxShare: "0.2" })).toBe("invalid_share");
    expect(errorOf({ newGoodsMaxShare: 0 })).toBeNull();
    expect(errorOf({ newGoodsMaxShare: 1 })).toBeNull();
    const result = normalizeMarketRules({ ...valid, newGoodsMaxShare: 0.123456 });
    expect(result.ok && result.rules.newGoodsMaxShare).toBe(0.1235);
  });

  it("limits the banned goods list", () => {
    expect(errorOf({ bannedGoods: ["x".repeat(MAX_BANNED_GOOD_LENGTH + 1)] })).toBe(
      "invalid_banned_goods",
    );
    expect(errorOf({ bannedGoods: ["x".repeat(MAX_BANNED_GOOD_LENGTH)] })).toBeNull();
    const many = Array.from({ length: MAX_BANNED_GOODS + 1 }, (_, i) => `Ware ${i}`);
    expect(errorOf({ bannedGoods: many })).toBe("invalid_banned_goods");
    expect(errorOf({ bannedGoods: many.slice(1) })).toBeNull();
  });

  it("rejects anything that isn't the rules shape", () => {
    expect(normalizeMarketRules(null)).toEqual({ ok: false, error: "invalid_input" });
    expect(normalizeMarketRules([])).toEqual({ ok: false, error: "invalid_input" });
    expect(normalizeMarketRules("rules")).toEqual({ ok: false, error: "invalid_input" });
    expect(errorOf({ bannedGoods: "Waffen" })).toBe("invalid_input");
    expect(errorOf({ bannedGoods: [1] })).toBe("invalid_input");
    expect(errorOf({ onlineBookingAllowed: "yes" })).toBe("invalid_input");
    expect(errorOf({ defaultPricePerMCents: -1 })).toBe("invalid_input");
    expect(errorOf({ defaultPricePerMCents: 12.5 })).toBe("invalid_input");
    expect(errorOf({ defaultBookingFeeCents: 500 })).toBeNull();
    expect(errorOf({ vendorContractModel: "monthly" })).toBe("invalid_input");
    expect(errorOf({ vendorContractModel: "yearly_contract" })).toBeNull();
  });

  it("drops unknown fields", () => {
    const result = normalizeMarketRules({ ...valid, extra: 1 });
    expect(result).toEqual({ ok: true, rules: valid });
  });
});

describe("sameMarketRules", () => {
  it("compares every field, banned goods in order", () => {
    expect(sameMarketRules(valid, { ...valid, bannedGoods: [...valid.bannedGoods] })).toBe(true);
    expect(sameMarketRules(valid, { ...valid, bannedGoods: ["Tiere", "Waffen"] })).toBe(false);
    expect(sameMarketRules(valid, { ...valid, bannedGoods: ["Waffen"] })).toBe(false);
    expect(sameMarketRules(valid, { ...valid, newGoodsMaxShare: 0.3 })).toBe(false);
    expect(sameMarketRules(valid, { ...valid, onlineBookingAllowed: false })).toBe(false);
    expect(sameMarketRules(valid, { ...valid, defaultBookingFeeCents: 0 })).toBe(false);
    expect(sameMarketRules(valid, { ...valid, vendorContractModel: "yearly_contract" })).toBe(
      false,
    );
  });
});

describe("parseSharePercent / shareToPercentInput", () => {
  it("parses percent as typed", () => {
    expect(parseSharePercent("20")).toBe(0.2);
    expect(parseSharePercent("20 %")).toBe(0.2);
    expect(parseSharePercent("12,5")).toBe(0.125);
    expect(parseSharePercent("12.5")).toBe(0.125);
    expect(parseSharePercent("0")).toBe(0);
    expect(parseSharePercent("100")).toBe(1);
    expect(parseSharePercent("101")).toBeNull();
    expect(parseSharePercent("-5")).toBeNull();
    expect(parseSharePercent("")).toBeNull();
    expect(parseSharePercent("zwanzig")).toBeNull();
  });

  it("formats a share back for the field", () => {
    expect(shareToPercentInput(0.2)).toBe("20");
    expect(shareToPercentInput(0.125)).toBe("12,5");
    expect(shareToPercentInput(0.125, false)).toBe("12.5");
    expect(shareToPercentInput(0)).toBe("0");
    expect(parseSharePercent(shareToPercentInput(0.0725))).toBe(0.0725);
  });
});

describe("parseBannedGoods", () => {
  it("takes one good per line", () => {
    expect(parseBannedGoods("Waffen\r\n\n  Tiere  \n")).toEqual(["Waffen", "Tiere"]);
    expect(parseBannedGoods("")).toEqual([]);
  });
});
