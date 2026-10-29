import { describe, expect, it } from "vitest";
import type { EventPermitInput } from "../permits/status";
import { berlinDay } from "../tasks/board";
import {
  eventCountdown,
  keyTaskState,
  keyTasks,
  missingPermits,
  missingReason,
  missingTasks,
  type OverviewPermit,
  type OverviewTask,
  permitCoversEvent,
  permitProgress,
  splitTimeline,
  taskProgress,
} from "./overview";

const TODAY = "2026-10-22";

function task(partial: Partial<OverviewTask> & { id: string }): OverviewTask {
  return {
    title: partial.id,
    status: "todo",
    dueOn: null,
    isKey: false,
    snoozedUntil: null,
    ...partial,
  };
}

describe("eventCountdown", () => {
  it("counts the days to the first event day", () => {
    expect(eventCountdown({ startsOn: "2026-11-03", endsOn: "2026-11-03" }, TODAY)).toEqual({
      kind: "upcoming",
      days: 12,
    });
    expect(eventCountdown({ startsOn: "2026-10-23", endsOn: "2026-10-23" }, TODAY)).toEqual({
      kind: "upcoming",
      days: 1,
    });
  });

  it("runs on every day of a multi-day event and is over the day after", () => {
    const fest = { startsOn: "2026-10-21", endsOn: "2026-10-23" };
    expect(eventCountdown(fest, "2026-10-21").kind).toBe("running");
    expect(eventCountdown(fest, "2026-10-23").kind).toBe("running");
    expect(eventCountdown(fest, "2026-10-24").kind).toBe("over");
  });

  it("counts correctly across the end of daylight saving time (25 Oct 2026)", () => {
    // a calendar-day count, not 24-hour blocks: the 25 hour day does not eat a day
    expect(eventCountdown({ startsOn: "2026-10-26", endsOn: "2026-10-26" }, "2026-10-24")).toEqual({
      kind: "upcoming",
      days: 2,
    });
    expect(eventCountdown({ startsOn: "2026-03-30", endsOn: "2026-03-30" }, "2026-03-28")).toEqual({
      kind: "upcoming",
      days: 2,
    });
  });
});

describe("taskProgress", () => {
  it("counts done and skipped as finished, cancelled not at all, snoozed as open", () => {
    const p = taskProgress([
      task({ id: "a", status: "done" }),
      task({ id: "b", status: "skipped" }),
      task({ id: "c", status: "cancelled" }),
      task({ id: "d", status: "todo", snoozedUntil: "2026-11-01" }),
      task({ id: "e", status: "blocked" }),
    ]);
    expect(p).toMatchObject({ done: 2, total: 4, open: 2 });
    expect(p.ratio).toBe(0.5);
  });

  it("is empty without tasks", () => {
    expect(taskProgress([])).toEqual({ done: 0, total: 0, open: 0, ratio: 0 });
  });
});

describe("permits", () => {
  const permit = (partial: Partial<EventPermitInput>): EventPermitInput => ({
    status: "granted",
    applyBy: null,
    validUntil: null,
    required: true,
    ...partial,
  });

  it("counts a granted permit only while valid on the first event day", () => {
    expect(permitCoversEvent(permit({}), "2026-11-14", TODAY)).toBe(true);
    expect(permitCoversEvent(permit({ validUntil: "2026-11-14" }), "2026-11-14", TODAY)).toBe(true);
    expect(permitCoversEvent(permit({ validUntil: "2026-11-13" }), "2026-11-14", TODAY)).toBe(
      false,
    );
    expect(permitCoversEvent(permit({ validUntil: "2026-10-21" }), "2026-11-14", TODAY)).toBe(
      false,
    );
    expect(permitCoversEvent(permit({ status: "applied" }), "2026-11-14", TODAY)).toBe(false);
  });

  it("ignores optional, not-needed and replaced permits in a/b", () => {
    const p = permitProgress(
      [
        permit({}),
        permit({ status: "applied" }),
        permit({ required: false, status: "not_started" }),
        permit({ status: "not_required" }),
        permit({ status: "superseded" }),
      ],
      "2026-11-14",
      TODAY,
    );
    expect(p).toEqual({ granted: 1, total: 2 });
  });

  it("lists the missing permits, earliest apply-by first, without date last", () => {
    const rows: OverviewPermit[] = [
      { id: "z", title: "Zebra", ...permit({ status: "not_started" }) },
      { id: "a", title: "Alpha", ...permit({ status: "preparing", applyBy: "2026-11-01" }) },
      // filed and waiting: not missing; once the expected decision has passed: missing
      { id: "w", title: "Wartet", ...permit({ status: "applied", applyBy: "2026-10-01" }) },
      {
        id: "b",
        title: "Beta",
        ...permit({ status: "applied", applyBy: "2026-10-01", expectedDecisionOn: "2026-10-20" }),
      },
      // unfiled but not due yet (apply-by beyond the 30-day horizon): not missing
      { id: "l", title: "Später", ...permit({ status: "preparing", applyBy: "2026-12-30" }) },
      { id: "ok", title: "Fertig", ...permit({}) },
      { id: "no", title: "Optional", ...permit({ required: false, status: "not_started" }) },
      { id: "x", title: "Abgelaufen", ...permit({ validUntil: "2026-10-01" }) },
    ];
    expect(missingPermits(rows, "2026-11-14", TODAY).map((p) => p.id)).toEqual([
      "b",
      "a",
      "x",
      "z",
    ]);
  });
});

