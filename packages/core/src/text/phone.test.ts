import { describe, expect, it } from "vitest";
import { isValidEmail } from "./email";
import { formatPhone, isGermanE164, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("turns national numbers into E.164", () => {
    expect(normalizePhone("0221 123456")).toBe("+49221123456");
    expect(normalizePhone("0221/123456")).toBe("+49221123456");
    expect(normalizePhone("(0221) 12 34-56")).toBe("+49221123456");
    expect(normalizePhone("0176 04069381")).toBe("+4917604069381");
  });

  it("handles +49 with the optional trunk zero", () => {
    expect(normalizePhone("+49 (0)221 123456")).toBe("+49221123456");
    expect(normalizePhone("+49(0)221123456")).toBe("+49221123456");
    expect(normalizePhone("+49 0221 123456")).toBe("+49221123456");
    expect(normalizePhone("+49 221 123456")).toBe("+49221123456");
    expect(normalizePhone("+49-221-123456")).toBe("+49221123456");
  });

  it("handles the 0049 prefix", () => {
    expect(normalizePhone("0049 221 123456")).toBe("+49221123456");
    expect(normalizePhone("0049 (0) 221 123456")).toBe("+49221123456");
  });

  it("keeps everything else as typed, trimmed", () => {
    expect(normalizePhone("  +43 1 5336000  ")).toBe("+43 1 5336000");
    expect(normalizePhone("0043 1 5336000")).toBe("0043 1 5336000");
    expect(normalizePhone("112")).toBe("112");
    expect(normalizePhone("0221 123456 Frau Meier")).toBe("0221 123456 Frau Meier");
    expect(normalizePhone("0221 12")).toBe("0221 12");
    expect(normalizePhone("+49 1")).toBe("+49 1");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("   ")).toBe("");
  });

  it("is idempotent", () => {
    for (const value of ["0221 123456", "+49 (0)221 123456", "+43 1 5336000", "abc"]) {
      expect(normalizePhone(normalizePhone(value))).toBe(normalizePhone(value));
    }
  });
});

describe("formatPhone", () => {
  it("groups German numbers by area code", () => {
    expect(formatPhone("+493023125555")).toBe("+49 30 23125555");
    expect(formatPhone("+49221123456")).toBe("+49 221 123456");
    expect(formatPhone("+4917604069381")).toBe("+49 176 04069381");
  });

  it("shows anything else as stored", () => {
    expect(formatPhone("+43 1 5336000")).toBe("+43 1 5336000");
    expect(formatPhone("0221 12")).toBe("0221 12");
  });
});

describe("isGermanE164", () => {
  it("recognises normalised numbers only", () => {
    expect(isGermanE164("+49221123456")).toBe(true);
    expect(isGermanE164("0221 123456")).toBe(false);
    expect(isGermanE164("+43 1 5336000")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("info@stadt-koeln.de")).toBe(true);
    expect(isValidEmail("  a.b+c@mail.example.org ")).toBe(true);
  });

  it("rejects obvious mistakes", () => {
    for (const bad of [
      "",
      "info",
      "info@",
      "@x.de",
      "a b@x.de",
      "a@x",
      "a@@x.de",
      "a@x..de",
      "a@x.d",
    ]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });
});
