import { describe, expect, it } from "vitest";
import {
  fillApplyBy,
  permitApplyDueAt,
  permitApplyTaskTitle,
  SEASON_START_MD,
  type SeasonPermitRequirement,
  seasonPermitApplyBy,
  seasonStartOf,
} from "./season-permit";

const lead = (
  leadTimeDays: number,
  cadence: SeasonPermitRequirement["cadence"] = "per_season",
) => ({
  cadence,
  leadTimeDays,
  submissionWindowStartMd: null,
  submissionWindowEndMd: null,
});
const windowed = (startMd: string | null, endMd: string | null, leadTimeDays = 180) => ({
  cadence: "per_season" as const,
  leadTimeDays,
  submissionWindowStartMd: startMd,
  submissionWindowEndMd: endMd,
});

describe("season start and apply-by (ADR 0024)", () => {
  it("starts every season on 1 March", () => {
    expect(SEASON_START_MD).toBe("03-01");
    expect(seasonStartOf(2027)).toBe("2027-03-01");
    expect(seasonStartOf(2028)).toBe("2028-03-01");
  });

  it("takes the lead time before the season start, across the year end and leap years", () => {
    expect(seasonPermitApplyBy(lead(180), 2027)).toBe("2026-09-02");
    // 2028 is a leap year: 29 February counts.
    expect(seasonPermitApplyBy(lead(1), 2028)).toBe("2028-02-29");
    expect(seasonPermitApplyBy(lead(1), 2027)).toBe("2027-02-28");
    expect(seasonPermitApplyBy(lead(0), 2027)).toBe("2027-03-01");
    expect(seasonPermitApplyBy(lead(-5), 2027)).toBe("2027-03-01");
    expect(seasonPermitApplyBy(lead(365), 2027)).toBe("2026-03-01");
  });

  it("takes the end of the last submission window before the season start", () => {
    // The city collects applications 01.10.–30.11. of the year before.
    expect(seasonPermitApplyBy(windowed("10-01", "11-30"), 2027)).toBe("2026-11-30");
    // A window wrapping the year end, closing in February (leap year: the 29th).
    expect(seasonPermitApplyBy(windowed("11-01", "02-29"), 2028)).toBe("2028-02-29");
    expect(seasonPermitApplyBy(windowed("11-01", "02-29"), 2027)).toBe("2027-02-28");
    // A window ending exactly on the season start still counts.
    expect(seasonPermitApplyBy(windowed("01-01", "03-01"), 2027)).toBe("2027-03-01");
    // A window ending after the season start: the one of the year before.
    expect(seasonPermitApplyBy(windowed("02-01", "04-30"), 2027)).toBe("2026-04-30");
    // One bound only: the other is the start / end of the year.
    expect(seasonPermitApplyBy(windowed("10-01", null), 2027)).toBe("2026-12-31");
    expect(seasonPermitApplyBy(windowed(null, "01-31"), 2027)).toBe("2027-01-31");
  });

  it("is due at the end of the apply-by day in Berlin, summer and winter time alike", () => {
    // Winter time (UTC+1), the last Sunday of October (DST ends), summer time (UTC+2), the last Sunday of March.
    expect(permitApplyDueAt("2026-11-30").toISOString()).toBe("2026-11-30T22:59:00.000Z");
    expect(permitApplyDueAt("2026-10-25").toISOString()).toBe("2026-10-25T22:59:00.000Z");
    expect(permitApplyDueAt("2026-09-02").toISOString()).toBe("2026-09-02T21:59:00.000Z");
    expect(permitApplyDueAt("2027-03-28").toISOString()).toBe("2027-03-28T21:59:00.000Z");
    expect(permitApplyTaskTitle("Festsetzung")).toBe("Festsetzung beantragen");
  });
});

describe("fillApplyBy: the apply-by of the permit a new date makes (SAI8)", () => {
  it("fixes a season permit in the calendar while its season has not started", () => {
    // Planned in September 2026 for May 2027: 180 days before 1 March, not before the date.
    expect(fillApplyBy(lead(180), "2027-05-02", 2027, "2026-09-01")).toBe("2026-09-02");
    expect(fillApplyBy(windowed("10-01", "11-30"), "2027-05-02", 2027, "2026-09-01")).toBe(
      "2026-11-30",
    );
    // Even when the calendar deadline has passed already: the date was planned late, the permit is overdue.
    expect(fillApplyBy(lead(180), "2027-05-02", 2027, "2026-12-01")).toBe("2026-09-02");
    for (const cadence of ["per_year", "multi_year", "standing"] as const)
      expect(fillApplyBy(lead(180, cadence), "2027-05-02", 2027, "2026-09-01")).toBe("2026-09-02");
  });

  it("takes the date's own deadline when that is earlier (a date before 1 March)", () => {
    expect(fillApplyBy(lead(60), "2027-01-17", 2027, "2026-09-01")).toBe("2026-11-18");
  });

  it("takes the date's own deadline once the season is running, and always for a per-date permit", () => {
    expect(fillApplyBy(lead(60), "2027-07-04", 2027, "2027-03-01")).toBe("2027-05-05");
    expect(fillApplyBy(lead(14, "per_event"), "2027-05-02", 2027, "2026-09-01")).toBe("2027-04-18");
  });
});
