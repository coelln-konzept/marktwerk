import { describe, expect, it } from "vitest";
import {
  dueSeasonPermits,
  permitApplyDueAt,
  permitApplyTaskTitle,
  SEASON_PERMIT_CREATE_DAYS,
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

describe("dueSeasonPermits: which season's permit the job creates on a day", () => {
  const req = lead(180);
  // Apply-by 2026-09-02, created 30 days before: 2026-08-03.

  it("creates next season's permit 30 days before its apply-by, not earlier", () => {
    expect(SEASON_PERMIT_CREATE_DAYS).toBe(30);
    expect(dueSeasonPermits(req, [], "2026-08-02")).toEqual([]);
    expect(dueSeasonPermits(req, [], "2026-08-03")).toEqual([
      { season: 2027, applyBy: "2026-09-02", createOn: "2026-08-03" },
    ]);
    // Still due later (a missed night, or apply-by already passed) until the season starts.
    expect(dueSeasonPermits(req, [], "2026-12-31").map((d) => d.season)).toEqual([2027]);
    expect(dueSeasonPermits(req, [], "2027-02-28").map((d) => d.season)).toEqual([2027]);
  });

  it("leaves a season that has started to the logbook fill", () => {
    expect(dueSeasonPermits(req, [], "2027-03-01")).toEqual([]);
    expect(dueSeasonPermits(req, [], "2027-06-15")).toEqual([]);
    // From the next creation day on, the season after it (2028 is a leap year: one day later).
    expect(dueSeasonPermits(req, [], "2027-08-03")).toEqual([]);
    expect(dueSeasonPermits(req, [], "2027-08-04").map((d) => d.season)).toEqual([2028]);
  });

  it("creates nothing when the season has its permit already (any status but superseded)", () => {
    const of = (season: number, status = "not_started" as const) => ({
      season,
      status,
      validUntil: null,
    });
    expect(dueSeasonPermits(req, [of(2027)], "2026-09-01")).toEqual([]);
    expect(dueSeasonPermits(req, [{ ...of(2027), status: "rejected" }], "2026-09-01")).toEqual([]);
    expect(
      dueSeasonPermits(req, [{ ...of(2027), status: "superseded" }], "2026-09-01").map(
        (d) => d.season,
      ),
    ).toEqual([2027]);
    // Last season's permit does not count for this one.
    expect(dueSeasonPermits(req, [of(2026, "granted" as never)], "2026-09-01")).toHaveLength(1);
  });

  it("treats per_year like per_season and never makes one for per_event", () => {
    expect(dueSeasonPermits(lead(180, "per_year"), [], "2026-09-01")).toHaveLength(1);
    expect(dueSeasonPermits(lead(180, "per_event"), [], "2026-09-01")).toEqual([]);
  });

  it("renews a multi-year or standing permit only when it runs out, or when there is none", () => {
    const multi = lead(90, "multi_year"); // apply-by 2026-12-01, created 2026-11-01
    const valid = (validUntil: string | null) => ({
      season: null,
      status: "granted" as const,
      validUntil,
    });
    expect(dueSeasonPermits(multi, [], "2026-11-01")).toEqual([
      { season: 2027, applyBy: "2026-12-01", createOn: "2026-11-01" },
    ]);
    expect(dueSeasonPermits(multi, [valid("2027-12-31")], "2026-11-01")).toEqual([]);
    expect(dueSeasonPermits(multi, [valid(null)], "2026-11-01")).toEqual([]);
    // Runs out during the coming season (30.06.2027): the renewal is due.
    expect(dueSeasonPermits(multi, [valid("2027-06-30")], "2026-11-01")).toHaveLength(1);
    expect(dueSeasonPermits(lead(90, "standing"), [], "2026-11-01")).toHaveLength(1);
    expect(dueSeasonPermits(lead(90, "standing"), [valid(null)], "2026-11-01")).toEqual([]);
  });

  it("with a very long lead time makes at most one multi-year permit, but both seasons' season permits", () => {
    // Apply-by 2026-03-01 for 2027 (created 2026-01-30) and 2025-03-01 … for 2026: on 2026-02-10 both are due.
    expect(dueSeasonPermits(lead(365), [], "2026-02-10").map((d) => d.season)).toEqual([
      2026, 2027,
    ]);
    expect(
      dueSeasonPermits(lead(365, "multi_year"), [], "2026-02-10").map((d) => d.season),
    ).toEqual([2026]);
  });

  it("works across the year end and in leap years", () => {
    const late = lead(1); // apply-by the last day of February, created 30 days before
    expect(dueSeasonPermits(late, [], "2027-01-29")).toEqual([
      { season: 2027, applyBy: "2027-02-28", createOn: "2027-01-29" },
    ]);
    expect(dueSeasonPermits(late, [], "2028-01-30")).toEqual([
      { season: 2028, applyBy: "2028-02-29", createOn: "2028-01-30" },
    ]);
    expect(dueSeasonPermits(late, [], "2028-01-29")).toEqual([]);
    // A window closing 30.11.: created 31.10. of the year before the season.
    expect(dueSeasonPermits(windowed("10-01", "11-30"), [], "2026-10-31")).toEqual([
      { season: 2027, applyBy: "2026-11-30", createOn: "2026-10-31" },
    ]);
  });
});
