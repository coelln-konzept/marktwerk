import { describe, expect, it } from "vitest";
import { defaultAnchors } from "./anchors";
import { issueCount, overallHealth, permitsReason, tasksReason, teamHealth } from "./health";

describe("health reasons", () => {
  it("names what is wrong with the permits", () => {
    expect(permitsReason(null, 0)).toBeNull();
    expect(permitsReason("ok", 0)).toEqual({ key: "ok" });
    expect(permitsReason("critical", 1)).toEqual({ key: "permits", count: 1 });
    expect(permitsReason("warn", 2)).toEqual({ key: "permits", count: 2 });
    expect(permitsReason("warn", 0)).toEqual({ key: "permitsEnding" });
  });

  it("names what is wrong with the tasks, overdue first", () => {
    expect(tasksReason(null, 0, 0)).toBeNull();
    expect(tasksReason("ok", 0, 0)).toEqual({ key: "ok" });
    expect(tasksReason("critical", 5, 2)).toEqual({ key: "tasksOverdue", count: 5 });
    expect(tasksReason("warn", 0, 2)).toEqual({ key: "tasksBlocked", count: 2 });
    expect(tasksReason("critical", 0, 0)).toEqual({ key: "tasksRollover" });
  });
});

describe("event health", () => {
  it("takes the worst tracked dimension and ignores untracked ones", () => {
    expect(overallHealth({ permits: null, tasks: null, team: null, money: null })).toBeNull();
    expect(overallHealth({ permits: null, tasks: "ok", team: "warn", money: null })).toBe("warn");
    expect(overallHealth({ permits: "critical", tasks: "ok", team: "warn", money: "ok" })).toBe(
      "critical",
    );
    expect(issueCount({ permits: "critical", tasks: "ok", team: "warn", money: null })).toBe(2);
  });

  it("rates team staffing by filled duty roles", () => {
    expect(teamHealth(7, 7)).toBe("ok");
    expect(teamHealth(5, 7)).toBe("warn");
    expect(teamHealth(0, 7)).toBe("critical");
    expect(teamHealth(0, 0)).toBeNull();
  });
});

describe("defaultAnchors", () => {
  it("sets up single-day markets on the day and multi-day events the day before", () => {
    expect(defaultAnchors("2026-06-07", 1)).toEqual({
      event_day: "2026-06-07",
      setup_day: "2026-06-07",
      teardown_day: "2026-06-07",
      booking_cutoff: "2026-06-01",
    });
    expect(defaultAnchors("2026-08-21", 3)).toEqual({
      event_day: "2026-08-21",
      setup_day: "2026-08-20",
      teardown_day: "2026-08-23",
      booking_cutoff: "2026-08-17",
    });
  });
});
