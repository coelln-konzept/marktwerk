import { describe, expect, it } from "vitest";
import type { ScheduleRow } from "../events/schedule";
import {
  budgetStatus,
  hourBudget,
  monthUsage,
  needGaps,
  needsConfirmation,
  needsFromStaffing,
  parseStaffing,
  rankCandidates,
  shortNotice,
  slotMinutes,
  weekTotals,
} from "./planning";
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

describe("parseStaffing", () => {
  it("accepts valid rows and rejects bad ones", () => {
    expect(parseStaffing([{ dutyRoleKey: "setup", count: 2, scheduleKind: "setup" }])).toEqual([
      { dutyRoleKey: "setup", count: 2, scheduleKind: "setup" },
    ]);
    expect(parseStaffing([])).toEqual([]);
    expect(parseStaffing("x")).toBeNull();
    expect(parseStaffing([{ dutyRoleKey: "", count: 1, scheduleKind: "open" }])).toBeNull();
    expect(parseStaffing([{ dutyRoleKey: "a", count: -1, scheduleKind: "open" }])).toBeNull();
    expect(parseStaffing([{ dutyRoleKey: "a", count: 1.5, scheduleKind: "open" }])).toBeNull();
    expect(parseStaffing([{ dutyRoleKey: "a", count: 1, scheduleKind: "lunch" }])).toBeNull();
  });
  it("rejects the same role and kind twice, allows the same role for two kinds", () => {
    const row = { dutyRoleKey: "crew", count: 1, scheduleKind: "setup" };
    expect(parseStaffing([row, row])).toBeNull();
    expect(parseStaffing([row, { ...row, scheduleKind: "teardown" }])).toHaveLength(2);
  });
});

describe("needsFromStaffing", () => {
  const schedule: ScheduleRow[] = [
    { audience: "vendors", kind: "setup", day: "first", from: "06:00", to: "08:00" },
    { audience: "team", kind: "setup", day: "before", from: "15:00", to: "19:00" },
    { audience: "visitors", kind: "open", day: "each", from: "08:00", to: "16:00" },
    { audience: "vendors", kind: "teardown", day: "last", from: "16:00", to: "18:00" },
  ];
  const staffing = [
    { dutyRoleKey: "crew", count: 2, scheduleKind: "setup" as const },
    { dutyRoleKey: "cash", count: 1, scheduleKind: "open" as const },
    { dutyRoleKey: "crew", count: 2, scheduleKind: "teardown" as const },
  ];
  it("creates one need per day and kind; the team row wins over other audiences", () => {
    expect(needsFromStaffing(staffing, schedule, "2026-12-12", 2)).toEqual([
      // day before: the team setup row
      {
        workDate: "2026-12-11",
        dutyRoleKey: "crew",
        scheduleKind: "setup",
        headcount: 2,
        plannedStart: "15:00",
        plannedEnd: "19:00",
      },
      // day 1: no team setup row that day → the vendors' setup window
      {
        workDate: "2026-12-12",
        dutyRoleKey: "crew",
        scheduleKind: "setup",
        headcount: 2,
        plannedStart: "06:00",
        plannedEnd: "08:00",
      },
      {
        workDate: "2026-12-12",
        dutyRoleKey: "cash",
        scheduleKind: "open",
        headcount: 1,
        plannedStart: "08:00",
        plannedEnd: "16:00",
      },
      {
        workDate: "2026-12-13",
        dutyRoleKey: "cash",
        scheduleKind: "open",
        headcount: 1,
        plannedStart: "08:00",
        plannedEnd: "16:00",
      },
      {
        workDate: "2026-12-13",
        dutyRoleKey: "crew",
        scheduleKind: "teardown",
        headcount: 2,
        plannedStart: "16:00",
        plannedEnd: "18:00",
      },
    ]);
  });
  it("skips rows with count 0 and kinds without any row that day", () => {
    expect(
      needsFromStaffing(
        [{ dutyRoleKey: "x", count: 0, scheduleKind: "open" }],
        schedule,
        "2026-12-12",
        1,
      ),
    ).toEqual([]);
    expect(needsFromStaffing(staffing, [], "2026-12-12", 1)).toEqual([]);
  });
});

