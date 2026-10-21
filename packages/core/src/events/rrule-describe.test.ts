import { describe, expect, it } from "vitest";
import { describeRRule } from "./rrule-describe";

describe("describeRRule (de)", () => {
  it("describes a monthly n-th weekday with a month span", () => {
    expect(describeRRule("FREQ=MONTHLY;BYMONTH=4,5,6,7,8,9,10;BYDAY=SU;BYSETPOS=1", "de")).toBe(
      "jeden 1. Sonntag, Apr–Okt",
    );
  });

  it("describes the last weekday of the month", () => {
    expect(describeRRule("FREQ=MONTHLY;BYMONTH=4,5,6,7,8,9,10;BYDAY=SA;BYSETPOS=-1", "de")).toBe(
      "jeden letzten Samstag, Apr–Okt",
    );
  });

  it("lists non-consecutive months", () => {
    expect(describeRRule("FREQ=MONTHLY;BYMONTH=3,5,6,9,11;BYDAY=SU;BYSETPOS=3", "de")).toBe(
      "jeden 3. Sonntag, Mär, Mai, Jun, Sep, Nov",
    );
  });

  it("does not use a span for two consecutive months", () => {
    expect(describeRRule("FREQ=MONTHLY;BYMONTH=11,12;BYDAY=SA;BYSETPOS=1", "de")).toBe(
      "jeden 1. Samstag, Nov, Dez",
    );
  });

  it("describes yearly rules", () => {
    expect(describeRRule("FREQ=YEARLY;BYMONTH=6,9;BYDAY=SA;BYSETPOS=1", "de")).toBe(
      "jährlich: 1. Samstag im Jun und Sep",
    );
    expect(describeRRule("FREQ=YEARLY;BYMONTH=7;BYDAY=FR;BYSETPOS=2", "de")).toBe(
      "jährlich: 2. Freitag im Jul",
    );
    expect(describeRRule("FREQ=YEARLY;BYMONTH=5,6,9;BYDAY=SA;BYSETPOS=1", "de")).toBe(
      "jährlich: 1. Samstag im Mai, Jun und Sep",
    );
  });

  it("handles rules without BYSETPOS or BYMONTH", () => {
    expect(describeRRule("FREQ=MONTHLY;BYDAY=SA,SU", "de")).toBe(
      "jeden Samstag und Sonntag im Monat",
    );
  });
});

describe("describeRRule (en)", () => {
  it("uses English ordinals and names", () => {
    expect(describeRRule("FREQ=MONTHLY;BYMONTH=4,5,6,7,8,9,10;BYDAY=SU;BYSETPOS=2", "en")).toBe(
      "every 2nd Sunday, Apr–Oct",
    );
    expect(describeRRule("FREQ=MONTHLY;BYMONTH=4,5,6,7,8,9,10;BYDAY=SA;BYSETPOS=-1", "en")).toBe(
      "every last Saturday, Apr–Oct",
    );
    expect(describeRRule("FREQ=MONTHLY;BYMONTH=4,6,8,10;BYDAY=SU;BYSETPOS=3", "en")).toBe(
      "every 3rd Sunday, Apr, Jun, Aug, Oct",
    );
    expect(describeRRule("FREQ=YEARLY;BYMONTH=6,9;BYDAY=SA;BYSETPOS=1", "en")).toBe(
      "yearly: 1st Saturday in Jun and Sep",
    );
  });
});

describe("describeRRule (invalid)", () => {
  it("returns null for missing or unsupported rules", () => {
    expect(describeRRule(null, "de")).toBeNull();
    expect(describeRRule("", "de")).toBeNull();
    expect(describeRRule("FREQ=WEEKLY;BYDAY=MO", "de")).toBeNull();
  });
});
