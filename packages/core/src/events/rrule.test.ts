import { describe, expect, it } from "vitest";
import { expandRRule, parseRRule } from "./rrule";

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
