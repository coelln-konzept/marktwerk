import { describe, expect, it } from "vitest";
import {
  addDays,
  bookingCutoff,
  daysBetween,
  eachDay,
  isIsoDate,
  isoWeek,
  mondayOf,
  weekday,
  weekendsTouched,
} from "./calendar";

describe("calendar arithmetic", () => {
  it("adds days across month, year and DST boundaries without drifting", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29"); // spring forward night
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26"); // fall back on the 25th
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });

  it("rejects impossible dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("2026-05-16")).toBe(true);
    expect(() => addDays("2026-13-01", 1)).toThrow();
  });

  it("knows weekdays and Monday-based weeks", () => {
    expect(weekday("2026-05-16")).toBe(6); // Saturday
    expect(mondayOf("2026-05-17")).toBe("2026-05-11"); // Sunday belongs to the week before
    expect(eachDay("2026-08-21", "2026-08-23")).toEqual(["2026-08-21", "2026-08-22", "2026-08-23"]);
    expect(eachDay("2026-08-23", "2026-08-21")).toEqual([]);
  });

  it("computes ISO calendar weeks (KW)", () => {
    expect(isoWeek("2026-05-13")).toEqual({ year: 2026, week: 20 });
    expect(isoWeek("2026-06-07")).toEqual({ year: 2026, week: 23 });
    expect(isoWeek("2025-12-29")).toEqual({ year: 2026, week: 1 }); // belongs to next year
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 }); // 2026 has 53 weeks
    expect(isoWeek("2027-01-04")).toEqual({ year: 2027, week: 1 });
  });

  it("puts the booking cut-off on the Monday before the event", () => {
    expect(bookingCutoff("2026-05-16")).toBe("2026-05-11"); // Saturday
    expect(bookingCutoff("2026-05-17")).toBe("2026-05-11"); // Sunday
    expect(bookingCutoff("2026-05-18")).toBe("2026-05-11"); // Monday → one week earlier
    expect(bookingCutoff("2026-08-21")).toBe("2026-08-17"); // Friday (Stadtfest)
  });

  it("identifies the weekends an event touches by their Saturday", () => {
    expect(weekendsTouched("2026-05-17", "2026-05-17")).toEqual(["2026-05-16"]);
    expect(weekendsTouched("2026-08-21", "2026-08-23")).toEqual(["2026-08-22"]);
    expect(weekendsTouched("2026-05-13", "2026-05-13")).toEqual([]); // Wednesday
    expect(weekendsTouched("2026-05-17", "2026-05-23")).toEqual(["2026-05-16", "2026-05-23"]);
  });
});
