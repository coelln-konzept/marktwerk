import { describe, expect, it } from "vitest";
import {
  applyByFor,
  expectedDecisionAfter,
  isMonthDay,
  monthDayIn,
  permitCovers,
  seasonFor,
} from "./coverage";

const event = { startsOn: "2027-05-02", endsOn: "2027-05-02", season: 2027 };
const base = { status: "granted", season: 2027, validFrom: null, validUntil: null } as const;

describe("permitCovers", () => {
  it("never shares a per-event permit", () => {
    expect(permitCovers("per_event", base, event)).toBe(false);
  });

  it("covers the events of its season, not of another one", () => {
    expect(permitCovers("per_season", base, event)).toBe(true);
    expect(permitCovers("per_year", base, event)).toBe(true);
    expect(permitCovers("per_season", { ...base, season: 2026 }, event)).toBe(false);
  });

  it("respects entered validity for the whole event (all days)", () => {
    const permit = { ...base, validFrom: "2027-03-01", validUntil: "2027-11-30" };
    expect(permitCovers("per_season", permit, event)).toBe(true);
    expect(permitCovers("per_season", permit, { ...event, startsOn: "2027-02-27" })).toBe(false);
    expect(
      permitCovers("per_season", permit, {
        startsOn: "2027-11-29",
        endsOn: "2027-12-01",
        season: 2027,
      }),
    ).toBe(false);
  });

  it("covers multi-year permits inside their validity, and undated ones", () => {
    const multi = {
      status: "granted",
      season: null,
      validFrom: "2026-01-01",
      validUntil: "2028-12-31",
    } as const;
    expect(permitCovers("multi_year", multi, event)).toBe(true);
    expect(
      permitCovers("multi_year", multi, { ...event, startsOn: "2029-05-05", endsOn: "2029-05-05" }),
    ).toBe(false);
    expect(
      permitCovers(
        "multi_year",
        { ...multi, status: "applied", validFrom: null, validUntil: null },
        event,
      ),
    ).toBe(true);
  });

  it("treats a standing permit like one without end", () => {
    const standing = {
      status: "granted",
      season: null,
      validFrom: "2020-01-01",
      validUntil: null,
    } as const;
    expect(
      permitCovers("standing", standing, {
        ...event,
        startsOn: "2035-01-01",
        endsOn: "2035-01-01",
      }),
    ).toBe(true);
  });

  it("ignores superseded permits but keeps rejected ones visible", () => {
    expect(permitCovers("per_season", { ...base, status: "superseded" }, event)).toBe(false);
    expect(permitCovers("per_season", { ...base, status: "rejected" }, event)).toBe(true);
  });
});

describe("seasonFor", () => {
  it("only season and year permits belong to a season", () => {
    expect(seasonFor("per_season", 2027)).toBe(2027);
    expect(seasonFor("per_year", 2027)).toBe(2027);
    expect(seasonFor("per_event", 2027)).toBeNull();
    expect(seasonFor("multi_year", 2027)).toBeNull();
    expect(seasonFor("standing", 2027)).toBeNull();
  });
});

describe("applyByFor", () => {
  it("is event day minus lead time without a window", () => {
    expect(applyByFor("2027-06-06", 21)).toBe("2027-05-16");
    expect(applyByFor("2027-06-06", 0)).toBe("2027-06-06");
    expect(applyByFor("2027-06-06", 21, { startMd: null, endMd: null })).toBe("2027-05-16");
  });

  it("moves back to the end of the window that is over by then", () => {
    // 120 days before 02.05.2027 is 02.01.2027; the city collects from 01.10. to 30.11. of the year before.
    const window = { startMd: "10-01", endMd: "11-30" };
    expect(applyByFor("2027-05-02", 120, window)).toBe("2026-11-30");
  });

  it("keeps a date that lies inside a window", () => {
    const window = { startMd: "10-01", endMd: "11-30" };
    // 18.10.2027 is in the window of 2027.
    expect(applyByFor("2028-02-14", 119, window)).toBe("2027-10-18");
  });

  it("handles windows that wrap the year end", () => {
    const window = { startMd: "11-01", endMd: "02-28" };
    expect(applyByFor("2027-05-02", 100, window)).toBe("2027-01-22");
    expect(applyByFor("2027-09-05", 30, window)).toBe("2027-02-28");
  });

  it("treats a single bound as open on the other side", () => {
    // end only: the window is 01-01 … 03-31; 06.08. is outside, so it is the end of that window
    expect(applyByFor("2027-09-05", 30, { startMd: null, endMd: "03-31" })).toBe("2027-03-31");
    // start only: the window is 10-01 … 12-31; 06.08. is outside, so the previous year's end
    expect(applyByFor("2027-09-05", 30, { startMd: "10-01", endMd: null })).toBe("2026-12-31");
    expect(applyByFor("2027-12-20", 10, { startMd: "10-01", endMd: null })).toBe("2027-12-10");
  });
});

describe("expectedDecisionAfter", () => {
  it("is the next occurrence of the month-day after the deadline", () => {
    expect(expectedDecisionAfter("2026-11-30", "01-15")).toBe("2027-01-15");
    expect(expectedDecisionAfter("2026-10-01", "01-15")).toBe("2027-01-15");
    expect(expectedDecisionAfter("2027-01-02", "01-15")).toBe("2027-01-15");
    expect(expectedDecisionAfter("2027-01-15", "01-15")).toBe("2028-01-15");
  });

  it("is null without an expected month-day", () => {
    expect(expectedDecisionAfter("2026-11-30", null)).toBeNull();
  });
});

describe("month-days", () => {
  it("validates and clamps", () => {
    expect(isMonthDay("02-29")).toBe(true);
    expect(isMonthDay("13-01")).toBe(false);
    expect(isMonthDay("2-9")).toBe(false);
    expect(monthDayIn(2027, "02-29")).toBe("2027-02-28");
    expect(monthDayIn(2028, "02-29")).toBe("2028-02-29");
  });
});
