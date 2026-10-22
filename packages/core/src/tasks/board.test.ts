import { describe, expect, it } from "vitest";
import {
  type BoardTaskInput,
  berlinDay,
  boardColumnFor,
  compareCards,
  derivedColumn,
  doneVisibleSince,
  dueAtForDate,
  dueness,
  endOfIsoWeek,
  sortBetween,
} from "./board";

/** A due instant at 09:00 Berlin on a given day (summer +02:00, winter +01:00). */
const due = (iso: string) => new Date(iso);
const task = (over: Partial<BoardTaskInput>): BoardTaskInput => ({
  status: "todo",
  dueAt: due("2026-10-21T07:00:00Z"),
  boardColumn: null,
  ...over,
});

// Wednesday 2026-10-21 (KW 43; Sunday of that week is 2026-10-25).
const TODAY = "2026-10-21";

describe("berlinDay", () => {
  it("uses the Berlin calendar day, not the UTC one", () => {
    expect(berlinDay(due("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
    expect(berlinDay(due("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    // DST switch night 2026-03-29 (02:00 → 03:00 Berlin)
    expect(berlinDay(due("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    expect(berlinDay(due("2026-03-29T21:59:00Z"))).toBe("2026-03-29");
    expect(berlinDay(due("2026-03-29T22:00:00Z"))).toBe("2026-03-30");
  });
});

describe("boardColumnFor", () => {
  it("puts tasks due today or overdue into Heute", () => {
    expect(boardColumnFor(task({}), TODAY)).toBe("today");
    expect(boardColumnFor(task({ dueAt: due("2026-10-14T07:00:00Z") }), TODAY)).toBe("today");
  });

  it("treats a task due late in the evening Berlin time as due on the Berlin day", () => {
    // 2026-10-20T22:30Z is 00:30 on the 21st in Berlin
    expect(boardColumnFor(task({ dueAt: due("2026-10-20T22:30:00Z") }), TODAY)).toBe("today");
    // 2026-10-21T22:30Z is already the 22nd in Berlin
    expect(boardColumnFor(task({ dueAt: due("2026-10-21T22:30:00Z") }), TODAY)).toBe("this_week");
  });

  it("uses the ISO week (Monday to Sunday) for Diese Woche", () => {
    expect(boardColumnFor(task({ dueAt: due("2026-10-22T07:00:00Z") }), TODAY)).toBe("this_week");
    expect(boardColumnFor(task({ dueAt: due("2026-10-25T07:00:00Z") }), TODAY)).toBe("this_week");
    // Monday of next week is Vorbereitung even though it is only 5 days away
    expect(boardColumnFor(task({ dueAt: due("2026-10-26T07:00:00Z") }), TODAY)).toBe("preparation");
    // On a Sunday nothing is "later this week"
    expect(boardColumnFor(task({ dueAt: due("2026-10-26T07:00:00Z") }), "2026-10-25")).toBe(
      "preparation",
    );
    expect(boardColumnFor(task({ dueAt: due("2026-10-25T07:00:00Z") }), "2026-10-25")).toBe(
      "today",
    );
  });

  it("handles the year boundary (KW 53 / KW 1)", () => {
    // 2026-12-31 is a Thursday in KW 53; Sunday is 2027-01-03
    expect(endOfIsoWeek("2026-12-31")).toBe("2027-01-03");
    expect(boardColumnFor(task({ dueAt: due("2027-01-03T08:00:00Z") }), "2026-12-31")).toBe(
      "this_week",
    );
    expect(boardColumnFor(task({ dueAt: due("2027-01-04T08:00:00Z") }), "2026-12-31")).toBe(
      "preparation",
    );
  });

  it("puts tasks without a due date into Vorbereitung", () => {
    expect(boardColumnFor(task({ dueAt: null }), TODAY)).toBe("preparation");
  });

  it("puts finished tasks into Erledigt whatever the override says", () => {
    expect(boardColumnFor(task({ status: "done" }), TODAY)).toBe("done");
    expect(boardColumnFor(task({ status: "skipped", boardColumn: "today" }), TODAY)).toBe("done");
    expect(boardColumnFor(task({ status: "cancelled" }), TODAY)).toBe("done");
  });

  it("keeps open waiting and blocked tasks in the due-date columns", () => {
    expect(boardColumnFor(task({ status: "waiting_external" }), TODAY)).toBe("today");
    expect(boardColumnFor(task({ status: "blocked", dueAt: null }), TODAY)).toBe("preparation");
  });

  it("applies a manual move until the due date has passed", () => {
    const later = due("2026-11-10T08:00:00Z");
    expect(boardColumnFor(task({ dueAt: later, boardColumn: "today" }), TODAY)).toBe("today");
    expect(boardColumnFor(task({ dueAt: null, boardColumn: "this_week" }), TODAY)).toBe(
      "this_week",
    );
    // still valid on the due day itself …
    expect(boardColumnFor(task({ boardColumn: "preparation" }), TODAY)).toBe("preparation");
    // … but not once the day is over: overdue → Heute again
    expect(boardColumnFor(task({ boardColumn: "preparation" }), "2026-10-22")).toBe("today");
  });

  it("ignores an override of done on an open task", () => {
    expect(boardColumnFor(task({ boardColumn: "done" }), TODAY)).toBe("today");
  });
});

describe("derivedColumn", () => {
  it("works from the date alone", () => {
    expect(derivedColumn("2026-10-21", TODAY)).toBe("today");
    expect(derivedColumn("2026-10-23", TODAY)).toBe("this_week");
    expect(derivedColumn("2026-11-01", TODAY)).toBe("preparation");
    expect(derivedColumn(null, TODAY)).toBe("preparation");
  });
});

describe("dueness", () => {
  it("describes how far away the due date is", () => {
    expect(dueness(null, TODAY)).toEqual({ kind: "none" });
    expect(dueness("2026-10-19", TODAY)).toEqual({ kind: "overdue", days: 2 });
    expect(dueness("2026-10-21", TODAY)).toEqual({ kind: "today" });
    expect(dueness("2026-10-28", TODAY)).toEqual({ kind: "soon", days: 7 });
    expect(dueness("2026-10-29", TODAY)).toEqual({ kind: "later", days: 8 });
  });
});

describe("doneVisibleSince", () => {
  it("lists finished tasks for 14 days", () => {
    expect(doneVisibleSince("2026-10-21")).toBe("2026-10-07");
    expect(doneVisibleSince("2026-01-05")).toBe("2025-12-22");
  });
});

describe("dueAtForDate", () => {
  it("defaults to 09:00 Berlin time", () => {
    expect(dueAtForDate("2026-10-21", null).toISOString()).toBe("2026-10-21T07:00:00.000Z");
    expect(dueAtForDate("2026-12-01", null).toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });

  it("keeps the wall-clock time of the previous due instant across DST", () => {
    const previous = new Date("2026-03-27T13:30:00Z"); // 14:30 CET
    expect(dueAtForDate("2026-03-30", previous).toISOString()).toBe("2026-03-30T12:30:00.000Z"); // 14:30 CEST
  });
});

describe("sortBetween", () => {
  it("appends, prepends and bisects", () => {
    expect(sortBetween(null, null)).toBe(0);
    expect(sortBetween(10, null)).toBe(1034);
    expect(sortBetween(null, 10)).toBe(-1014);
    expect(sortBetween(10, 20)).toBe(15);
  });

  it("reports when there is no room so the column can be renumbered", () => {
    expect(sortBetween(5, 5)).toBeNull();
    expect(sortBetween(0, 0)).toBeNull();
    expect(sortBetween(6, 5)).toBeNull();
    expect(sortBetween(1, 1 + Number.EPSILON)).toBeNull();
  });
});

describe("compareCards", () => {
  const card = (id: string, boardSort: number, dueAt: string | null, createdAt = "2026-01-01") => ({
    id,
    boardSort,
    dueAt: dueAt ? new Date(dueAt) : null,
    createdAt: new Date(createdAt),
  });
  it("orders by manual sort, then due date (undated last), then creation", () => {
    const list = [
      card("d", 0, null),
      card("c", 0, "2026-10-22T07:00:00Z"),
      card("b", 0, "2026-10-21T07:00:00Z", "2026-02-01"),
      card("a", 0, "2026-10-21T07:00:00Z", "2026-01-01"),
      card("z", -5, "2026-12-01T07:00:00Z"),
    ];
    expect(list.sort(compareCards).map((c) => c.id)).toEqual(["z", "a", "b", "c", "d"]);
  });
});
