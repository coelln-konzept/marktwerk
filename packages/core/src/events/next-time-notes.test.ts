import { describe, expect, it } from "vitest";
import {
  isNoteForDate,
  NEXT_TIME_NOTE_MAX,
  nextDateToPrepare,
  nextTimeNoteProblem,
  normalizeNextTimeNote,
} from "./next-time-notes";

describe("normalizeNextTimeNote / nextTimeNoteProblem", () => {
  it("trims and unifies line breaks", () => {
    expect(normalizeNextTimeNote("  Strom am Stand 12 fehlt\r\nKabel mitbringen \n")).toBe(
      "Strom am Stand 12 fehlt\nKabel mitbringen",
    );
  });

  it("refuses empty and blank text", () => {
    expect(nextTimeNoteProblem("")).toBe("empty");
    expect(nextTimeNoteProblem("  \n\t ")).toBe("empty");
  });

  it("allows exactly the maximum and refuses one more, counting characters not UTF-16 units", () => {
    expect(nextTimeNoteProblem("a".repeat(NEXT_TIME_NOTE_MAX))).toBeNull();
    expect(nextTimeNoteProblem("a".repeat(NEXT_TIME_NOTE_MAX + 1))).toBe("too_long");
    // 500 emoji are 1000 UTF-16 units but 500 characters (the DB check counts characters too).
    expect(nextTimeNoteProblem("🔌".repeat(NEXT_TIME_NOTE_MAX))).toBeNull();
    // Blanks around the text do not count.
    expect(nextTimeNoteProblem(`  ${"a".repeat(NEXT_TIME_NOTE_MAX)}  `)).toBeNull();
  });
});

describe("nextDateToPrepare", () => {
  const today = "2026-11-13";

  it("is the first date that has not started yet", () => {
    expect(
      nextDateToPrepare(
        [
          { id: "c", startsOn: "2026-12-06", status: "planned" },
          { id: "a", startsOn: "2026-11-01", status: "completed" },
          { id: "b", startsOn: "2026-11-29", status: "confirmed" },
        ],
        today,
      ),
    ).toBe("b");
  });

  it("skips a date running today and cancelled dates", () => {
    expect(
      nextDateToPrepare(
        [
          { id: "today", startsOn: today, status: "live" },
          { id: "off", startsOn: "2026-11-15", status: "cancelled" },
          { id: "next", startsOn: "2026-11-22", status: "draft" },
        ],
        today,
      ),
    ).toBe("next");
  });

  it("is tomorrow's date the day before", () => {
    expect(
      nextDateToPrepare([{ id: "tomorrow", startsOn: "2026-11-14", status: "planned" }], today),
    ).toBe("tomorrow");
  });

  it("works across the year end and the DST switch (plain calendar days)", () => {
    expect(
      nextDateToPrepare(
        [
          { id: "jan", startsOn: "2027-01-03", status: "planned" },
          { id: "mar", startsOn: "2027-03-28", status: "planned" },
        ],
        "2026-12-31",
      ),
    ).toBe("jan");
    expect(
      nextDateToPrepare([{ id: "dst", startsOn: "2027-03-28", status: "planned" }], "2027-03-27"),
    ).toBe("dst");
  });

  it("is null without an upcoming date and stable for two dates on one day", () => {
    expect(nextDateToPrepare([], today)).toBeNull();
    expect(
      nextDateToPrepare([{ id: "past", startsOn: "2026-10-01", status: "completed" }], today),
    ).toBeNull();
    expect(
      nextDateToPrepare(
        [
          { id: "z", startsOn: "2026-11-20", status: "planned" },
          { id: "m", startsOn: "2026-11-20", status: "planned" },
        ],
        today,
      ),
    ).toBe("m");
  });
});

describe("isNoteForDate", () => {
  const date = { id: "e2", startsOn: "2026-11-29" };

  it("counts notes from the market page and from earlier dates", () => {
    expect(isNoteForDate({ eventId: null, eventStartsOn: null }, date)).toBe(true);
    expect(isNoteForDate({ eventId: "e1", eventStartsOn: "2026-11-01" }, date)).toBe(true);
  });

  it("leaves out notes written at this date or at a later one", () => {
    expect(isNoteForDate({ eventId: "e2", eventStartsOn: "2026-11-29" }, date)).toBe(false);
    expect(isNoteForDate({ eventId: "e3", eventStartsOn: "2026-12-06" }, date)).toBe(false);
    // Another date on the same day is not earlier either.
    expect(isNoteForDate({ eventId: "e4", eventStartsOn: "2026-11-29" }, date)).toBe(false);
  });
});
