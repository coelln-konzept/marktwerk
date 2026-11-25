import { describe, expect, it } from "vitest";
import {
  checkItemTree,
  flaggedDueAt,
  inheritedItem,
  isOwnWorkItem,
  isSubtaskOverdue,
  type NestingInput,
  nestingProblem,
  openSubtaskCount,
  parentsFirst,
  subtaskProgress,
} from "./subtasks";

const today = "2026-11-13";

describe("nestingProblem", () => {
  const base: NestingInput = {
    taskId: "t",
    taskEventId: "e1",
    taskHasSubtasks: false,
    taskOpen: true,
    parent: { id: "p", eventId: "e1", parentTaskId: null, status: "todo" },
  };
  it("allows a task without subtasks under a top-level task of the same event", () => {
    expect(nestingProblem(base)).toBeNull();
    expect(
      nestingProblem({
        ...base,
        taskEventId: null,
        taskOpen: false,
        parent: { ...base.parent, eventId: null, status: "done" },
      }),
    ).toBeNull();
  });
  it("keeps it to one level and inside one event", () => {
    expect(nestingProblem({ ...base, parent: { ...base.parent, id: "t" } })).toBe("self");
    expect(nestingProblem({ ...base, parent: { ...base.parent, parentTaskId: "x" } })).toBe(
      "parent_is_subtask",
    );
    expect(nestingProblem({ ...base, taskHasSubtasks: true })).toBe("has_subtasks");
    expect(nestingProblem({ ...base, parent: { ...base.parent, eventId: "e2" } })).toBe(
      "other_event",
    );
    expect(nestingProblem({ ...base, taskEventId: null })).toBe("other_event");
    expect(nestingProblem({ ...base, parent: { ...base.parent, status: "cancelled" } })).toBe(
      "parent_cancelled",
    );
    expect(nestingProblem({ ...base, parent: { ...base.parent, status: "skipped" } })).toBe(
      "parent_closed",
    );
  });
});

describe("subtaskProgress", () => {
  it("counts finished against all but deleted ones, and overdue open ones", () => {
    expect(
      subtaskProgress(
        [
          { status: "done", dueOn: "2026-11-01" },
          { status: "skipped", dueOn: null },
          { status: "todo", dueOn: "2026-11-12" },
          { status: "todo", dueOn: today },
          { status: "cancelled", dueOn: "2026-11-01" },
        ],
        today,
      ),
    ).toEqual({ total: 4, done: 2, overdue: 1 });
  });
  it("does not call waiting or snoozed subtasks overdue", () => {
    expect(isSubtaskOverdue({ status: "waiting_external", dueOn: "2026-11-01" }, today)).toBe(
      false,
    );
    expect(
      isSubtaskOverdue({ status: "todo", dueOn: "2026-11-01", snoozedUntil: "2026-11-20" }, today),
    ).toBe(false);
    // back on its snooze date
    expect(
      isSubtaskOverdue({ status: "todo", dueOn: "2026-11-01", snoozedUntil: today }, today),
    ).toBe(true);
    expect(isSubtaskOverdue({ status: "blocked", dueOn: "2026-11-12" }, today)).toBe(true);
    expect(isSubtaskOverdue({ status: "done", dueOn: "2026-11-01" }, today)).toBe(false);
  });
  it("counts the open subtasks of the done gate", () => {
    expect(
      openSubtaskCount([
        { status: "todo" },
        { status: "waiting_external" },
        { status: "done" },
        { status: "cancelled" },
      ]),
    ).toBe(2);
  });
});

