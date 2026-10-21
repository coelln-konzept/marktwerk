import { describe, expect, it } from "vitest";
import { expandRRule } from "./rrule";

describe("expandRRule", () => {
  it("expands monthly first-Sunday rules within a season", () => {
    const dates = expandRRule(
      "FREQ=MONTHLY;BYMONTH=4,5;BYDAY=SU;BYSETPOS=1",
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual(["2026-04-05", "2026-05-03"]);
  });

  it("supports negative set positions (last Saturday)", () => {
    const dates = expandRRule(
      "FREQ=MONTHLY;BYMONTH=10;BYDAY=SA;BYSETPOS=-1",
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual(["2026-10-31"]);
  });

  it("expands yearly rules and clips to the range", () => {
    const dates = expandRRule(
      "FREQ=YEARLY;BYMONTH=6,9;BYDAY=SA;BYSETPOS=1",
      "2026-07-01",
      "2027-12-31",
    );
    expect(dates).toEqual(["2026-09-05", "2027-06-05", "2027-09-04"]);
  });

  it("rejects parts it does not support", () => {
    expect(() => expandRRule("FREQ=WEEKLY;BYDAY=SU", "2026-01-01", "2026-12-31")).toThrow();
    expect(() =>
      expandRRule("FREQ=MONTHLY;BYDAY=SU;INTERVAL=2", "2026-01-01", "2026-12-31"),
    ).toThrow();
  });
});
