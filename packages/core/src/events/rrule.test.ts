import { describe, expect, it } from "vitest";
import { expandRRule, parseRRule, partsToRRule, rruleToParts } from "./rrule";

describe("expandRRule", () => {
  it("expands monthly first-Sunday rules within a season", () => {
    expect(
      expandRRule("FREQ=MONTHLY;BYMONTH=4,5;BYDAY=SU;BYSETPOS=1", "2026-01-01", "2026-12-31"),
    ).toEqual(["2026-04-05", "2026-05-03"]);
  });

  it("supports the last weekday of a month", () => {
    expect(
      expandRRule("FREQ=MONTHLY;BYMONTH=10;BYDAY=SA;BYSETPOS=-1", "2026-01-01", "2026-12-31"),
    ).toEqual(["2026-10-31"]);
  });

  it("applies BYSETPOS per month for yearly rules and clips to the range", () => {
    expect(
      expandRRule("FREQ=YEARLY;BYMONTH=6,9;BYDAY=SA;BYSETPOS=1", "2026-07-01", "2027-12-31"),
    ).toEqual(["2026-09-05", "2027-06-05", "2027-09-04"]);
  });

  it("skips months without a 5th occurrence", () => {
    expect(
      expandRRule("FREQ=MONTHLY;BYMONTH=4,5;BYDAY=SU;BYSETPOS=5", "2026-01-01", "2026-12-31"),
    ).toEqual(["2026-05-31"]);
  });

  it("returns every matching weekday without BYSETPOS", () => {
    expect(expandRRule("FREQ=MONTHLY;BYDAY=SA,SU", "2026-05-01", "2026-05-10")).toEqual([
      "2026-05-02",
      "2026-05-03",
      "2026-05-09",
      "2026-05-10",
    ]);
  });

  it("rejects parts it does not support", () => {
    expect(() => parseRRule("FREQ=WEEKLY;BYDAY=SU")).toThrow();
    expect(() => parseRRule("FREQ=MONTHLY;BYDAY=SU;INTERVAL=2")).toThrow();
    expect(() => parseRRule("FREQ=MONTHLY;BYDAY=1SU")).toThrow();
    expect(() => parseRRule("FREQ=MONTHLY;BYDAY=SU;BYMONTH=13")).toThrow();
    expect(() => parseRRule("FREQ=MONTHLY;BYDAY=SU;BYSETPOS=0")).toThrow();
    expect(() => parseRRule("FREQ=YEARLY;BYDAY=SU")).toThrow();
  });
});

describe("rrule form parts", () => {
  it("round-trips the usual presets", () => {
    for (const rule of [
      "FREQ=MONTHLY;BYMONTH=4,5,6,7,8,9,10;BYDAY=SU;BYSETPOS=1",
      "FREQ=MONTHLY;BYDAY=SA,SU",
      "FREQ=MONTHLY;BYMONTH=12;BYDAY=SA;BYSETPOS=-1",
    ]) {
      expect(partsToRRule(rruleToParts(rule))).toBe(rule);
    }
  });

  it("reads YEARLY rules as the equivalent MONTHLY ones (same dates)", () => {
    const yearly = "FREQ=YEARLY;BYMONTH=9,6;BYDAY=SA;BYSETPOS=1";
    const parts = rruleToParts(yearly);
    expect(parts).toEqual({ weekdays: [6], setPos: 1, months: [6, 9] });
    const monthly = partsToRRule(parts) as string;
    expect(expandRRule(monthly, "2026-01-01", "2027-12-31")).toEqual(
      expandRRule(yearly, "2026-01-01", "2027-12-31"),
    );
  });

  it("orders weekdays Monday first, drops all-12-months, returns null without weekdays", () => {
    expect(partsToRRule({ weekdays: [0, 6], setPos: null, months: null })).toBe(
      "FREQ=MONTHLY;BYDAY=SA,SU",
    );
    expect(
      partsToRRule({ weekdays: [6], setPos: 2, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    ).toBe("FREQ=MONTHLY;BYDAY=SA;BYSETPOS=2");
    expect(partsToRRule({ weekdays: [], setPos: 1, months: [5] })).toBeNull();
    expect(() => partsToRRule({ weekdays: [6], setPos: 7, months: null })).toThrow();
  });
});