describe("isOwnWorkItem", () => {
  it("keeps top-level tasks and subtasks of somebody else's parent", () => {
    expect(isOwnWorkItem({ parentTaskId: null, assigneeId: null, parentAssigneeId: null })).toBe(
      true,
    );
    expect(isOwnWorkItem({ parentTaskId: "p", assigneeId: "bob", parentAssigneeId: "ann" })).toBe(
      true,
    );
    expect(isOwnWorkItem({ parentTaskId: "p", assigneeId: "bob", parentAssigneeId: null })).toBe(
      true,
    );
  });
  it("leaves out subtasks the parent already stands for", () => {
    expect(isOwnWorkItem({ parentTaskId: "p", assigneeId: "ann", parentAssigneeId: "ann" })).toBe(
      false,
    );
    expect(isOwnWorkItem({ parentTaskId: "p", assigneeId: null, parentAssigneeId: "ann" })).toBe(
      false,
    );
  });
});

describe("flaggedDueAt", () => {
  const now = new Date("2026-11-13T10:00:00Z");
  const own = new Date("2026-11-20T08:00:00Z");
  it("keeps the own due date while no subtask is overdue", () => {
    expect(flaggedDueAt(own, [new Date("2026-11-14T08:00:00Z"), null], now)).toEqual({
      dueAt: own,
      fromSubtask: false,
    });
    expect(flaggedDueAt(null, [], now)).toEqual({ dueAt: null, fromSubtask: false });
  });
  it("takes the earliest overdue subtask, also for an undated parent", () => {
    const a = new Date("2026-11-10T08:00:00Z");
    const b = new Date("2026-11-12T08:00:00Z");
    expect(flaggedDueAt(own, [b, a], now)).toEqual({ dueAt: a, fromSubtask: true });
    expect(flaggedDueAt(null, [b], now)).toEqual({ dueAt: b, fromSubtask: true });
    // an overdue parent stays as it is when it is earlier
    const older = new Date("2026-11-01T08:00:00Z");
    expect(flaggedDueAt(older, [a], now)).toEqual({ dueAt: older, fromSubtask: false });
  });
  it("compares instants, so the DST change does not matter", () => {
    const after = new Date("2026-10-26T09:00:00Z");
    const sub = new Date("2026-10-25T00:30:00Z");
    expect(flaggedDueAt(null, [sub], after).dueAt).toEqual(sub);
  });
});

describe("template child items", () => {
  it("finds unknown parents, self references and a second level", () => {
    expect(
      checkItemTree([
        { stableKey: "a", parentKey: null },
        { stableKey: "b", parentKey: "a" },
        { stableKey: "c", parentKey: "b" },
        { stableKey: "d", parentKey: "zzz" },
        { stableKey: "e", parentKey: "e" },
      ]),
    ).toEqual([
      { key: "c", code: "nested_child" },
      { key: "d", code: "unknown_parent" },
      { key: "e", code: "self_parent" },
    ]);
    expect(checkItemTree([{ stableKey: "a", parentKey: null }])).toEqual([]);
  });

  const parent = {
    anchorKey: "event_day",
    offsetDays: -14,
    dayMode: "business" as const,
    dueTime: "10:00",
    dutyRoleId: "role-office",
  };
  const child = {
    anchorKey: "setup_day",
    offsetDays: -2,
    dayMode: "calendar" as const,
    dueTime: null,
    dutyRoleId: null,
    ownDue: false,
    title: "Teil",
  };
  it("lets a child take the parent's schedule and role unless it has its own", () => {
    expect(inheritedItem(child, parent)).toEqual({
      ...child,
      anchorKey: "event_day",
      offsetDays: -14,
      dayMode: "business",
      dueTime: "10:00",
      dutyRoleId: "role-office",
    });
    expect(inheritedItem({ ...child, ownDue: true, dutyRoleId: "role-x" }, parent)).toEqual({
      ...child,
      ownDue: true,
      dutyRoleId: "role-x",
    });
    expect(inheritedItem(child, null)).toBe(child);
  });

  it("orders parents first and drops children whose parent does not apply", () => {
    const items = [
      { stableKey: "c1", parentKey: "a" },
      { stableKey: "a", parentKey: null },
      { stableKey: "x1", parentKey: "x" },
      { stableKey: "b", parentKey: null },
    ];
    expect(parentsFirst(items).map((i) => i.stableKey)).toEqual(["a", "b", "c1"]);
  });
});
