import { describe, expect, it } from "vitest";
import { MAX_COST_CENTS, parseCostCents, parseWholeNumber } from "./input";

describe("parseWholeNumber", () => {
  it("reads plain and German-formatted whole numbers", () => {
    expect(parseWholeNumber("90000")).toBe(90_000);
    expect(parseWholeNumber("90.000")).toBe(90_000);
    expect(parseWholeNumber("1.234.567")).toBe(1_234_567);
    expect(parseWholeNumber(" 90 000 km ")).toBe(90_000);
    expect(parseWholeNumber("3500 kg")).toBe(3500);
    expect(parseWholeNumber("0")).toBe(0);
  });

  it("rejects decimals, signs, odd separators and text", () => {
    for (const bad of ["", "9,5", "9.5", "-5", "+5", "1.23", "1.2345", "abc", "12a"])
      expect(parseWholeNumber(bad)).toBeNull();
  });
});

describe("parseCostCents", () => {
  it("reads euro amounts in German and plain notation", () => {
    expect(parseCostCents("12")).toBe(1200);
    expect(parseCostCents("12,5")).toBe(1250);
    expect(parseCostCents("12,50 €")).toBe(1250);
    expect(parseCostCents("1.234,50")).toBe(123_450);
    expect(parseCostCents("12.50")).toBe(1250);
    expect(parseCostCents("1.500")).toBe(150_000);
    expect(parseCostCents("0")).toBe(0);
  });

  it("allows costs well above the event price limit, but not absurd ones", () => {
    expect(parseCostCents("25.000,00")).toBe(2_500_000);
    expect(parseCostCents("1.000.000")).toBe(MAX_COST_CENTS);
    expect(parseCostCents("1.000.001")).toBeNull();
  });

  it("rejects negatives, text and too many decimals", () => {
    for (const bad of ["", "-1", "abc", "1,234", "1,2,3"]) expect(parseCostCents(bad)).toBeNull();
  });
});
