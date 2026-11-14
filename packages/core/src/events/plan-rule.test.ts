import { describe, expect, it } from "vitest";
import { addDays } from "../dates/calendar";
import {
  expandPlanRule,
  planRuleFollowing,
  planRuleFromRRule,
  planRuleMonthRange,
  planRuleStart,
  rruleDatesInYear,
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
      expandPlanRule({ weekdays: [0], setPos: 1, months: [4, 5, 6, 7, 8, 9, 10], year: 2027 }),
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
    expect(expandPlanRule({ weekdays: [6, 0], setPos: 1, months: [4, 5], year: 2027 })).toEqual([
      "2027-04-03",
      "2027-04-04",
      "2027-05-01",
      "2027-05-02",
    ]);
    expect(expandPlanRule({ weekdays: [0, 6], setPos: 1, months: [8], year: 2027 })).toEqual([
      "2027-08-07",
      "2027-08-08",
    ]);
  });

  it("keeps the days after a run that starts at the end of a month", () => {
    expect(expandPlanRule({ weekdays: [6, 0], setPos: -1, months: [7], year: 2027 })).toEqual([
      "2027-07-31",
      "2027-08-01",
    ]);
  });

  it("takes every week without a position", () => {
    expect(expandPlanRule({ weekdays: [6], setPos: null, months: [5], year: 2027 })).toEqual([
      "2027-05-01",
      "2027-05-08",
      "2027-05-15",
      "2027-05-22",
      "2027-05-29",
    ]);
  });

  it("is empty without weekdays or with months in the wrong order", () => {
    expect(
      expandPlanRule({ weekdays: [], setPos: 1, months: [4, 5, 6, 7, 8, 9, 10], year: 2027 }),
    ).toEqual([]);
    expect(expandPlanRule({ weekdays: [6], setPos: 1, months: [], year: 2027 })).toEqual([]);
  });
});

describe("planRuleFromRRule", () => {
  it("reads the stored rhythm (weekdays, position, months)", () => {
    expect(planRuleFromRRule("FREQ=MONTHLY;BYMONTH=4,5,6;BYDAY=SU;BYSETPOS=1", 2027)).toEqual({
      weekdays: [0],
      setPos: 1,
      months: [4, 5, 6],
      year: 2027,
      exact: true,
    });
    expect(planRuleFromRRule("FREQ=MONTHLY;BYDAY=SA", 2027)).toMatchObject({
      setPos: null,
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      exact: true,
    });
  });

  it("keeps months that skip some as a list and gives the same dates as the stored rule", () => {
    for (const rrule of [
      "FREQ=YEARLY;BYMONTH=5,10;BYDAY=SU;BYSETPOS=1",
      "FREQ=MONTHLY;BYMONTH=4,6,8,10;BYDAY=SA;BYSETPOS=2",
      "FREQ=MONTHLY;BYMONTH=5,7,9;BYDAY=FR;BYSETPOS=-1",
      "FREQ=MONTHLY;BYMONTH=4,5;BYDAY=SU;BYSETPOS=5",
    ]) {
      const rule = planRuleFromRRule(rrule, 2027);
      if (!rule) throw new Error(`unreadable: ${rrule}`);
      expect(rule.exact).toBe(true);
      expect(expandPlanRule(rule)).toEqual(rruleDatesInYear(rrule, 2027));
    }
    const kerpen = planRuleFromRRule("FREQ=YEARLY;BYMONTH=5,10;BYDAY=SU;BYSETPOS=1", 2027);
    expect(kerpen?.months).toEqual([5, 10]);
    expect(kerpen && expandPlanRule(kerpen)).toEqual(["2027-05-02", "2027-10-03"]);
    const antik = planRuleFromRRule("FREQ=MONTHLY;BYMONTH=4,6,8,10;BYDAY=SA;BYSETPOS=2", 2027);
    expect(antik && expandPlanRule(antik)).toHaveLength(4);
  });

  it("is not exact for several weekdays with a position (first Saturday-or-Sunday elsewhere)", () => {
    expect(planRuleFromRRule("FREQ=MONTHLY;BYMONTH=4,5,6;BYDAY=SU,SA;BYSETPOS=1", 2027)).toEqual({
      weekdays: [6, 0],
      setPos: 1,
      months: [4, 5, 6],
      year: 2027,
      exact: false,
    });
    expect(planRuleFromRRule("FREQ=MONTHLY;BYDAY=SA,SU", 2027)?.exact).toBe(true);
  });

  it("is null without a rule or for one it cannot read", () => {
    expect(planRuleFromRRule(null, 2027)).toBeNull();
    expect(planRuleFromRRule("FREQ=WEEKLY;BYDAY=SA", 2027)).toBeNull();
    expect(rruleDatesInYear("FREQ=WEEKLY;BYDAY=SA", 2027)).toEqual([]);
  });
});

