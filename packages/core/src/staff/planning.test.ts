import { describe, expect, it } from "vitest";
import { budgetStatus, hourBudget, monthUsage, shortNotice, weekTotals } from "./planning";
import type { ShiftTimesInput } from "./worktime";

const s = (
  workDate: string,
  status: ShiftTimesInput["status"],
  planned: [string, string] | null,
  actual: [string, string] | null = null,
  breakMinutes = 0,
): ShiftTimesInput => ({
  workDate,
  status,
  plannedStart: planned?.[0] ?? null,
  plannedEnd: planned?.[1] ?? null,
  actualStart: actual?.[0] ?? null,
  actualEnd: actual?.[1] ?? null,
  breakMinutes,
});

describe("hourBudget", () => {
  it("uses the default without a contract and says so", () => {
    expect(hourBudget([], "2026-12-01", 40)).toEqual({ minutes: 2400, noContract: true });
  });
  it("uses the contract's budget, or the default when it is empty", () => {
    const c = { validFrom: "2026-01-01", validUntil: null, monthlyHourBudget: 35 };
    expect(hourBudget([c], "2026-12-01", 40)).toEqual({ minutes: 2100, noContract: false });
    expect(hourBudget([{ ...c, monthlyHourBudget: null }], "2026-12-01", 40).minutes).toBe(2400);
  });
  it("takes the contract valid on the last day of the month that has one (mid-month change)", () => {
    const old = { validFrom: "2026-01-01", validUntil: "2026-12-14", monthlyHourBudget: 40 };
    const raise = { validFrom: "2026-12-15", validUntil: null, monthlyHourBudget: 30 };
    expect(hourBudget([old, raise], "2026-12-01", 40).minutes).toBe(1800);
  });
  it("falls back to an earlier day when the contract ended mid-month", () => {
    const ended = { validFrom: "2026-01-01", validUntil: "2026-12-10", monthlyHourBudget: 20 };
    expect(hourBudget([ended], "2026-12-01", 40)).toEqual({ minutes: 1200, noContract: false });
  });
  it("accepts half hours", () => {
    const c = { validFrom: "2026-01-01", validUntil: null, monthlyHourBudget: 37.5 };
    expect(hourBudget([c], "2026-12-01", 40).minutes).toBe(2250);
  });
});

describe("monthUsage + budgetStatus", () => {
  const shifts = [
    s("2026-12-05", "worked", ["08:00", "16:00"], ["08:00", "16:30"], 30), // 480 worked
    s("2026-12-12", "confirmed", ["08:00", "14:00"]), // 360 confirmed
    s("2026-12-13", "requested", ["10:00", "14:00"]), // 240 requested
    s("2026-12-19", "declined", ["08:00", "16:00"]), // not counted
    s("2026-12-20", "cancelled", ["08:00", "16:00"]), // not counted
    s("2026-11-29", "confirmed", ["08:00", "16:00"]), // other month
  ];
  it("splits used minutes by state and ignores declined/cancelled and other months", () => {
    expect(monthUsage(shifts, "2026-12-01")).toEqual({
      workedMinutes: 480,
      confirmedMinutes: 360,
      requestedMinutes: 240,
    });
  });
  it("levels: ok, tight at ≤ 4 h left, over below 0", () => {
    const usage = monthUsage(shifts, "2026-12-01"); // 1080
    expect(budgetStatus(usage, 2400)).toEqual({
      usedMinutes: 1080,
      leftMinutes: 1320,
      level: "ok",
    });
    expect(budgetStatus(usage, 1320).level).toBe("tight"); // 240 left
    expect(budgetStatus(usage, 1321).level).toBe("ok"); // 241 left
    expect(budgetStatus(usage, 1080).level).toBe("tight"); // 0 left
    expect(budgetStatus(usage, 1000)).toEqual({
      usedMinutes: 1080,
      leftMinutes: -80,
      level: "over",
    });
  });
});

describe("weekTotals", () => {
  it("sums per ISO week across a month boundary", () => {
    // KW 49/2026 = Mon 30.11. – Sun 06.12.
    const totals = weekTotals([
      s("2026-11-30", "confirmed", ["08:00", "12:00"]),
      s("2026-12-05", "confirmed", ["08:00", "10:00"]),
      s("2026-12-07", "requested", ["08:00", "09:00"]),
    ]);
    expect(totals).toEqual([
      { year: 2026, week: 49, minutes: 360 },
      { year: 2026, week: 50, minutes: 60 },
    ]);
  });
  it("handles KW 53 and the year change (2026 has 53 weeks)", () => {
    const totals = weekTotals([
      s("2026-12-31", "confirmed", ["08:00", "10:00"]), // KW 53/2026
      s("2027-01-03", "confirmed", ["08:00", "09:00"]), // still KW 53/2026
      s("2027-01-04", "confirmed", ["08:00", "09:00"]), // KW 1/2027
    ]);
    expect(totals).toEqual([
      { year: 2026, week: 53, minutes: 180 },
      { year: 2027, week: 1, minutes: 60 },
    ]);
  });
});

describe("shortNotice", () => {
  it("is true for 0–3 days ahead, false from 4 days and for the past", () => {
    expect(shortNotice("2026-12-12", "2026-12-12")).toBe(true);
    expect(shortNotice("2026-12-15", "2026-12-12")).toBe(true); // 3 days
    expect(shortNotice("2026-12-16", "2026-12-12")).toBe(false); // 4 days
    expect(shortNotice("2026-12-17", "2026-12-12")).toBe(false);
    expect(shortNotice("2026-12-11", "2026-12-12")).toBe(false);
  });
  it("counts calendar days across the DST change (29.03.2026)", () => {
    expect(shortNotice("2026-03-30", "2026-03-27")).toBe(true); // 3 days
    expect(shortNotice("2026-03-31", "2026-03-27")).toBe(false); // 4 days
  });
});
