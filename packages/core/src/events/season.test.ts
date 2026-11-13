import { describe, expect, it } from "vitest";
import { isoWeek, weekday } from "../dates/calendar";
import {
  canChangeSeasonStatus,
  expectedStartFromLastSeason,
  initialSeasonStatus,
  isSeasonAnchorKey,
  isSeasonStatus,
  SEASON_ANCHOR_KEYS,
  SEASON_STATUSES,
  seasonAnchors,
  seasonEnd,
  seasonStart,
  seasonsToKeep,
  suggestedSeasonStatus,
} from "./season";

const ev = (startsOn: string, endsOn = startsOn, status = "planned") => ({
  startsOn,
  endsOn,
  status,
});

describe("seasonStart", () => {
  it("is the expected start while the season has no event", () => {
    expect(seasonStart([], "2027-01-01")).toBe("2027-01-01");
  });

  it("is the earliest first day of the season's events, in any order", () => {
    const events = [ev("2027-06-06"), ev("2027-03-07"), ev("2027-09-05")];
    expect(seasonStart(events, "2027-01-01")).toBe("2027-03-07");
  });

  it("ignores cancelled events and falls back when only cancelled ones are left", () => {
    expect(
      seasonStart([ev("2027-03-07", "2027-03-07", "cancelled"), ev("2027-04-04")], "2027-01-01"),
    ).toBe("2027-04-04");
    expect(seasonStart([ev("2027-03-07", "2027-03-07", "cancelled")], "2027-02-14")).toBe(
      "2027-02-14",
    );
  });

  it("takes an event before the expected start (the expectation was too late)", () => {
    expect(seasonStart([ev("2027-02-07")], "2027-03-07")).toBe("2027-02-07");
  });

  it("counts every other status (draft to closed) as a date of the season", () => {
    for (const status of ["draft", "planned", "confirmed", "live", "completed", "closed"])
      expect(seasonStart([ev("2027-05-02", "2027-05-02", status)], "2027-01-01")).toBe(
        "2027-05-02",
      );
  });

  it("handles a first date on the DST switch days and on 1 January", () => {
    expect(seasonStart([ev("2027-03-28"), ev("2027-10-31")], "2027-01-01")).toBe("2027-03-28");
    expect(seasonStart([ev("2027-01-01")], "2027-01-01")).toBe("2027-01-01");
  });
});

describe("seasonEnd", () => {
  it("is null without a (non-cancelled) event", () => {
    expect(seasonEnd([])).toBeNull();
    expect(seasonEnd([ev("2027-03-07", "2027-03-07", "cancelled")])).toBeNull();
  });

  it("is the latest last day, multi-day events included", () => {
    const events = [ev("2027-09-03", "2027-09-05"), ev("2027-10-03"), ev("2027-05-01")];
    expect(seasonEnd(events)).toBe("2027-10-03");
    expect(seasonEnd([ev("2027-10-01", "2027-10-04"), ev("2027-10-03")])).toBe("2027-10-04");
  });

  it("ignores a cancelled event that would end later", () => {
    expect(seasonEnd([ev("2027-10-03"), ev("2027-11-28", "2027-11-28", "cancelled")])).toBe(
      "2027-10-03",
    );
  });

  it("keeps the last day of a market that runs over New Year", () => {
    expect(seasonEnd([ev("2027-12-30", "2028-01-02")])).toBe("2028-01-02");
  });
});

describe("seasonAnchors", () => {
  it("has a start from the expected start and no end before the first date", () => {
    expect(seasonAnchors([], "2027-03-07")).toEqual({
      season_start: "2027-03-07",
      season_end: null,
    });
  });
  it("has both once there are dates", () => {
    expect(seasonAnchors([ev("2027-03-07"), ev("2027-10-01", "2027-10-03")], "2027-01-01")).toEqual(
      { season_start: "2027-03-07", season_end: "2027-10-03" },
    );
  });
  it("knows its keys", () => {
    expect(SEASON_ANCHOR_KEYS).toEqual(["season_start", "season_end"]);
    expect(isSeasonAnchorKey("season_start")).toBe(true);
    expect(isSeasonAnchorKey("season_end")).toBe(true);
    expect(isSeasonAnchorKey("event_day")).toBe(false);
    expect(isSeasonAnchorKey(null)).toBe(false);
  });
});

