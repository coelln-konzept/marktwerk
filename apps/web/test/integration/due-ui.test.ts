import { OctagonAlert, TriangleAlert } from "lucide-react";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { DUE_UI, dueStateOf, OVERDUE_ICON, WARNING_ICON } from "@/lib/due-ui";
import de from "../../messages/de/tasks.json";
import en from "../../messages/en/tasks.json";

// The one status vocabulary for due dates (decision 2026-10-26). Pure, no database.
const today = "2026-10-26"; // Monday

describe("dueStateOf", () => {
  it("maps due days to the vocabulary's states", () => {
    expect(dueStateOf({ dueOn: "2026-10-23", today })).toEqual({ kind: "overdue", days: 3 });
    expect(dueStateOf({ dueOn: today, today })).toEqual({ kind: "today" });
    expect(dueStateOf({ dueOn: "2026-10-27", today })).toEqual({ kind: "tomorrow" });
    expect(dueStateOf({ dueOn: "2026-10-29", today })).toEqual({ kind: "soon", days: 3 });
    expect(dueStateOf({ dueOn: "2026-11-02", today })).toEqual({ kind: "soon", days: 7 });
    expect(dueStateOf({ dueOn: "2026-11-03", today })).toEqual({
      kind: "later",
      dueOn: "2026-11-03",
    });
    expect(dueStateOf({ dueOn: null, today })).toEqual({ kind: "none" });
  });

  it("never calls a task overdue that waits for somebody else, and says when a finished one was done", () => {
    expect(dueStateOf({ dueOn: "2026-10-19", today, status: "waiting_external" })).toEqual({
      kind: "waiting",
      since: "2026-10-19",
    });
    expect(
      dueStateOf({ dueOn: "2026-10-19", today, status: "done", completedOn: "2026-10-20" }),
    ).toEqual({ kind: "done", on: "2026-10-20" });
    expect(dueStateOf({ dueOn: "2026-10-19", today, status: "skipped" })).toEqual({
      kind: "done",
      on: null,
    });
  });
});

describe("DUE_UI", () => {
  it("uses the red octagon for overdue and never the warning triangle for a due state", () => {
    expect(OVERDUE_ICON).toBe(OctagonAlert);
    expect(WARNING_ICON).toBe(TriangleAlert);
    expect(DUE_UI.overdue).toEqual({ tone: "critical", icon: OctagonAlert });
    for (const ui of Object.values(DUE_UI)) expect(ui.icon).not.toBe(TriangleAlert);
    expect(DUE_UI.today.tone).toBe("warn");
    expect(DUE_UI.waiting.tone).toBe("waiting");
  });
});

describe("tasks.due wording", () => {
  const tDe = createTranslator({ locale: "de", messages: de, namespace: "tasks.due" });
  const tEn = createTranslator({ locale: "en", messages: en, namespace: "tasks.due" });
  it("uses full words with plurals", () => {
    expect(tDe("overdue", { days: 1 })).toBe("Überfällig · 1 Tag");
    expect(tDe("overdue", { days: 3 })).toBe("Überfällig · 3 Tage");
    expect(tDe("inDays", { days: 3 })).toBe("in 3 Tagen");
    expect(tDe("tomorrow")).toBe("Morgen");
    expect(tDe("overdueCount", { count: 6 })).toBe("6 überfällig");
    expect(tEn("overdue", { days: 1 })).toBe("Overdue · 1 day");
    expect(tEn("inDays", { days: 3 })).toBe("in 3 days");
  });
});
