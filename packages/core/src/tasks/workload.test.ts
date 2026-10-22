import { describe, expect, it } from "vitest";
import { fileEvidenceOf, missingEvidence, pendingFileEvidence } from "./evidence";
import { taskHealth } from "./health";
import { findMentions } from "./mentions";
import {
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  hiringSignal,
  loadLevel,
  loadWeekStart,
  MINIJOBBER_HOURS_PER_MONTH,
  monthlyCapacityHours,
  weeklyCapacityHours,
  weekStarts,
} from "./workload";

describe("weeklyCapacityHours", () => {
  const contracts = [
    { validFrom: "2025-01-01", validUntil: "2026-05-31", contractedHoursPerWeek: 10 },
    { validFrom: "2026-06-01", validUntil: null, contractedHoursPerWeek: 30 },
  ];
  it("uses the contract valid on the day", () => {
    expect(weeklyCapacityHours(contracts, "2026-05-31")).toBe(10);
    expect(weeklyCapacityHours(contracts, "2026-10-21")).toBe(30);
  });
  it("falls back to 20 h without a contract, outside it, or without hours", () => {
    expect(DEFAULT_WEEKLY_CAPACITY_HOURS).toBe(20);
    expect(weeklyCapacityHours([], "2026-10-21")).toBe(20);
    expect(weeklyCapacityHours(contracts, "2024-12-31")).toBe(20);
    expect(
      weeklyCapacityHours(
        [{ validFrom: "2026-01-01", validUntil: null, contractedHoursPerWeek: null }],
        "2026-10-21",
      ),
    ).toBe(20);
  });
});

describe("loadLevel", () => {
  it("is ok below 80 %, warn up to 100 %, critical above", () => {
    expect(loadLevel(15.9, 20)).toBe("ok");
    expect(loadLevel(16, 20)).toBe("warn");
    expect(loadLevel(20, 20)).toBe("warn");
    expect(loadLevel(20.5, 20)).toBe("critical");
    expect(loadLevel(0, 0)).toBe("ok");
    expect(loadLevel(1, 0)).toBe("critical");
  });
});

describe("weeks", () => {
  it("counts overdue tasks in the current week and ignores undated ones", () => {
    expect(loadWeekStart("2026-10-01", "2026-10-21")).toBe("2026-10-19");
    expect(loadWeekStart("2026-10-25", "2026-10-21")).toBe("2026-10-19");
    expect(loadWeekStart("2026-10-26", "2026-10-21")).toBe("2026-10-26");
    expect(loadWeekStart(null, "2026-10-21")).toBeNull();
  });
  it("lists consecutive Mondays, across the year boundary", () => {
    expect(weekStarts("2026-12-16", 3)).toEqual(["2026-12-14", "2026-12-21", "2026-12-28"]);
    expect(weekStarts("2026-12-31", 2)).toEqual(["2026-12-28", "2027-01-04"]);
  });
});

describe("hiringSignal", () => {
  it("turns the monthly hours gap into Minijobbers at 40 h each", () => {
    expect(MINIJOBBER_HOURS_PER_MONTH).toBe(40);
    const signal = hiringSignal([
      { month: "2026-04", demandHours: 300, capacityHours: 260 },
      { month: "2026-05", demandHours: 500, capacityHours: 300 },
      { month: "2026-06", demandHours: 100, capacityHours: 300 },
      { month: "2026-07", demandHours: 0, capacityHours: 300 },
    ]);
    expect(signal.months.map((m) => m.gapHours)).toEqual([40, 200, 0, 0]);
    expect(signal.months.map((m) => m.minijobbers)).toEqual([1, 5, 0, 0]);
    expect(signal.peakMinijobbers).toBe(5);
    // the month without any demand is not part of the average
    expect(signal.averageMinijobbers).toBeCloseTo(2, 5);
    expect(signal.demandHours).toBe(900);
    expect(signal.capacityHours).toBe(1160);
  });
  it("is zero without demand", () => {
    expect(hiringSignal([]).averageMinijobbers).toBe(0);
  });
  it("scales weekly hours to a month by days ÷ 7", () => {
    expect(monthlyCapacityHours(7, 2026, 2)).toBe(28);
    expect(monthlyCapacityHours(7, 2026, 3)).toBe(31);
  });
});