describe("expectedStartFromLastSeason", () => {
  it("is 1 January of the season without history", () => {
    expect(expectedStartFromLastSeason(null, 2027)).toBe("2027-01-01");
    expect(expectedStartFromLastSeason(null, 2028)).toBe("2028-01-01");
  });

  it("keeps weekday and ISO week", () => {
    // Sunday of KW 9 (2026-03-01) → Sunday of KW 9 2027.
    const next = expectedStartFromLastSeason("2026-03-01", 2027);
    expect(next).toBe("2027-03-07");
    expect(weekday(next)).toBe(0);
    expect(isoWeek(next)).toEqual({ year: 2027, week: 9 });
  });

  it("moves Saturdays and multi-day starts the same way", () => {
    // Saturday 2026-05-23 (KW 21) → Saturday KW 21 2027 = 2027-05-29.
    expect(expectedStartFromLastSeason("2026-05-23", 2027)).toBe("2027-05-29");
    // Friday 2026-08-28 (KW 35) → Friday KW 35 2027 = 2027-09-03.
    expect(expectedStartFromLastSeason("2026-08-28", 2027)).toBe("2027-09-03");
  });

  it("works across DST: a date in summer time stays on its weekday", () => {
    // Sunday 2026-03-29 is the spring-forward day (KW 13) → Sunday KW 13 2027 = 2027-04-04 (summer time).
    expect(expectedStartFromLastSeason("2026-03-29", 2027)).toBe("2027-04-04");
    // Sunday 2026-10-25 is the fall-back day (KW 43) → 2027-10-31.
    expect(expectedStartFromLastSeason("2026-10-25", 2027)).toBe("2027-10-31");
  });

  it("stays inside the season for January dates of the previous ISO year", () => {
    // Friday 2027-01-01 belongs to KW 53 of 2026. One year on, the same week position would be 2027-12-31,
    // which is not in season 2028: it moves to the first Friday of 2028.
    const next = expectedStartFromLastSeason("2027-01-01", 2028);
    expect(next).toBe("2028-01-07");
    expect(weekday(next)).toBe(5);
    // Thursday 2026-01-01 (KW 1 2026) → Thursday KW 1 2027 = 2027-01-07.
    expect(expectedStartFromLastSeason("2026-01-01", 2027)).toBe("2027-01-07");
  });

  it("stays inside the season for late-December dates", () => {
    // Thursday 2026-12-31 is KW 53 of 2026; 2027 has only 52 weeks, so the week position would run into
    // 2028 (2028-01-06): it moves back to the last Thursday of 2027.
    const next = expectedStartFromLastSeason("2026-12-31", 2027);
    expect(next).toBe("2027-12-30");
    expect(weekday(next)).toBe(4);
  });

  it("handles leap years (29 February)", () => {
    // Tuesday 2028-02-29 (KW 9) → Tuesday KW 9 2029 = 2029-02-27.
    expect(expectedStartFromLastSeason("2028-02-29", 2029)).toBe("2029-02-27");
  });

  it("works from an older season as well (gap years)", () => {
    // Sunday 2025-03-02 (KW 9) → Sunday KW 9 2027 = 2027-03-07.
    expect(expectedStartFromLastSeason("2025-03-02", 2027)).toBe("2027-03-07");
  });

  it("refuses an invalid season or date", () => {
    expect(() => expectedStartFromLastSeason(null, 2027.5)).toThrow();
    expect(() => expectedStartFromLastSeason("2026-02-30", 2027)).toThrow();
  });
});