describe("needGaps", () => {
  it("counts requested and confirmed as filled; declined/cancelled reopen", () => {
    expect(needGaps(2, ["requested", "declined", "cancelled"])).toEqual({
      filled: 1,
      open: 1,
      over: 0,
    });
    expect(needGaps(1, ["confirmed", "requested"])).toEqual({ filled: 2, open: 0, over: 1 });
    expect(needGaps(0, [])).toEqual({ filled: 0, open: 0, over: 0 });
  });
});

describe("rankCandidates", () => {
  const slot = { workDate: "2026-12-12", plannedStart: "08:00", plannedEnd: "16:00" }; // 450 net (30 break)
  const base = { dayShifts: [], recentShifts: [], unavailableNote: undefined };
  it("orders usual → other → unavailable, then by hours left after, then name", () => {
    const ranked = rankCandidates(slot, [
      { ...base, staffMemberId: "a", displayName: "Anna", usual: false, leftMinutes: 1200 },
      { ...base, staffMemberId: "b", displayName: "Ben", usual: true, leftMinutes: 600 },
      { ...base, staffMemberId: "c", displayName: "Cem", usual: false, leftMinutes: 1200 },
      {
        ...base,
        staffMemberId: "d",
        displayName: "Dora",
        usual: true,
        leftMinutes: 2000,
        unavailableNote: "nur bis 15 Uhr",
      },
      { ...base, staffMemberId: "e", displayName: "Eva", usual: false, leftMinutes: 1800 },
    ]);
    expect(ranked.map((c) => c.staffMemberId)).toEqual(["b", "e", "a", "c", "d"]);
    expect(ranked[4]).toMatchObject({
      group: "unavailable",
      flags: ["unavailable"],
      unavailableNote: "nur bis 15 Uhr",
    });
    expect(ranked[0]).toMatchObject({ leftBefore: 600, leftAfter: 150 });
  });
  it("flags over budget after, already scheduled, overlap and ArbZG", () => {
    const [c] = rankCandidates(slot, [
      {
        ...base,
        staffMemberId: "a",
        displayName: "Anna",
        usual: false,
        leftMinutes: 300,
        dayShifts: [
          {
            workDate: "2026-12-12",
            status: "confirmed",
            plannedStart: "14:00",
            plannedEnd: "20:00",
            actualStart: null,
            actualEnd: null,
            breakMinutes: 0,
          },
        ],
        recentShifts: [
          {
            workDate: "2026-12-12",
            status: "confirmed",
            plannedStart: "14:00",
            plannedEnd: "20:00",
            actualStart: null,
            actualEnd: null,
            breakMinutes: 0,
          },
        ],
      },
    ]);
    expect(c?.flags).toEqual(["already_scheduled", "overlap", "over_budget_after", "worktime"]);
    expect(needsConfirmation(["already_scheduled"])).toBe(false);
    expect(needsConfirmation(["already_scheduled", "overlap"])).toBe(true);
  });
  it("slotMinutes deducts the statutory break", () => {
    expect(slotMinutes(slot)).toEqual({ net: 450, breakMinutes: 30 });
    expect(
      slotMinutes({ workDate: "2026-12-12", plannedStart: "08:00", plannedEnd: "12:00" }),
    ).toEqual({ net: 240, breakMinutes: 0 });
    // work excludes the break: 6 h 20 min gross still needs 30 min, 9 h 35 min gross needs 45
    expect(
      slotMinutes({ workDate: "2026-12-12", plannedStart: "08:00", plannedEnd: "14:20" }),
    ).toEqual({ net: 350, breakMinutes: 30 });
    expect(
      slotMinutes({ workDate: "2026-12-12", plannedStart: "08:00", plannedEnd: "14:00" }),
    ).toEqual({ net: 360, breakMinutes: 0 });
    expect(
      slotMinutes({ workDate: "2026-12-12", plannedStart: "08:00", plannedEnd: "17:35" }),
    ).toEqual({ net: 530, breakMinutes: 45 });
  });
});