describe("missingEvidence", () => {
  const base = {
    requiresNote: false,
    requiresPhoto: false,
    requiresAttachment: false,
    hasNote: false,
    openCheckItems: 0,
  };
  it("needs a note when required and open check items to be ticked", () => {
    expect(missingEvidence(base)).toEqual([]);
    expect(missingEvidence({ ...base, requiresNote: true })).toEqual(["note"]);
    expect(missingEvidence({ ...base, requiresNote: true, hasNote: true })).toEqual([]);
    expect(missingEvidence({ ...base, requiresNote: true, openCheckItems: 2 })).toEqual([
      "note",
      "check_items",
    ]);
  });
  it("blocks on a missing photo or attachment and is satisfied by the matching document", () => {
    const input = { ...base, requiresPhoto: true, requiresAttachment: true };
    expect(missingEvidence(input)).toEqual(["photo", "attachment"]);
    expect(missingEvidence({ ...input, hasPhoto: true })).toEqual(["attachment"]);
    expect(missingEvidence({ ...input, hasPhoto: true, hasAttachment: true })).toEqual([]);
    expect(pendingFileEvidence(input)).toEqual([]);
  });
  it("reads photo and attachment off the document kinds", () => {
    expect(fileEvidenceOf([])).toEqual({ hasPhoto: false, hasAttachment: false });
    expect(fileEvidenceOf(["photo"])).toEqual({ hasPhoto: true, hasAttachment: false });
    expect(fileEvidenceOf(["photo", "other"])).toEqual({ hasPhoto: true, hasAttachment: true });
    expect(fileEvidenceOf(["invoice"])).toEqual({ hasPhoto: false, hasAttachment: true });
  });
});

describe("findMentions", () => {
  const people = [
    { id: "a", displayName: "Anna Meier" },
    { id: "b", displayName: "Anna Meier-Schulz" },
    { id: "c", displayName: "Ben Test" },
    { id: "d", displayName: "Jörg Müller" },
  ];
  it("finds full display names, case-insensitively and with umlauts", () => {
    expect(findMentions("Bitte @anna meier und @Jörg Müller prüfen", people).sort()).toEqual([
      "a",
      "d",
    ]);
  });
  it("prefers the longest name and needs a word boundary", () => {
    expect(findMentions("@Anna Meier-Schulz bitte", people)).toEqual(["b"]);
    expect(findMentions("@Anna Meiers bitte", people)).toEqual([]);
    expect(findMentions("mail@Ben Test", people)).toEqual([]);
    expect(findMentions("@Ben Test, ok?", people)).toEqual(["c"]);
  });
  it("ignores names without @ and mentions twice only once", () => {
    expect(findMentions("Anna Meier weiß Bescheid", people)).toEqual([]);
    expect(findMentions("@Ben Test @Ben Test", people)).toEqual(["c"]);
  });
});

describe("taskHealth", () => {
  it("rates by overdue, blocked and repeatedly carried-over tasks", () => {
    const ok = { open: 8, overdue: 0, blocked: 0, maxRollover: 0 };
    expect(taskHealth({ ...ok, open: 0 })).toBeNull();
    expect(taskHealth(ok)).toBe("ok");
    expect(taskHealth({ ...ok, overdue: 1 })).toBe("warn");
    expect(taskHealth({ ...ok, blocked: 1 })).toBe("warn");
    expect(taskHealth({ ...ok, overdue: 5 })).toBe("critical");
    expect(taskHealth({ ...ok, overdue: 1, maxRollover: 3 })).toBe("critical");
  });
});