describe("season status", () => {
  it("knows its statuses", () => {
    expect(SEASON_STATUSES).toEqual(["planning", "dates_set", "closed"]);
    expect(isSeasonStatus("dates_set")).toBe(true);
    expect(isSeasonStatus("planned")).toBe(false);
  });

  it("starts as planning without dates, dates_set with dates, closed when already over", () => {
    expect(initialSeasonStatus([], "2026-11-13")).toBe("planning");
    expect(initialSeasonStatus([ev("2027-03-07")], "2026-11-13")).toBe("dates_set");
    expect(initialSeasonStatus([ev("2026-03-01"), ev("2026-10-04")], "2026-11-13")).toBe("closed");
    // Running or on its last day: not over yet.
    expect(initialSeasonStatus([ev("2026-11-13")], "2026-11-13")).toBe("dates_set");
    expect(initialSeasonStatus([ev("2026-11-12", "2026-11-14")], "2026-11-13")).toBe("dates_set");
    // Only cancelled dates: no dates.
    expect(initialSeasonStatus([ev("2026-03-01", "2026-03-01", "cancelled")], "2026-11-13")).toBe(
      "planning",
    );
  });

  it("allows every manual change between two different statuses (each can be undone)", () => {
    for (const from of SEASON_STATUSES)
      for (const to of SEASON_STATUSES) expect(canChangeSeasonStatus(from, to)).toBe(from !== to);
    expect(canChangeSeasonStatus("planning", "open" as never)).toBe(false);
  });

  it("suggests dates_set once the dates exist or the dates were planned", () => {
    const base = { seasonEnd: null, today: "2026-11-13", openSeasonTasks: 2 };
    expect(
      suggestedSeasonStatus({ ...base, status: "planning", hasDates: false, datesPlanned: false }),
    ).toBeNull();
    expect(
      suggestedSeasonStatus({ ...base, status: "planning", hasDates: true, datesPlanned: false }),
    ).toBe("dates_set");
    expect(
      suggestedSeasonStatus({ ...base, status: "planning", hasDates: false, datesPlanned: true }),
    ).toBe("dates_set");
  });

  it("suggests closed only after the last day with no open season task", () => {
    const base = { status: "dates_set" as const, hasDates: true, datesPlanned: true };
    expect(
      suggestedSeasonStatus({
        ...base,
        seasonEnd: "2026-10-04",
        today: "2026-11-13",
        openSeasonTasks: 0,
      }),
    ).toBe("closed");
    expect(
      suggestedSeasonStatus({
        ...base,
        seasonEnd: "2026-10-04",
        today: "2026-11-13",
        openSeasonTasks: 1,
      }),
    ).toBeNull();
    // On the last day itself the season is still running.
    expect(
      suggestedSeasonStatus({
        ...base,
        seasonEnd: "2026-11-13",
        today: "2026-11-13",
        openSeasonTasks: 0,
      }),
    ).toBeNull();
    expect(
      suggestedSeasonStatus({ ...base, seasonEnd: null, today: "2026-11-13", openSeasonTasks: 0 }),
    ).toBeNull();
    expect(
      suggestedSeasonStatus({
        ...base,
        status: "closed",
        seasonEnd: "2026-10-04",
        today: "2026-11-13",
        openSeasonTasks: 0,
      }),
    ).toBeNull();
  });
});

describe("seasonsToKeep", () => {
  it("is the current and the next Berlin year", () => {
    expect(seasonsToKeep(new Date("2026-11-13T10:00:00Z"))).toEqual([2026, 2027]);
  });
  it("switches at Berlin midnight on New Year's Eve, not at UTC midnight", () => {
    // 23:30 UTC on 31 December is already 00:30 on 1 January in Berlin (CET, UTC+1).
    expect(seasonsToKeep(new Date("2026-12-31T23:30:00Z"))).toEqual([2027, 2028]);
    expect(seasonsToKeep(new Date("2026-12-31T22:59:00Z"))).toEqual([2026, 2027]);
  });
});
