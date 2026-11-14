import { describe, expect, it } from "vitest";
import { clampToEventDateRange, eventDateRange, isInEventDateRange } from "./date-range";

describe("eventDateRange", () => {
  it("runs from 1 January last year to 31 December five years ahead", () => {
    expect(eventDateRange("2026-11-13")).toEqual({
      min: "2025-01-01",
      max: "2031-12-31",
      minYear: 2025,
      maxYear: 2031,
    });
  });

  it("moves with the year, also on New Year's Eve and Day", () => {
    expect(eventDateRange("2026-12-31").max).toBe("2031-12-31");
    expect(eventDateRange("2027-01-01")).toMatchObject({ min: "2026-01-01", max: "2032-12-31" });
  });
});

describe("isInEventDateRange", () => {
  const today = "2026-11-13";

  it("accepts the bounds and everything between", () => {
    expect(isInEventDateRange("2025-01-01", today)).toBe(true);
    expect(isInEventDateRange("2026-11-13", today)).toBe(true);
    expect(isInEventDateRange("2031-12-31", today)).toBe(true);
  });

  it("rejects typos far away and the days just outside", () => {
    for (const date of ["9999-12-31", "0001-01-01", "2024-12-31", "2032-01-01"])
      expect(isInEventDateRange(date, today)).toBe(false);
  });

  it("rejects what is not a calendar day", () => {
    for (const date of ["", "2027-02-30", "31.12.2027", "+010000-01-01", "2027-1-5"])
      expect(isInEventDateRange(date, today)).toBe(false);
  });
});

describe("clampToEventDateRange", () => {
  const today = "2026-11-13";

  it("keeps a window inside the range as it is", () => {
    expect(clampToEventDateRange("2027-03-01", "2027-03-31", today)).toEqual({
      from: "2027-03-01",
      to: "2027-03-31",
    });
  });

  it("cuts a window that sticks out at either end", () => {
    expect(clampToEventDateRange("2031-12-24", "2032-01-07", today)).toEqual({
      from: "2031-12-24",
      to: "2031-12-31",
    });
    expect(clampToEventDateRange("2024-12-25", "2025-01-07", today)).toEqual({
      from: "2025-01-01",
      to: "2025-01-07",
    });
  });

  it("returns null when nothing is left or a bound is no date", () => {
    expect(clampToEventDateRange("9999-12-24", "9999-12-31", today)).toBeNull();
    expect(clampToEventDateRange("0001-01-01", "0001-01-08", today)).toBeNull();
    expect(clampToEventDateRange("2027-03-31", "2027-03-01", today)).toBeNull();
    expect(clampToEventDateRange("abc", "2027-03-01", today)).toBeNull();
  });
});
