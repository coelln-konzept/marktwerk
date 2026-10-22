import { describe, expect, it } from "vitest";
import {
  isOpenTask,
  type PlanItem,
  type PlanTask,
  planPropagation,
  planSize,
  propagationChanges,
} from "./propagation";

const base = {
  description: null,
  phase: "pre",
  category: "general",
  priority: "normal",
  estimateMinutes: 30,
  requiresPhoto: false,
  requiresNote: false,
  requiresAttachment: false,
  isKey: false,
  permitType: null,
  dutyRoleId: null,
  dueAt: 1_000,
};

const item = (stableKey: string, patch: Partial<PlanItem> = {}): PlanItem => ({
  ...base,
  stableKey,
  title: `Item ${stableKey}`,
  ...patch,
});

const task = (stableKey: string, patch: Partial<PlanTask> = {}): PlanTask => ({
  ...base,
  id: `task-${stableKey}`,
  templateStableKey: stableKey,
  title: `Item ${stableKey}`,
  status: "todo",
  customized: false,
  removedFromTemplate: false,
  dueOverridden: false,
  ...patch,
});

describe("permit type", () => {
  it("is a change when the item starts to name a permit (or stops)", () => {
    expect(propagationChanges(item("a", { permitType: "market_permit" }), task("a"))).toEqual([
      "permit",
    ]);
    expect(propagationChanges(item("a"), task("a", { permitType: "market_permit" }))).toEqual([
      "permit",
    ]);
    expect(
      propagationChanges(
        item("a", { permitType: "market_permit" }),
        task("a", { permitType: "market_permit" }),
      ),
    ).toEqual([]);
  });
});

describe("isOpenTask", () => {
  it("treats done, skipped and cancelled as closed", () => {
    for (const status of ["todo", "in_progress", "waiting_external", "blocked"])
      expect(isOpenTask(status)).toBe(true);
    for (const status of ["done", "skipped", "cancelled"]) expect(isOpenTask(status)).toBe(false);
  });
});

describe("planPropagation", () => {
  it("adds items without a task", () => {
    const plan = planPropagation([item("a"), item("b")], [task("a")]);
    expect(plan.add.map((i) => i.stableKey)).toEqual(["b"]);
    expect(plan.same).toBe(1);
    expect(planSize(plan)).toBe(1);
  });

  it("updates open, untouched tasks and names what changed", () => {
    const plan = planPropagation(
      [item("a", { title: "Neu", estimateMinutes: 45, dueAt: 2_000, priority: "high" })],
      [task("a")],
    );
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0]?.changes).toEqual(["title", "priority", "estimate", "due"]);
  });

  it("does not report a due change for tasks whose date was edited by hand", () => {
    const changes = propagationChanges(
      item("a", { dueAt: 2_000 }),
      task("a", { dueOverridden: true }),
    );
    expect(changes).toEqual([]);
  });

  it("marks open, untouched tasks of removed items", () => {
    const plan = planPropagation([item("a")], [task("a"), task("gone")]);
    expect(plan.remove.map((t) => t.id)).toEqual(["task-gone"]);
    expect(planSize(plan)).toBe(1);
  });

  it("never touches done, skipped or cancelled tasks", () => {
    const plan = planPropagation(
      [item("a", { title: "Neu" })],
      [
        task("a", { status: "done" }),
        task("gone", { status: "done" }),
        task("gone2", { status: "skipped" }),
        task("gone3", { status: "cancelled" }),
      ],
    );
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.keep.map((k) => [k.task.id, k.reason])).toEqual([
      ["task-a", "closed"],
      ["task-gone", "closed"],
      ["task-gone2", "closed"],
      ["task-gone3", "closed"],
    ]);
  });

  it("never touches customised tasks, even when the item vanished", () => {
    const plan = planPropagation(
      [item("a", { title: "Neu" })],
      [task("a", { customized: true }), task("gone", { customized: true })],
    );
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.keep.map((k) => k.reason)).toEqual(["customized", "customized"]);
  });

  it("restores a task whose item came back", () => {
    const plan = planPropagation([item("a")], [task("a", { removedFromTemplate: true })]);
    expect(plan.update[0]?.changes).toEqual(["restored"]);
  });

  it("does not mark a task twice", () => {
    const plan = planPropagation([], [task("gone", { removedFromTemplate: true })]);
    expect(plan.remove).toEqual([]);
    expect(plan.same).toBe(1);
  });

  it("ignores tasks that did not come from the template", () => {
    const plan = planPropagation(
      [item("a")],
      [task("a"), { ...task("x"), templateStableKey: null }],
    );
    expect(plan.remove).toEqual([]);
    expect(plan.keep).toEqual([]);
  });

  it("notices duty and evidence changes", () => {
    const plan = planPropagation(
      [item("a", { dutyRoleId: "r1", requiresPhoto: true })],
      [task("a")],
    );
    expect(plan.update[0]?.changes).toEqual(["evidence", "duty"]);
  });

  it("carries a changed Kernaufgabe flag like the other copied fields", () => {
    const plan = planPropagation([item("a", { isKey: true })], [task("a")]);
    expect(plan.update[0]?.changes).toEqual(["key"]);
    const back = planPropagation([item("a")], [task("a", { isKey: true })]);
    expect(back.update[0]?.changes).toEqual(["key"]);
    expect(planPropagation([item("a", { isKey: true })], [task("a", { isKey: true })]).same).toBe(
      1,
    );
  });
});
