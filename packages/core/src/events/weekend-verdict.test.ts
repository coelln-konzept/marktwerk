import { describe, expect, it } from "vitest";
import {
  followingWeekend,
  holdsUpWeekend,
  type VerdictInput,
  weekendVerdict,
} from "./weekend-verdict";

const base: VerdictInput = {
  permits: "ok",
  permitsMissing: 0,
  tasks: "ok",
  tasksOverdue: 0,
  tasksDueToday: 0,
  tasksBlocked: 0,
};
const verdict = (patch: Partial<VerdictInput>) => weekendVerdict({ ...base, ...patch });

describe("weekendVerdict", () => {
  it("is Im Plan without reasons when permits and tasks are fine", () => {
    expect(verdict({})).toEqual({ level: "ok", reasons: [] });
  });

  it("is critical as soon as one task is overdue (same colour as Board > Bereitschaft)", () => {
    expect(verdict({ tasks: "warn", tasksOverdue: 1 }).level).toBe("critical");
  });

  it("names the overdue count and says that the permits are fine", () => {
    expect(verdict({ tasks: "critical", tasksOverdue: 4 })).toEqual({
      level: "critical",
      reasons: [{ key: "tasksOverdue", count: 4 }, { key: "permitsOk" }],
    });
  });

  it("lists overdue tasks and missing permits together", () => {
    expect(
      verdict({ tasks: "warn", tasksOverdue: 2, permits: "critical", permitsMissing: 1 }),
    ).toEqual({
      level: "critical",
      reasons: [
        { key: "tasksOverdue", count: 2 },
        { key: "permitsMissing", count: 1 },
      ],
    });
  });

  it("is a warning for tasks due today only", () => {
    expect(verdict({ tasksDueToday: 2 })).toEqual({
      level: "warn",
      reasons: [{ key: "tasksToday", count: 2 }, { key: "permitsOk" }],
    });
  });

  it("is a warning for blocked tasks", () => {
    expect(verdict({ tasks: "warn", tasksBlocked: 1 }).level).toBe("warn");
  });

  it("a permit warning alone is Achtung, a permit ending before the event is named", () => {
    expect(verdict({ permits: "warn" })).toEqual({
      level: "warn",
      reasons: [{ key: "permitsEnding" }],
    });
  });

  it("counts a missing permit even if the health level was not tracked", () => {
    expect(verdict({ permits: null, permitsMissing: 1 })).toEqual({
      level: "warn",
      reasons: [{ key: "permitsMissing", count: 1 }],
    });
  });

  it("explains a critical task level without overdue tasks as carried over", () => {
    expect(verdict({ tasks: "critical" })).toEqual({
      level: "critical",
      reasons: [{ key: "tasksRollover" }, { key: "permitsOk" }],
    });
  });

  it("is none while nothing is tracked", () => {
    expect(verdict({ permits: null, tasks: null })).toEqual({ level: "none", reasons: [] });
  });

  it("is judged by the dimension that is tracked when the other is not", () => {
    expect(verdict({ permits: null, tasks: "ok" }).level).toBe("ok");
    expect(verdict({ permits: null, tasks: null, tasksOverdue: 1 }).level).toBe("critical");
  });
});

describe("holdsUpWeekend", () => {
  it("counts overdue and due-today tasks and permits", () => {
    expect(holdsUpWeekend({ kind: "task", urgency: "overdue" })).toBe(true);
    expect(holdsUpWeekend({ kind: "task", urgency: "today" })).toBe(true);
    expect(holdsUpWeekend({ kind: "permit", urgency: "overdue" })).toBe(true);
  });

  it("ignores tasks dated in the future, waiting tasks and other kinds", () => {
    expect(holdsUpWeekend({ kind: "task", urgency: "soon" })).toBe(false);
    expect(holdsUpWeekend({ kind: "permit", urgency: "upcoming" })).toBe(false);
    expect(holdsUpWeekend({ kind: "task", urgency: "waiting" })).toBe(false);
    expect(holdsUpWeekend({ kind: "installment", urgency: "overdue" })).toBe(false);
  });
});

describe("followingWeekend", () => {
  it("is exactly one week later, across a month and the DST change", () => {
    expect(followingWeekend("2026-10-31")).toEqual({
      saturday: "2026-11-07",
      sunday: "2026-11-08",
    });
    expect(followingWeekend("2026-03-21")).toEqual({
      saturday: "2026-03-28",
      sunday: "2026-03-29",
    });
    expect(followingWeekend("2026-12-26")).toEqual({
      saturday: "2027-01-02",
      sunday: "2027-01-03",
    });
  });
});