describe("missingReason", () => {
  it("flags overdue, blocked, waiting and the next seven days", () => {
    expect(missingReason(task({ id: "a", dueOn: "2026-10-21" }), TODAY)).toBe("overdue");
    expect(missingReason(task({ id: "a", dueOn: TODAY }), TODAY)).toBe("today");
    expect(missingReason(task({ id: "a", dueOn: "2026-10-29" }), TODAY)).toBe("soon");
    expect(missingReason(task({ id: "a", dueOn: "2026-10-30" }), TODAY)).toBeNull();
    expect(missingReason(task({ id: "a" }), TODAY)).toBeNull();
    expect(missingReason(task({ id: "a", status: "blocked", dueOn: "2026-12-01" }), TODAY)).toBe(
      "blocked",
    );
    expect(missingReason(task({ id: "a", status: "blocked" }), TODAY)).toBe("blocked");
    expect(missingReason(task({ id: "a", status: "waiting_external" }), TODAY)).toBe("waiting");
  });

  it("lets overdue win over blocked", () => {
    expect(missingReason(task({ id: "a", status: "blocked", dueOn: "2026-10-01" }), TODAY)).toBe(
      "overdue",
    );
  });

  it("skips finished, cancelled and snoozed tasks, and brings a snoozed one back on its date", () => {
    for (const status of ["done", "skipped", "cancelled"] as const)
      expect(missingReason(task({ id: "a", status, dueOn: "2026-10-01" }), TODAY)).toBeNull();
    const snoozed = task({ id: "a", dueOn: "2026-10-01", snoozedUntil: "2026-10-23" });
    expect(missingReason(snoozed, TODAY)).toBeNull();
    expect(missingReason(snoozed, "2026-10-23")).toBe("overdue");
  });

  it("uses Berlin days of due instants, also around daylight saving time", () => {
    // 25 Oct 2026, 02:00 CEST -> 02:00 CET: 00:30 CEST on the 25th is still the 25th
    const lateOn24th = berlinDay(new Date("2026-10-24T21:59:00Z")); // 23:59 CEST on the 24th
    const earlyOn25th = berlinDay(new Date("2026-10-24T22:30:00Z")); // 00:30 CEST on the 25th
    const lateOn25th = berlinDay(new Date("2026-10-25T22:59:00Z")); // 23:59 CET on the 25th
    const earlyOn26th = berlinDay(new Date("2026-10-25T23:30:00Z")); // 00:30 CET on the 26th
    expect([lateOn24th, earlyOn25th, lateOn25th, earlyOn26th]).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-25",
      "2026-10-26",
    ]);
    // due 25th, today 25th: not overdue; today 26th: overdue
    expect(missingReason(task({ id: "a", dueOn: earlyOn25th }), "2026-10-25")).toBe("today");
    expect(missingReason(task({ id: "a", dueOn: lateOn25th }), "2026-10-26")).toBe("overdue");
  });

  it("looks seven days ahead across the daylight saving change", () => {
    // 22 Oct + 7 = 29 Oct (clocks changed on the 25th): the 29th is in, the 30th is out
    expect(missingReason(task({ id: "a", dueOn: "2026-10-29" }), "2026-10-22")).toBe("soon");
    expect(missingReason(task({ id: "a", dueOn: "2026-10-30" }), "2026-10-22")).toBeNull();
    // spring: 26 Mar + 7 = 2 Apr (clocks changed on 29 Mar)
    expect(missingReason(task({ id: "a", dueOn: "2026-04-02" }), "2026-03-26")).toBe("soon");
    expect(missingReason(task({ id: "a", dueOn: "2026-04-03" }), "2026-03-26")).toBeNull();
  });
});

