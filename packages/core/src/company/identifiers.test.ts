import { describe, expect, it } from "vitest";
import {
  formatIban,
  isValidBic,
  isValidIban,
  isValidVatId,
  normalizeBic,
  normalizeIban,
  normalizeVatId,
} from "./identifiers";

describe("IBAN", () => {
  it("accepts valid IBANs, with spaces and lower case", () => {
    expect(isValidIban("DE02120300000000202051")).toBe(true);
    expect(isValidIban("de02 1203 0000 0000 2020 51")).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
  });

  it("rejects a wrong checksum, wrong length and garbage", () => {
    expect(isValidIban("DE02120300000000202052")).toBe(false);
    expect(isValidIban("DE0212030000000020205")).toBe(false);
    expect(isValidIban("DE021203000000002020511")).toBe(false);
    expect(isValidIban("1234")).toBe(false);
    expect(isValidIban("")).toBe(false);
  });

  it("normalises and formats", () => {
    expect(normalizeIban(" de02 1203 0000 0000 2020 51 ")).toBe("DE02120300000000202051");
    expect(formatIban("DE02120300000000202051")).toBe("DE02 1203 0000 0000 2020 51");
  });
});

describe("BIC", () => {
  it("accepts 8 and 11 character codes", () => {
    expect(isValidBic("DEMODEM1XXX")).toBe(true);
    expect(isValidBic("demodem1")).toBe(true);
    expect(isValidBic("BELADEBE")).toBe(true);
    expect(normalizeBic(" belade be ")).toBe("BELADEBE");
  });

  it("rejects other lengths and characters", () => {
    expect(isValidBic("DEMODEM")).toBe(false);
    expect(isValidBic("DEMODEM1XX")).toBe(false);
    expect(isValidBic("1EMODEM1")).toBe(false);
  });
});

describe("USt-IdNr.", () => {
  it("checks German numbers exactly and others loosely", () => {
    expect(isValidVatId("DE999999999")).toBe(true);
    expect(isValidVatId("de 123 456 789")).toBe(true);
    expect(isValidVatId("DE12345678")).toBe(false);
    expect(isValidVatId("ATU12345678")).toBe(true);
    expect(isValidVatId("X")).toBe(false);
    expect(normalizeVatId("de 123 456 789")).toBe("DE123456789");
  });
});
