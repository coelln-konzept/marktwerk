import { describe, expect, it } from "vitest";
import {
  addDays,
  bookingCutoff,
  daysBetween,
  eachDay,
  isIsoDate,
  isoWeek,
  mondayOf,
  monthWeeks,
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

describe("monthWeeks", () => {
  it("lays a month out Monday to Sunday with its KW, neighbour days empty", () => {
    // March 2027 starts on a Monday and ends on a Wednesday: five rows, KW 9–13.
    const march = monthWeeks(2027, 3);
    expect(march.map((w) => w.week)).toEqual([9, 10, 11, 12, 13]);
    expect(march[0]?.days).toEqual(eachDay("2027-03-01", "2027-03-07"));
    expect(march.at(-1)?.days).toEqual([
      "2027-03-29",
      "2027-03-30",
      "2027-03-31",
      null,
      null,
      null,
      null,
    ]);
  });

  it("uses the ISO week across the year boundary and needs six rows when the month asks for it", () => {
    // 1 January 2027 is a Friday in KW 53 of 2026.
    const january = monthWeeks(2027, 1);
    expect(january[0]).toEqual({
      week: 53,
      days: [null, null, null, null, "2027-01-01", "2027-01-02", "2027-01-03"],
    });
    expect(january).toHaveLength(5);
    // May 2027: Saturday the 1st to Monday the 31st, six rows.
    expect(monthWeeks(2027, 5)).toHaveLength(6);
    // February 2027 starts on a Monday and has exactly four weeks.
    expect(monthWeeks(2027, 2)).toHaveLength(4);
    // December 2026 ends in KW 53.
    expect(monthWeeks(2026, 12).at(-1)?.week).toBe(53);
    // Every day of a leap February exactly once.
    expect(monthWeeks(2028, 2).flatMap((w) => w.days.filter(Boolean))).toHaveLength(29);
  });
});
