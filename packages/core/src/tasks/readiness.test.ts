import { describe, expect, it } from "vitest";
import {
  countMissingPermits,
  matrixCellState,
  pickCellTask,
  type ReadinessTask,
  readinessAttention,
  selectMatrixColumns,
  shortLabel,
  summarizeReadiness,
} from "./readiness";

const TODAY = "2026-10-22";
const task = (over: Partial<ReadinessTask> = {}): ReadinessTask => ({
  id: "t",
  title: "Aufgabe",
  status: "todo",
  category: "general",
  isKey: false,
  dueOn: null,
  snoozedUntil: null,
  ...over,
});
const permit = (over: Partial<Parameters<typeof countMissingPermits>[0][number]> = {}) => ({
  status: "not_started" as const,
  applyBy: null,
  validUntil: null,
  required: true,
  ...over,
});

describe("summarizeReadiness", () => {
  it("counts progress without cancelled tasks, skipped counts as done", () => {
    const r = summarizeReadiness(
      [
        task({ status: "done" }),
        task({ status: "skipped" }),
        task({ status: "cancelled" }),
        task({ status: "todo" }),
      ],
      [],
      "2026-11-14",
      TODAY,
    );
    expect(r).toMatchObject({ total: 3, done: 2, overdue: 0, openKey: 0, next: null });
  });

  it("counts overdue before today only; a task due today is not overdue", () => {
    const r = summarizeReadiness(
      [
        task({ dueOn: "2026-10-21" }),
        task({ dueOn: "2026-10-22" }),
        task({ dueOn: "2026-10-01", status: "done" }),
      ],
      [],
      "2026-11-14",
      TODAY,
    );
    expect(r.overdue).toBe(1);
  });

  it("a snoozed task is back on its snooze date, and until then neither overdue nor next", () => {
    const snoozed = task({ id: "s", dueOn: "2026-10-10", snoozedUntil: "2026-10-23", isKey: true });
    expect(summarizeReadiness([snoozed], [], "2026-11-14", TODAY)).toMatchObject({
      overdue: 0,
      next: null,
      openKey: 1,
      total: 1,
    });
    expect(summarizeReadiness([snoozed], [], "2026-11-14", "2026-10-23")).toMatchObject({
      overdue: 1,
      next: { id: "s" },
    });
  });

  it("next is the earliest open dated task, key first on a tie, undated ones never", () => {
    const r = summarizeReadiness(
      [
        task({ id: "a", dueOn: "2026-11-01" }),
        task({ id: "b", dueOn: "2026-10-25" }),
        task({ id: "c", dueOn: "2026-10-25", isKey: true }),
        task({ id: "d" }),
        task({ id: "e", dueOn: "2026-10-01", status: "done" }),
      ],
      [],
      "2026-11-14",
      TODAY,
    );
    expect(r.next).toEqual({ id: "c", title: "Aufgabe", dueOn: "2026-10-25" });
  });

  it("counts open key tasks, blocked and waiting included", () => {
    const r = summarizeReadiness(
      [
        task({ isKey: true, status: "blocked" }),
        task({ isKey: true, status: "waiting_external" }),
        task({ isKey: true, status: "done" }),
        task({ isKey: false }),
      ],
      [],
      "2026-11-14",
      TODAY,
    );
    expect(r.openKey).toBe(2);
  });
});

describe("countMissingPermits", () => {
  it("counts required permits that are not granted", () => {
    expect(
      countMissingPermits(
        [
          permit(),
          permit({ status: "applied" }),
          permit({ status: "rejected" }),
          permit({ status: "granted" }),
          permit({ status: "not_required" }),
          permit({ status: "superseded" }),
          permit({ required: false }),
        ],
        "2026-11-14",
        TODAY,
      ),
    ).toBe(3);
  });
  it("a granted permit that ends before the first day is missing, one ending on it is not", () => {
    const granted = { status: "granted" as const };
    expect(
      countMissingPermits([permit({ ...granted, validUntil: "2026-11-13" })], "2026-11-14", TODAY),
    ).toBe(1);
    expect(
      countMissingPermits([permit({ ...granted, validUntil: "2026-11-14" })], "2026-11-14", TODAY),
    ).toBe(0);
  });
});

describe("readinessAttention", () => {
  const base = { total: 1, done: 0, overdue: 0, missingPermits: 0, openKey: 0, next: null };
  it("is ok without problems", () => {
    expect(readinessAttention(base, "2026-11-14", TODAY)).toBe("ok");
  });
  it("overdue is critical", () => {
    expect(readinessAttention({ ...base, overdue: 1 }, "2026-12-14", TODAY)).toBe("critical");
  });
  it("a missing permit warns, and is critical within 14 days of the first day", () => {
    expect(readinessAttention({ ...base, missingPermits: 1 }, "2026-11-06", TODAY)).toBe("warn");
    expect(readinessAttention({ ...base, missingPermits: 1 }, "2026-11-05", TODAY)).toBe(
      "critical",
    );
  });
});

