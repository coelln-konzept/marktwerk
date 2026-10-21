import { describe, expect, it } from "vitest";
import {
  addDays,
  berlinInstant,
  isBerlinSummerTime,
  lastSunday,
  mondayBefore,
  weekendSaturdaysTouched,
} from "./dates";

describe("Europe/Berlin conversion", () => {
  it("finds the last Sunday of March and October", () => {
    expect(lastSunday(2026, 3)).toBe("2026-03-29");
    expect(lastSunday(2026, 10)).toBe("2026-10-25");
  });

  it("switches to summer time on the last Sunday of March", () => {
    expect(isBerlinSummerTime("2026-03-28")).toBe(false);
    expect(isBerlinSummerTime("2026-03-29")).toBe(true);
    expect(berlinInstant("2026-03-28", "09:00")).toBe("2026-03-28T08:00:00.000Z");
    expect(berlinInstant("2026-03-29", "09:00")).toBe("2026-03-29T07:00:00.000Z");
  });

  it("switches back to winter time on the last Sunday of October", () => {
    expect(isBerlinSummerTime("2026-10-24")).toBe(true);
    expect(isBerlinSummerTime("2026-10-25")).toBe(false);
    expect(berlinInstant("2026-10-24", "09:00")).toBe("2026-10-24T07:00:00.000Z");
    expect(berlinInstant("2026-10-25", "09:00")).toBe("2026-10-25T08:00:00.000Z");
  });

  it("does not depend on the machine time zone for calendar arithmetic", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("booking cut-off and weekends", () => {
  it("returns the Monday before, and a week earlier for a Monday event", () => {
    expect(mondayBefore("2026-10-25")).toBe("2026-10-19"); // Sunday event
    expect(mondayBefore("2026-10-31")).toBe("2026-10-26"); // Saturday event
    expect(mondayBefore("2026-10-26")).toBe("2026-10-19"); // Monday event
  });

  it("lists the weekends a range touches", () => {
    expect(weekendSaturdaysTouched("2026-07-10", "2026-07-12")).toEqual(["2026-07-11"]);
    expect(weekendSaturdaysTouched("2026-10-31", "2026-11-01")).toEqual(["2026-10-31"]);
  });
});
