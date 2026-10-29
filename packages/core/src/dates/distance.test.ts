import { describe, expect, it } from "vitest";
import { dayDistance } from "./distance";

describe("dayDistance", () => {
  it("says today, and one day either way in days", () => {
    expect(dayDistance("2026-10-29", "2026-10-29")).toEqual({ when: "today" });
    expect(dayDistance("2026-10-30", "2026-10-29")).toEqual({
      when: "future",
      unit: "day",
      count: 1,
    });
    expect(dayDistance("2026-10-28", "2026-10-29")).toEqual({
      when: "past",
      unit: "day",
      count: 1,
    });
  });

  it("counts days up to 14, then whole weeks, then whole months", () => {
    expect(dayDistance("2026-11-12", "2026-10-29")).toEqual({
      when: "future",
      unit: "day",
      count: 14,
    });
    expect(dayDistance("2026-11-13", "2026-10-29")).toEqual({
      when: "future",
      unit: "week",
      count: 2,
    });
    expect(dayDistance("2026-08-31", "2026-10-29")).toEqual({
      when: "past",
      unit: "week",
      count: 8,
    });
    expect(dayDistance("2026-08-30", "2026-10-29")).toEqual({
      when: "past",
      unit: "month",
      count: 2,
    });
    expect(dayDistance("2027-05-01", "2026-10-29")).toEqual({
      when: "future",
      unit: "month",
      count: 6,
    });
  });

  it("does not drift across DST changes and the year end", () => {
    // 25.10.2026: clocks go back; 28.03.2027: clocks go forward.
    expect(dayDistance("2026-10-26", "2026-10-24")).toEqual({
      when: "future",
      unit: "day",
      count: 2,
    });
    expect(dayDistance("2027-03-29", "2027-03-27")).toEqual({
      when: "future",
      unit: "day",
      count: 2,
    });
    expect(dayDistance("2027-01-01", "2026-12-31")).toEqual({
      when: "future",
      unit: "day",
      count: 1,
    });
  });
});
