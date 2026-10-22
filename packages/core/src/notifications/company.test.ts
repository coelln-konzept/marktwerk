import { describe, expect, it } from "vitest";
import {
  companyDedupeKey,
  compareByUrgency,
  dueBucket,
  parseCompanyDedupeKey,
  permitApplyKind,
  permitDecisionKind,
  permitExpiryKind,
  taskKind,
  taskSeverity,
} from "./company";

const ID = "11111111-1111-4111-8111-111111111111";

describe("dedupe key", () => {
  it("is one key per subject, reason and due date, and round-trips", () => {
    const key = companyDedupeKey("task_overdue", ID, "2026-10-20");
    expect(key).toBe(`company:task:${ID}:task_overdue:2026-10-20`);
    expect(parseCompanyDedupeKey(key)).toEqual({
      kind: "task_overdue",
      subjectId: ID,
      dueOn: "2026-10-20",
    });
    expect(companyDedupeKey("task_overdue", ID, "2026-10-21")).not.toBe(key);
    expect(companyDedupeKey("task_due_soon", ID, "2026-10-20")).not.toBe(key);
  });

  it("does not parse personal reminder keys", () => {
    expect(parseCompanyDedupeKey(`task:${ID}:overdue:2026-10-20T10:00:00.000Z`)).toBeNull();
    expect(parseCompanyDedupeKey(null)).toBeNull();
  });
});

describe("taskKind", () => {
  it("overdue before today, due soon today and tomorrow, nothing further ahead", () => {
    expect(taskKind("2026-10-21", "2026-10-22", false)).toBe("task_overdue");
    expect(taskKind("2026-10-22", "2026-10-22", false)).toBe("task_due_soon");
    expect(taskKind("2026-10-23", "2026-10-22", false)).toBe("task_due_soon");
    expect(taskKind("2026-10-24", "2026-10-22", false)).toBeNull();
  });

  it("looks three days ahead for Kernaufgaben", () => {
    expect(taskKind("2026-10-25", "2026-10-22", true)).toBe("task_due_soon");
    expect(taskKind("2026-10-26", "2026-10-22", true)).toBeNull();
  });

  it("counts calendar days across the DST switch (25.10.2026)", () => {
    expect(taskKind("2026-10-26", "2026-10-25", false)).toBe("task_due_soon");
    expect(taskKind("2026-10-27", "2026-10-25", false)).toBeNull();
  });
});

describe("severity", () => {
  it("weighs overdue and Kernaufgaben higher", () => {
    expect(taskSeverity("task_overdue", true)).toBe("critical");
    expect(taskSeverity("task_overdue", false)).toBe("warning");
    expect(taskSeverity("task_due_soon", true)).toBe("warning");
    expect(taskSeverity("task_due_soon", false)).toBe("info");
  });
});

describe("permit rules", () => {
  it("lists unfiled permits within the horizon only", () => {
    expect(permitApplyKind("2026-11-21", "2026-10-22", 30)).toEqual({ severity: "info" });
    expect(permitApplyKind("2026-11-22", "2026-10-22", 30)).toBeNull();
    expect(permitApplyKind("2026-10-25", "2026-10-22", 30)).toEqual({ severity: "warning" });
    expect(permitApplyKind("2026-10-21", "2026-10-22", 30)).toEqual({ severity: "critical" });
  });

  it("lists a decision from a week before it is expected", () => {
    expect(permitDecisionKind("2026-10-29", "2026-10-22")).toEqual({ severity: "info" });
    expect(permitDecisionKind("2026-10-30", "2026-10-22")).toBeNull();
    expect(permitDecisionKind("2026-10-20", "2026-10-22")).toEqual({ severity: "warning" });
  });

  it("flags a permit that ends before a market within the horizon", () => {
    expect(permitExpiryKind("2026-11-01", "2026-11-14", "2026-10-22", 30)).toEqual({
      severity: "warning",
    });
    expect(permitExpiryKind("2026-10-25", "2026-10-28", "2026-10-22", 30)).toEqual({
      severity: "critical",
    });
    // valid on the first market day: fine
    expect(permitExpiryKind("2026-11-14", "2026-11-14", "2026-10-22", 30)).toBeNull();
    // market far away: not yet
    expect(permitExpiryKind("2026-11-01", "2027-03-14", "2026-10-22", 30)).toBeNull();
  });
});

describe("compareByUrgency", () => {
  const at = "2026-10-20T08:00:00.000Z";
  const items = [
    { id: "info-soon", severity: "info" as const, dueOn: "2026-10-23", createdAt: at },
    { id: "warn-old", severity: "warning" as const, dueOn: "2026-10-15", createdAt: at },
    { id: "crit-late", severity: "critical" as const, dueOn: "2026-10-21", createdAt: at },
    { id: "crit-early", severity: "critical" as const, dueOn: "2026-10-10", createdAt: at },
    { id: "warn-none", severity: "warning" as const, dueOn: null, createdAt: at },
  ];

  it("critical first, then warning, inside a level the earliest date; undated last", () => {
    expect([...items].sort(compareByUrgency).map((i) => i.id)).toEqual([
      "crit-early",
      "crit-late",
      "warn-old",
      "warn-none",
      "info-soon",
    ]);
  });

  it("breaks ties with the newest notification", () => {
    const a = { severity: "info" as const, dueOn: "2026-10-23", createdAt: "2026-10-20T08:00:00Z" };
    const b = { ...a, createdAt: "2026-10-21T08:00:00Z" };
    expect([a, b].sort(compareByUrgency)[0]).toBe(b);
  });
});

describe("dueBucket", () => {
  it("groups by distance to today", () => {
    expect(dueBucket("2026-10-21", "2026-10-22")).toBe("overdue");
    expect(dueBucket("2026-10-22", "2026-10-22")).toBe("today");
    expect(dueBucket("2026-10-29", "2026-10-22")).toBe("soon");
    expect(dueBucket("2026-10-30", "2026-10-22")).toBe("later");
    expect(dueBucket(null, "2026-10-22")).toBe("later");
  });
});