describe("planRuleMonthRange", () => {
  it("is a range only for months that follow each other", () => {
    expect(planRuleMonthRange([10, 4, 5, 6, 7, 8, 9])).toEqual({ from: 4, to: 10 });
    expect(planRuleMonthRange([6])).toEqual({ from: 6, to: 6 });
    expect(planRuleMonthRange([5, 10])).toBeNull();
    expect(planRuleMonthRange([])).toBeNull();
  });
});

const span = (startsOn: string, days: number) => ({
  startsOn,
  endsOn: addDays(startsOn, days - 1),
});

const TODAY = "2026-11-14";

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
        TODAY,
      ),
    ).toEqual({
      weekdays: [5],
      setPos: 1,
      months: [4, 5, 6, 7, 8, 9, 10],
      basedOn: { season: 2026, dates: 7 },
      regular: true,
    });
  });

  it("is only a starting point for a market held twice a year", () => {
    // Last Friday of February, 3rd Friday of September: no monthly rhythm.
    expect(suggestPlanRule([span("2026-02-27", 3), span("2026-09-18", 3)], 3, TODAY)).toMatchObject(
      {
        weekdays: [5],
        months: [2, 9],
        regular: false,
      },
    );
  });

  it("reads separate Saturday and Sunday events as one weekend", () => {
    const saturdays = ["2026-04-04", "2026-05-02", "2026-06-06", "2026-07-04", "2026-08-01"];
    const past = saturdays.flatMap((d) => [span(d, 1), span(addDays(d, 1), 1)]);
    expect(suggestPlanRule(past, 1, TODAY)).toMatchObject({
      weekdays: [6, 0],
      setPos: 1,
      months: [4, 5, 6, 7, 8],
    });
  });

  it("says every week when months had several dates", () => {
    const past = ["2026-05-02", "2026-05-09", "2026-05-16", "2026-06-06", "2026-06-13"].map((d) =>
      span(d, 1),
    );
    expect(suggestPlanRule(past, 1, TODAY)).toMatchObject({
      weekdays: [6],
      setPos: null,
      regular: true,
    });
  });

  it("prefers 'letzten' when it fits more dates than a number", () => {
    const past = ["2026-04-26", "2026-05-31", "2026-06-28"].map((d) => span(d, 1));
    expect(suggestPlanRule(past, 1, TODAY)).toMatchObject({ weekdays: [0], setPos: -1 });
  });

  it("uses the latest season only", () => {
    const past = [
      span("2025-05-04", 1),
      span("2025-06-01", 1),
      span("2026-05-09", 1),
      span("2026-06-13", 1),
    ];
    expect(suggestPlanRule(past, 1, TODAY)).toMatchObject({
      weekdays: [6],
      setPos: 2,
      basedOn: { season: 2026, dates: 2 },
    });
  });

  it("keeps the months it was held in: June and September are not July and August", () => {
    const past = ["2026-06-06", "2026-09-05"].map((d) => span(d, 1));
    expect(suggestPlanRule(past, 1, TODAY)).toMatchObject({
      weekdays: [6],
      setPos: 1,
      months: [6, 9],
      regular: false,
    });
  });

  it("is a rhythm with months that skip some when there are enough dates", () => {
    // 2nd Saturday of April, June, August and October.
    const past = ["2026-04-11", "2026-06-13", "2026-08-08", "2026-10-10"].map((d) => span(d, 1));
    expect(suggestPlanRule(past, 1, TODAY)).toMatchObject({
      weekdays: [6],
      setPos: 2,
      months: [4, 6, 8, 10],
      regular: true,
    });
  });

  it("is no rhythm for one date, or for fewer dates than the minimum", () => {
    expect(suggestPlanRule([span("2027-01-17", 1)], 1, "2027-02-10")).toMatchObject({
      weekdays: [0],
      months: [1],
      regular: false,
    });
    expect(suggestPlanRule([span("2026-05-03", 1), span("2026-06-07", 1)], 1, TODAY)).toMatchObject(
      { regular: false },
    );
  });

  it("reads the year before when the current one has only started", () => {
    // A year-round market on the 3rd Sunday, planned in February 2027: one January date so far.
    const sundays = [
      "2026-01-18",
      "2026-02-15",
      "2026-03-15",
      "2026-04-19",
      "2026-05-17",
      "2026-06-21",
      "2026-07-19",
      "2026-08-16",
      "2026-09-20",
      "2026-10-18",
      "2026-11-15",
      "2026-12-20",
      "2027-01-17",
    ];
    expect(
      suggestPlanRule(
        sundays.map((d) => span(d, 1)),
        1,
        "2027-02-10",
      ),
    ).toMatchObject({
      weekdays: [0],
      setPos: 3,
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      basedOn: { season: 2026, dates: 12 },
      regular: true,
    });
    // A finished year is read as it is, even with fewer dates than the one before.
    expect(
      suggestPlanRule(
        [...sundays.slice(0, 12), "2027-01-17", "2027-02-21"].map((d) => span(d, 1)),
        1,
        "2028-01-05",
      ),
    ).toMatchObject({ basedOn: { season: 2027, dates: 2 } });
  });

  it("is null without past dates", () => {
    expect(suggestPlanRule([], 1, TODAY)).toBeNull();
  });
});
