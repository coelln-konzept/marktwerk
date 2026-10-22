import { describe, expect, it } from "vitest";
import { keyTaskState, missingReason } from "../events/overview";
import { matrixCellState, summarizeReadiness } from "./readiness";
import { isOverdueTask, isWaitingPastDue, taskDueness } from "./waiting";

const today = "2026-10-22";

describe("waiting tasks", () => {
  it("a waiting task past its date is waiting, not overdue", () => {
    const t = { status: "waiting_external" as const, dueOn: "2026-09-01" };
    expect(isOverdueTask(t, today)).toBe(false);
    expect(isWaitingPastDue(t, today)).toBe(true);
    expect(taskDueness(t, today)).toEqual({ kind: "waiting_since", since: "2026-09-01" });
  });

  it("a waiting task that is not yet due keeps the normal due-ness", () => {
    const t = { status: "waiting_external" as const, dueOn: "2026-10-25" };
    expect(isWaitingPastDue(t, today)).toBe(false);
    expect(taskDueness(t, today)).toEqual({ kind: "soon", days: 3 });
  });

  it("an open task past its date is overdue; finished and undated ones never are", () => {
    expect(isOverdueTask({ status: "todo", dueOn: "2026-10-21" }, today)).toBe(true);
    expect(isOverdueTask({ status: "blocked", dueOn: "2026-10-21" }, today)).toBe(true);
    expect(isOverdueTask({ status: "todo", dueOn: today }, today)).toBe(false);
    expect(isOverdueTask({ status: "todo", dueOn: null }, today)).toBe(false);
    expect(isOverdueTask({ status: "done", dueOn: "2026-10-01" }, today)).toBe(false);
  });

  it("is reflected in Was fehlt, key task state, matrix and readiness", () => {
    const base = { id: "1", title: "Amt", isKey: true, snoozedUntil: null };
    const waiting = { ...base, status: "waiting_external" as const, dueOn: "2026-09-01" };
    expect(missingReason(waiting, today)).toBe("waiting");
    expect(keyTaskState(waiting, today)).toBe("waiting");
    expect(matrixCellState(waiting, today)).toBe("waiting");
    const r = summarizeReadiness([{ ...waiting, category: "permits" }], [], "2026-11-01", today);
    expect(r.overdue).toBe(0);
    expect(r.total).toBe(1);
  });
});
