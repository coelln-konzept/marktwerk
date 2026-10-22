import { describe, expect, it } from "vitest";
import { businessDate } from "./business-date";

describe("businessDate", () => {
  it("uses the Berlin calendar day, not UTC", () => {
    expect(businessDate(new Date("2026-10-30T22:30:00Z"))).toBe("2026-10-30");
    expect(businessDate(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
    // Summer time: UTC+2.
    expect(businessDate(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
  });

  it("follows daylight saving changes", () => {
    expect(businessDate(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    expect(businessDate(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
  });
});
