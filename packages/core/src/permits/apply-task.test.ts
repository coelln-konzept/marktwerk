import { describe, expect, it } from "vitest";
import { permitCoversSeveralEvents, splitApplyTasks } from "./apply-task";
import { PERMIT_CADENCES } from "./status";

describe("permitCoversSeveralEvents", () => {
  it("is false for single-event permits and permits without a requirement", () => {
    expect(PERMIT_CADENCES.filter(permitCoversSeveralEvents)).toEqual([
      "per_season",
      "per_year",
      "multi_year",
      "standing",
    ]);
    expect(permitCoversSeveralEvents(null)).toBe(false);
    expect(permitCoversSeveralEvents(undefined)).toBe(false);
  });
});

describe("splitApplyTasks", () => {
  /** A task on event `ev` (the event id doubles as its first day). */
  const t = (id: string, ev: string | null, status = "todo") => ({
    id,
    status,
    eventId: ev,
    startsOn: ev,
  });
  const ids = (r: { keep: { id: string }[]; duplicates: { id: string }[] }) => ({
    keep: r.keep.map((x) => x.id),
    duplicates: r.duplicates.map((x) => x.id),
  });

  it("keeps the task of the earliest event when seven markets bring one each", () => {
    const tasks = [
      t("g", "2027-10-03"),
      t("a", "2027-04-04"),
      t("c", "2027-06-06"),
      t("b", "2027-05-02"),
      t("e", "2027-08-01"),
      t("d", "2027-07-04"),
      t("f", "2027-09-05"),
    ];
    expect(ids(splitApplyTasks(tasks, []))).toEqual({
      keep: ["a"],
      duplicates: ["b", "c", "d", "e", "f", "g"],
    });
  });

  it("every item of the carrier event stays (a template may split applying into several items)", () => {
    const tasks = [t("a1", "2027-04-04"), t("a2", "2027-04-04"), t("b1", "2027-05-02")];
    expect(ids(splitApplyTasks(tasks, []))).toEqual({ keep: ["a1", "a2"], duplicates: ["b1"] });
  });

  it("the event of an existing apply task stays the carrier, even when a new one is earlier", () => {
    const tasks = [t("a", "2027-04-04"), t("b", "2027-05-02")];
    expect(ids(splitApplyTasks(tasks, ["2027-05-02"]))).toEqual({ keep: ["b"], duplicates: ["a"] });
    // The permit's own task (no event): every untouched template task is a duplicate.
    expect(ids(splitApplyTasks(tasks, [null]))).toEqual({ keep: [], duplicates: ["a", "b"] });
  });

  it("tasks somebody works on always stay and make their event the carrier", () => {
    const tasks = [t("a", "2027-04-04"), t("b", "2027-05-02", "in_progress")];
    expect(ids(splitApplyTasks(tasks, []))).toEqual({ keep: ["b"], duplicates: ["a"] });
    const both = [
      t("a", "2027-04-04", "waiting_external"),
      t("b", "2027-05-02", "blocked"),
      t("c", "2027-06-06"),
    ];
    expect(ids(splitApplyTasks(both, [null]))).toEqual({ keep: ["a", "b"], duplicates: ["c"] });
  });

  it("finished tasks stay (history) and make their event the carrier", () => {
    const tasks = [
      t("a", "2027-04-04"),
      t("b", "2027-05-02", "done"),
      t("c", "2027-06-06", "skipped"),
    ];
    expect(ids(splitApplyTasks(tasks, []))).toEqual({ keep: ["b", "c"], duplicates: ["a"] });
    expect(ids(splitApplyTasks([t("b", "2027-05-02", "done")], [null]))).toEqual({
      keep: ["b"],
      duplicates: [],
    });
  });

  it("a task without an event goes after dated ones; ties fall back to the id (stable)", () => {
    expect(ids(splitApplyTasks([t("z", null), t("y", "2027-05-02")], [])).keep).toEqual(["y"]);
    const sameDay = [
      { id: "b", status: "todo", eventId: "e2", startsOn: "2027-05-02" },
      { id: "a", status: "todo", eventId: "e1", startsOn: "2027-05-02" },
    ];
    expect(ids(splitApplyTasks(sameDay, []))).toEqual({ keep: ["a"], duplicates: ["b"] });
  });

  it("nothing in, nothing out", () => {
    expect(splitApplyTasks([], [])).toEqual({ keep: [], duplicates: [] });
  });
});
