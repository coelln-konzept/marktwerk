import { describe, expect, it } from "vitest";
import { dueState, reminderDedupeKey } from "./reminders";

const due = new Date("2026-11-08T09:00:00Z");
const hoursBefore = (h: number) => new Date(due.getTime() - h * 3_600_000);

describe("dueState", () => {
  it("is none when far away", () => {
    expect(dueState(due, hoursBefore(24 * 10), [3, 1])).toEqual({ kind: "none" });
  });

  it("picks the closest crossed threshold", () => {
    expect(dueState(due, hoursBefore(24 * 2), [3, 1])).toEqual({ kind: "due_soon", daysBefore: 3 });
    expect(dueState(due, hoursBefore(5), [3, 1])).toEqual({ kind: "due_soon", daysBefore: 1 });
  });

  it("is overdue after the deadline", () => {
    expect(dueState(due, hoursBefore(-1), [3, 1])).toEqual({ kind: "overdue" });
  });
});

describe("reminderDedupeKey", () => {
  it("changes when the deadline moves", () => {
    const state = { kind: "due_soon", daysBefore: 3 } as const;
    const a = reminderDedupeKey("task", "t1", state, due);
    const b = reminderDedupeKey("task", "t1", state, new Date("2026-11-15T09:00:00Z"));
    expect(a).toBe("task:t1:due-3d:2026-11-08T09:00:00.000Z");
    expect(a).not.toBe(b);
  });
});
