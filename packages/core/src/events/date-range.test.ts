import { describe, expect, it } from "vitest";
import { clampToLookupRange, eventDateRange, isInEventDateRange } from "./date-range";

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

describe("clampToLookupRange", () => {
  it("keeps a window inside the range as it is, also years outside the plannable ones", () => {
    expect(clampToLookupRange("2027-03-01", "2027-03-31")).toEqual({
      from: "2027-03-01",
      to: "2027-03-31",
    });
    expect(clampToLookupRange("2035-06-01", "2035-06-30")).toEqual({
      from: "2035-06-01",
      to: "2035-06-30",
    });
    expect(clampToLookupRange("2020-01-01", "2020-01-31")).toEqual({
      from: "2020-01-01",
      to: "2020-01-31",
    });
  });

  it("cuts a window that sticks out at either end, so ± a week stays four-digit", () => {
    expect(clampToLookupRange("9998-12-24", "9999-12-31")).toEqual({
      from: "9998-12-24",
      to: "9998-12-31",
    });
    expect(clampToLookupRange("0999-12-25", "1000-01-07")).toEqual({
      from: "1000-01-01",
      to: "1000-01-07",
    });
  });

  it("returns null when nothing is left or a bound is no date", () => {
    expect(clampToLookupRange("9999-12-24", "9999-12-31")).toBeNull();
    expect(clampToLookupRange("0001-01-01", "0001-01-08")).toBeNull();
    expect(clampToLookupRange("2027-03-31", "2027-03-01")).toBeNull();
    expect(clampToLookupRange("abc", "2027-03-01")).toBeNull();
  });
});
