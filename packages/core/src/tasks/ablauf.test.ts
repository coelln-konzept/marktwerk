import { describe, expect, it } from "vitest";
import { type AblaufTaskInput, ablaufPhase, groupAblauf } from "./ablauf";

// Saturday 2026-10-24; a two-day market on Sun 2026-11-22 and Mon 2026-11-23.
const ctx = { today: "2026-10-24", startsOn: "2026-11-22", endsOn: "2026-11-23" };
const task = (over: Partial<AblaufTaskInput> & { id?: string }) => ({
  id: "x",
  status: "todo" as const,
  dueOn: "2026-11-01",
  title: "Aufgabe",
  isKey: false,
  ...over,
});

describe("ablaufPhase", () => {
  it("puts open work due today or earlier into 'now'", () => {
    expect(ablaufPhase(task({ dueOn: "2026-10-24" }), ctx)).toBe("now");
    expect(ablaufPhase(task({ dueOn: "2026-09-01" }), ctx)).toBe("now");
    // waiting tasks too (they show "wartet seit …", not red, but stay at the top)
    expect(ablaufPhase(task({ dueOn: "2026-10-01", status: "waiting_external" }), ctx)).toBe("now");
  });

  it("uses inclusive week boundaries counted back from the first market day", () => {
    const at = (dueOn: string) => ablaufPhase(task({ dueOn }), { ...ctx, today: "2026-09-01" });
    expect(at("2026-10-24")).toBe("early"); // 29 days before
    expect(at("2026-10-25")).toBe("weeks_4"); // 28 days before
    expect(at("2026-11-07")).toBe("weeks_4"); // 15 days before
    expect(at("2026-11-08")).toBe("weeks_2"); // 14 days before
    expect(at("2026-11-14")).toBe("weeks_2"); // 8 days before
    expect(at("2026-11-15")).toBe("week"); // 7 days before
    expect(at("2026-11-21")).toBe("week"); // the day before
  });

  it("treats every market day as 'event' and later days as 'after'", () => {
    expect(ablaufPhase(task({ dueOn: "2026-11-22" }), ctx)).toBe("event");
    expect(ablaufPhase(task({ dueOn: "2026-11-23" }), ctx)).toBe("event");
    expect(ablaufPhase(task({ dueOn: "2026-11-24" }), ctx)).toBe("after");
  });

  it("keeps undated and finished tasks apart, finished first", () => {
    expect(ablaufPhase(task({ dueOn: null }), ctx)).toBe("undated");
    expect(ablaufPhase(task({ dueOn: null, status: "done" }), ctx)).toBe("done");
    expect(ablaufPhase(task({ dueOn: "2026-09-01", status: "skipped" }), ctx)).toBe("done");
  });

  it("puts a past market's leftovers into 'now'", () => {
    const past = { today: "2026-12-01", startsOn: "2026-11-22", endsOn: "2026-11-23" };
    expect(ablaufPhase(task({ dueOn: "2026-11-25" }), past)).toBe("now");
  });
});

describe("groupAblauf", () => {
  it("returns non-empty phases in order, earliest due first, Kernaufgaben first on the same day", () => {
    const groups = groupAblauf(
      [
        task({ id: "done", status: "done", dueOn: "2026-10-01" }),
        task({ id: "after", dueOn: "2026-11-30" }),
        task({ id: "old", dueOn: "2026-10-01" }),
        task({ id: "today-b", dueOn: "2026-10-24", title: "B" }),
        task({ id: "today-key", dueOn: "2026-10-24", title: "Z", isKey: true }),
        task({ id: "today-a", dueOn: "2026-10-24", title: "A" }),
        task({ id: "undated", dueOn: null }),
        task({ id: "day", dueOn: "2026-11-22" }),
      ],
      ctx,
    );
    expect(groups.map((g) => g.phase)).toEqual(["now", "event", "after", "undated", "done"]);
    expect(groups[0]?.tasks.map((t) => t.id)).toEqual(["old", "today-key", "today-a", "today-b"]);
  });
});