describe("missingTasks", () => {
  it("puts key tasks first, then orders by due date, undated last, then title", () => {
    const rows = missingTasks(
      [
        task({ id: "late", dueOn: "2026-10-01" }),
        task({ id: "key-soon", dueOn: "2026-10-27", isKey: true }),
        task({ id: "key-overdue", dueOn: "2026-10-15", isKey: true }),
        task({ id: "blocked", status: "blocked" }),
        task({ id: "b-same", title: "B", dueOn: "2026-10-23" }),
        task({ id: "a-same", title: "A", dueOn: "2026-10-23" }),
        task({ id: "far", dueOn: "2026-12-01" }),
        task({ id: "key-blocked", status: "blocked", isKey: true }),
      ],
      TODAY,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "key-overdue",
      "key-soon",
      "key-blocked",
      "late",
      "a-same",
      "b-same",
      "blocked",
    ]);
    expect(rows.find((r) => r.id === "blocked")?.reason).toBe("blocked");
  });
});

describe("keyTaskState", () => {
  it.each([
    ["done", { status: "done" as const, dueOn: "2026-10-01" }, "done"],
    ["skipped", { status: "skipped" as const }, "done"],
    ["snoozed", { dueOn: "2026-10-01", snoozedUntil: "2026-10-30" }, "snoozed"],
    ["overdue", { dueOn: "2026-10-21" }, "overdue"],
    ["due today", { dueOn: TODAY }, "soon"],
    ["in 7 days", { dueOn: "2026-10-29" }, "soon"],
    ["in 8 days", { dueOn: "2026-10-30" }, "open"],
    ["no date", {}, "open"],
    ["snooze date reached", { dueOn: "2026-10-21", snoozedUntil: TODAY }, "overdue"],
  ])("%s", (_name, partial, state) => {
    expect(keyTaskState(task({ id: "k", isKey: true, ...partial }), TODAY)).toBe(state);
  });

  it("has no state for cancelled tasks", () => {
    expect(keyTaskState(task({ id: "k", status: "cancelled" }), TODAY)).toBeNull();
  });
});

describe("keyTasks", () => {
  it("lists only key tasks, open ones first by due date, finished last", () => {
    const rows = keyTasks(
      [
        task({ id: "done", isKey: true, status: "done", dueOn: "2026-09-01" }),
        task({ id: "later", isKey: true, dueOn: "2026-12-01" }),
        task({ id: "overdue", isKey: true, dueOn: "2026-10-10" }),
        task({ id: "plain", dueOn: "2026-10-10" }),
        task({ id: "gone", isKey: true, status: "cancelled" }),
        task({ id: "snoozed", isKey: true, dueOn: "2026-10-11", snoozedUntil: "2026-11-01" }),
      ],
      TODAY,
    );
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ["overdue", "overdue"],
      ["snoozed", "snoozed"],
      ["later", "open"],
      ["done", "done"],
    ]);
  });
});

describe("splitTimeline", () => {
  it("separates upcoming (today included, soonest first) from past (latest first)", () => {
    const { upcoming, past } = splitTimeline(
      [
        { key: "teardown_day", date: "2026-11-15" },
        { key: "booking_cutoff", date: "2026-10-10" },
        { key: "setup_day", date: "2026-11-13" },
        { key: "today", date: TODAY },
        { key: "early", date: "2026-09-01" },
      ],
      TODAY,
    );
    expect(upcoming.map((d) => d.key)).toEqual(["today", "setup_day", "teardown_day"]);
    expect(past.map((d) => d.key)).toEqual(["booking_cutoff", "early"]);
  });
});