describe("matrixCellState", () => {
  const t = (over: Partial<Parameters<typeof matrixCellState>[0] & object> = {}) => ({
    status: "todo" as const,
    dueOn: null,
    snoozedUntil: null,
    ...over,
  });
  it("absent without a task or when cancelled", () => {
    expect(matrixCellState(null, TODAY)).toBe("absent");
    expect(matrixCellState(t({ status: "cancelled" }), TODAY)).toBe("absent");
  });
  it("done and skipped are done, even when long past due", () => {
    expect(matrixCellState(t({ status: "done", dueOn: "2026-01-01" }), TODAY)).toBe("done");
    expect(matrixCellState(t({ status: "skipped" }), TODAY)).toBe("done");
  });
  it("overdue is before today, due today is soon", () => {
    expect(matrixCellState(t({ dueOn: "2026-10-21" }), TODAY)).toBe("overdue");
    expect(matrixCellState(t({ dueOn: "2026-10-22" }), TODAY)).toBe("soon");
  });
  it("soon reaches 7 days ahead, then it is just open; undated is open", () => {
    expect(matrixCellState(t({ dueOn: "2026-10-29" }), TODAY)).toBe("soon");
    expect(matrixCellState(t({ dueOn: "2026-10-30" }), TODAY)).toBe("open");
    expect(matrixCellState(t(), TODAY)).toBe("open");
  });
  it("soon crosses the month, the DST change (2026-10-25) and the year", () => {
    expect(matrixCellState(t({ dueOn: "2026-11-01" }), "2026-10-25")).toBe("soon");
    expect(matrixCellState(t({ dueOn: "2026-11-02" }), "2026-10-25")).toBe("open");
    expect(matrixCellState(t({ dueOn: "2027-01-01" }), "2026-12-26")).toBe("soon");
  });
  it("snoozed wins over overdue until the snooze date", () => {
    const s = t({ dueOn: "2026-10-01", snoozedUntil: "2026-10-23" });
    expect(matrixCellState(s, TODAY)).toBe("snoozed");
    expect(matrixCellState(s, "2026-10-23")).toBe("overdue");
  });
});

describe("pickCellTask", () => {
  it("takes the one needing attention most, null without a live task", () => {
    const done = { status: "done" as const, dueOn: null, snoozedUntil: null, id: "1" };
    const late = { status: "todo" as const, dueOn: "2026-10-01", snoozedUntil: null, id: "2" };
    expect(pickCellTask([done, late], TODAY)?.id).toBe("2");
    expect(pickCellTask([done], TODAY)?.id).toBe("1");
    expect(pickCellTask([], TODAY)).toBeNull();
    expect(pickCellTask([{ ...done, status: "cancelled" as const }], TODAY)).toBeNull();
  });
});

describe("selectMatrixColumns", () => {
  const src = (
    eventId: string,
    key: string | null,
    title: string,
    dueOn: string | null,
    starts = "2026-11-14",
  ) => ({ eventId, templateStableKey: key, title, dueOn, eventStartsOn: starts });

  it("orders by the usual lead time and merges events by stable key, even with different titles", () => {
    const cols = selectMatrixColumns([
      src("e1", "permit", "Genehmigung beantragen", "2026-09-14"),
      src("e2", "permit", "Genehmigung beantragt", "2026-10-01", "2026-12-01"),
      src("e1", "poster", "Plakate", "2026-11-01"),
      src("e1", "setup", "Aufbau", "2026-11-13"),
    ]);
    expect(cols.map((c) => c.key)).toEqual(["k:permit", "k:poster", "k:setup"]);
    expect(cols[0]).toMatchObject({ events: 2 });
  });
  it("falls back to the title without a stable key, case-insensitive", () => {
    const cols = selectMatrixColumns([
      src("e1", null, "Plakate", "2026-11-01"),
      src("e2", null, " plakate ", "2026-11-20", "2026-12-01"),
    ]);
    expect(cols).toHaveLength(1);
    expect(cols[0]?.events).toBe(2);
  });
  it("caps the columns, keeping those in most events, in due order", () => {
    const tasks = [
      src("e1", "a", "A", "2026-11-10"),
      src("e2", "a", "A", "2026-11-10"),
      src("e1", "b", "B", "2026-11-01"),
      src("e1", "c", "C", "2026-10-01"),
      src("e2", "c", "C", "2026-10-01"),
    ];
    expect(selectMatrixColumns(tasks, 2).map((c) => c.key)).toEqual(["k:c", "k:a"]);
  });
  it("undated key tasks go last", () => {
    const cols = selectMatrixColumns([
      src("e1", "x", "X", null),
      src("e1", "y", "Y", "2026-11-01"),
    ]);
    expect(cols.map((c) => c.key)).toEqual(["k:y", "k:x"]);
  });
});

describe("shortLabel", () => {
  it("keeps short titles and cuts long ones at a word", () => {
    expect(shortLabel("Plakate")).toBe("Plakate");
    expect(shortLabel("Genehmigung beim Ordnungsamt beantragen")).toBe("Genehmigung beim…");
    expect(shortLabel("Donaudampfschifffahrtsgesellschaft")).toBe("Donaudampfschifffa…");
  });
});
