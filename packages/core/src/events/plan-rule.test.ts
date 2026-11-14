import { describe, expect, it } from "vitest";
import { addDays } from "../dates/calendar";
import {
  expandPlanRule,
  planRuleFollowing,
  planRuleFromRRule,
  planRuleStart,
  suggestPlanRule,
} from "./plan-rule";
import { expandRRule } from "./rrule";

describe("planRuleStart / planRuleFollowing", () => {
  it("starts a weekend on Saturday and a run into Monday before the weekend", () => {
    expect(planRuleStart([0, 6])).toBe(6);
    expect(planRuleFollowing([0, 6])).toEqual([0]);
    expect(planRuleStart([5, 6, 0])).toBe(5);
    expect(planRuleStart([0, 1])).toBe(0);
    expect(planRuleStart([1, 6, 0])).toBe(6);
    expect(planRuleFollowing([1, 6, 0])).toEqual([0, 1]);
  });

  it("otherwise uses the German week (Monday first)", () => {
    expect(planRuleStart([5, 1])).toBe(1);
    expect(planRuleStart([3])).toBe(3);
    expect(planRuleStart([0, 1, 2, 3, 4, 5, 6])).toBe(1);
    expect(planRuleStart([])).toBeNull();
  });
});

describe("expandPlanRule", () => {
  it("matches the stored rule format for one weekday", () => {
    expect(
      expandPlanRule({ weekdays: [0], setPos: 1, fromMonth: 4, toMonth: 10, year: 2027 }),
    ).toEqual(
      expandRRule(
        "FREQ=MONTHLY;BYMONTH=4,5,6,7,8,9,10;BYDAY=SU;BYSETPOS=1",
        "2027-01-01",
        "2027-12-31",
      ),
    );
  });

  it("gives the first weekend (Sa + So), not the first Saturday or Sunday", () => {
    // August 2027 starts on a Sunday: the first weekend is the 7th and 8th.
    expect(
      expandPlanRule({ weekdays: [6, 0], setPos: 1, fromMonth: 4, toMonth: 5, year: 2027 }),
    ).toEqual(["2027-04-03", "2027-04-04", "2027-05-01", "2027-05-02"]);
    expect(
      expandPlanRule({ weekdays: [0, 6], setPos: 1, fromMonth: 8, toMonth: 8, year: 2027 }),
    ).toEqual(["2027-08-07", "2027-08-08"]);
  });

  it("keeps the days after a run that starts at the end of a month", () => {
    expect(
      expandPlanRule({ weekdays: [6, 0], setPos: -1, fromMonth: 7, toMonth: 7, year: 2027 }),
    ).toEqual(["2027-07-31", "2027-08-01"]);
  });

  it("takes every week without a position", () => {
    expect(
      expandPlanRule({ weekdays: [6], setPos: null, fromMonth: 5, toMonth: 5, year: 2027 }),
    ).toEqual(["2027-05-01", "2027-05-08", "2027-05-15", "2027-05-22", "2027-05-29"]);
  });

  it("is empty without weekdays or with months in the wrong order", () => {
    expect(
      expandPlanRule({ weekdays: [], setPos: 1, fromMonth: 4, toMonth: 10, year: 2027 }),
    ).toEqual([]);
    expect(
      expandPlanRule({ weekdays: [6], setPos: 1, fromMonth: 10, toMonth: 4, year: 2027 }),
    ).toEqual([]);
  });
});

describe("planRuleFromRRule", () => {
  it("reads the stored rhythm (weekdays, position, month range)", () => {
    expect(planRuleFromRRule("FREQ=MONTHLY;BYMONTH=4,5,6;BYDAY=SU,SA;BYSETPOS=1", 2027)).toEqual({
      weekdays: [6, 0],
      setPos: 1,
      fromMonth: 4,
      toMonth: 6,
      year: 2027,
    });
    expect(planRuleFromRRule("FREQ=MONTHLY;BYDAY=SA", 2027)).toMatchObject({
      setPos: null,
      fromMonth: 1,
      toMonth: 12,
    });
  });

  it("is null without a rule or for one it cannot read", () => {
    expect(planRuleFromRRule(null, 2027)).toBeNull();
    expect(planRuleFromRRule("FREQ=WEEKLY;BYDAY=SA", 2027)).toBeNull();
  });
});

const span = (startsOn: string, days: number) => ({
  startsOn,
  endsOn: addDays(startsOn, days - 1),
});

describe("suggestPlanRule", () => {
  // First Fridays of April–October 2026.
  const firstFridays = [
    "2026-04-03",
    "2026-05-01",
    "2026-06-05",
    "2026-07-03",
    "2026-08-07",
    "2026-09-04",
    "2026-10-02",
  ];

  it("reads a Fr–So market as its Beginn when the duration covers the run", () => {
    expect(
      suggestPlanRule(
        firstFridays.map((d) => span(d, 3)),
        3,
      ),
    ).toEqual({
      weekdays: [5],
      setPos: 1,
      fromMonth: 4,
      toMonth: 10,
      basedOn: { season: 2026, dates: 7 },
      regular: true,
    });
  });

  it("is only a starting point for a market held twice a year", () => {
    // Last Friday of February, 3rd Friday of September: no monthly rhythm.
    expect(suggestPlanRule([span("2026-02-27", 3), span("2026-09-18", 3)], 3)).toMatchObject({
      weekdays: [5],
      fromMonth: 2,
      toMonth: 9,
      regular: false,
    });
  });

  it("reads separate Saturday and Sunday events as one weekend", () => {
    const saturdays = ["2026-04-04", "2026-05-02", "2026-06-06", "2026-07-04", "2026-08-01"];
    const past = saturdays.flatMap((d) => [span(d, 1), span(addDays(d, 1), 1)]);
    expect(suggestPlanRule(past, 1)).toMatchObject({
      weekdays: [6, 0],
      setPos: 1,
      fromMonth: 4,
      toMonth: 8,
    });
  });

  it("says every week when months had several dates", () => {
    const past = ["2026-05-02", "2026-05-09", "2026-05-16", "2026-06-06", "2026-06-13"].map((d) =>
      span(d, 1),
    );
    expect(suggestPlanRule(past, 1)).toMatchObject({
      weekdays: [6],
      setPos: null,
      regular: true,
    });
  });

  it("prefers 'letzten' when it fits more dates than a number", () => {
    const past = ["2026-04-26", "2026-05-31", "2026-06-28"].map((d) => span(d, 1));
    expect(suggestPlanRule(past, 1)).toMatchObject({ weekdays: [0], setPos: -1 });
  });

  it("uses the latest season only", () => {
    const past = [
      span("2025-05-04", 1),
      span("2025-06-01", 1),
      span("2026-05-09", 1),
      span("2026-06-13", 1),
    ];
    expect(suggestPlanRule(past, 1)).toMatchObject({
      weekdays: [6],
      setPos: 2,
      basedOn: { season: 2026, dates: 2 },
    });
  });

  it("is null without past dates", () => {
    expect(suggestPlanRule([], 1)).toBeNull();
  });
});
