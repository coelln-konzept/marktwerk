import { describe, expect, it } from "vitest";
import {
  CALENDAR_YEAR_MAX,
  CALENDAR_YEAR_MIN,
  parseCalendarDay,
  parseCalendarJump,
  parseCalendarMonth,
  parseCalendarYear,
  shiftCalendarMonth,
} from "./calendar-range";

const TODAY = "2026-11-14";
const day = (date: string) => ({ ok: true, month: date.slice(0, 7), date });
const month = (m: string) => ({ ok: true, month: m, date: null });

describe("Kalender range (UX-041)", () => {
  it("pulls far years to the nearest end instead of running past year 9999", () => {
    expect(parseCalendarMonth("9999-12")).toEqual({
      month: `${CALENDAR_YEAR_MAX}-12`,
      clamped: true,
    });
    expect(parseCalendarMonth("0001-05")).toEqual({
      month: `${CALENDAR_YEAR_MIN}-01`,
      clamped: true,
    });
    expect(parseCalendarMonth("2027-03")).toEqual({ month: "2027-03", clamped: false });
    expect(parseCalendarYear("9999")).toEqual({ year: CALENDAR_YEAR_MAX, clamped: true });
    expect(parseCalendarYear("1999")).toEqual({ year: CALENDAR_YEAR_MIN, clamped: true });
    expect(parseCalendarYear("2026")).toEqual({ year: 2026, clamped: false });
    expect(parseCalendarDay("9999-12-31")).toEqual({ date: "2100-12-31", clamped: true });
    expect(parseCalendarDay("2026-02-28")).toEqual({ date: "2026-02-28", clamped: false });
  });

  it("treats malformed values as no value", () => {
    for (const v of [undefined, "", "2026-13", "2026-1", "abc", "99999-01"])
      expect(parseCalendarMonth(v)).toBeNull();
    for (const v of [undefined, "26", "20266", "x"]) expect(parseCalendarYear(v)).toBeNull();
    for (const v of [undefined, "2026-02-30", "2026-2-1"]) expect(parseCalendarDay(v)).toBeNull();
  });

  it("steps months across the year and stops at the ends", () => {
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftCalendarMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftCalendarMonth(`${CALENDAR_YEAR_MAX}-12`, 1)).toBeNull();
    expect(shiftCalendarMonth(`${CALENDAR_YEAR_MIN}-01`, -1)).toBeNull();
  });
});

describe("parseCalendarJump (UX-051)", () => {
  it("reads German day formats, with and without a year", () => {
    expect(parseCalendarJump("14.3.2027", TODAY)).toEqual(day("2027-03-14"));
    expect(parseCalendarJump("14.03.27", TODAY)).toEqual(day("2027-03-14"));
    expect(parseCalendarJump("5.3.", TODAY)).toEqual(day("2026-03-05"));
    expect(parseCalendarJump(" 5.3 ", TODAY)).toEqual(day("2026-03-05"));
    expect(parseCalendarJump("14. März 2027", TODAY)).toEqual(day("2027-03-14"));
    expect(parseCalendarJump("2027-03-14", TODAY)).toEqual(day("2027-03-14"));
    expect(parseCalendarJump("Heute", TODAY)).toEqual(day(TODAY));
  });

  it("reads months", () => {
    expect(parseCalendarJump("3.2027", TODAY)).toEqual(month("2027-03"));
    expect(parseCalendarJump("03/2027", TODAY)).toEqual(month("2027-03"));
    expect(parseCalendarJump("3/27", TODAY)).toEqual(month("2027-03"));
    expect(parseCalendarJump("März 2027", TODAY)).toEqual(month("2027-03"));
    expect(parseCalendarJump("dez.", TODAY)).toEqual(month("2026-12"));
    expect(parseCalendarJump("2027-03", TODAY)).toEqual(month("2027-03"));
    expect(parseCalendarJump("2028", TODAY)).toEqual(month("2028-01"));
  });

  it("rejects impossible dates and years outside the Kalender", () => {
    expect(parseCalendarJump("30.2.2027", TODAY)).toEqual({ ok: false, error: "invalid" });
    expect(parseCalendarJump("29.2.2028", TODAY)).toEqual(day("2028-02-29"));
    expect(parseCalendarJump("13.2027", TODAY)).toEqual({ ok: false, error: "invalid" });
    expect(parseCalendarJump("irgendwann", TODAY)).toEqual({ ok: false, error: "invalid" });
    expect(parseCalendarJump("", TODAY)).toEqual({ ok: false, error: "invalid" });
    expect(parseCalendarJump("31.12.9999", TODAY)).toEqual({ ok: false, error: "range" });
    expect(parseCalendarJump("1.1.0001", TODAY)).toEqual({ ok: false, error: "range" });
    expect(parseCalendarJump("9999", TODAY)).toEqual({ ok: false, error: "range" });
  });
});
