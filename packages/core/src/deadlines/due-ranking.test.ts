import { describe, expect, it } from "vitest";
import { countByDueFilter, dueFilterOf, isDueFilter, type Rankable, rankDue } from "./due-ranking";

const item = (
  kind: Rankable["kind"],
  urgency: Rankable["urgency"],
  dueOn: string,
  title = kind,
): Rankable => ({ kind, urgency, dueOn, title });

describe("rankDue", () => {
  it("puts overdue before today before soon, whatever the kind", () => {
    const ranked = rankDue([
      item("permit", "soon", "2026-10-25"),
      item("obligation", "overdue", "2026-10-01"),
      item("task", "today", "2026-10-21"),
    ]);
    expect(ranked.map((i) => i.urgency)).toEqual(["overdue", "today", "soon"]);
  });

  it("orders kinds inside a group: permits, instalments, tasks, hours, obligations", () => {
    const ranked = rankDue([
      item("obligation", "today", "2026-10-21"),
      item("hours", "today", "2026-10-21"),
      item("task", "today", "2026-10-21"),
      item("installment", "today", "2026-10-21"),
      item("permit", "today", "2026-10-21"),
    ]);
    expect(ranked.map((i) => i.kind)).toEqual([
      "permit",
      "installment",
      "task",
      "hours",
      "obligation",
    ]);
  });

  it("then the oldest due date, then the title", () => {
    const ranked = rankDue([
      item("task", "overdue", "2026-10-15", "B"),
      item("task", "overdue", "2026-10-10", "Z"),
      item("task", "overdue", "2026-10-15", "A"),
    ]);
    expect(ranked.map((i) => i.title)).toEqual(["Z", "A", "B"]);
  });

  it("does not change its input", () => {
    const input = [item("task", "soon", "2026-10-25"), item("permit", "overdue", "2026-10-01")];
    rankDue(input);
    expect(input[0]?.kind).toBe("task");
  });
});

describe("filters", () => {
  it("maps kinds to chips and counts them", () => {
    expect(dueFilterOf("installment")).toBe("money");
    expect(dueFilterOf("obligation")).toBe("company");
    expect(
      countByDueFilter([{ kind: "task" }, { kind: "task" }, { kind: "permit" }, { kind: "hours" }]),
    ).toEqual({ all: 4, money: 0, permits: 1, hours: 1, tasks: 2, company: 0 });
  });

  it("recognises chip keys", () => {
    expect(isDueFilter("money")).toBe(true);
    expect(isDueFilter("nope")).toBe(false);
    expect(isDueFilter(undefined)).toBe(false);
  });
});
