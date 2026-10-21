import { describe, expect, it } from "vitest";
import { holidaysBetween } from "../dates/holidays";
import {
  clockTime,
  dueDateFor,
  dueDateForNrw,
  dueInstantFor,
  holidayWindow,
  isBusinessDay,
  taskDueInstant,
} from "./due";

const nrw = (from: string, to: string) => holidaysBetween(from, to);

describe("dueDateFor, calendar days", () => {
  it("adds and subtracts calendar days, weekends and holidays included", () => {
    expect(dueDateFor("2026-11-08", 0, "calendar", new Set())).toBe("2026-11-08");
    expect(dueDateFor("2026-11-08", -30, "calendar", new Set())).toBe("2026-10-09");
    expect(dueDateFor("2026-11-08", 3, "calendar", new Set())).toBe("2026-11-11");
  });

  it("handles long negative offsets across a year boundary", () => {
    expect(dueDateFor("2026-06-07", -180, "calendar", new Set())).toBe("2025-12-09");
    expect(dueDateFor("2026-12-30", 5, "calendar", new Set())).toBe("2027-01-04");
  });

  it("is not influenced by DST changes (pure calendar arithmetic)", () => {
    // Clocks change on 2026-03-29 and 2026-10-25; the date arithmetic must not notice.
    expect(dueDateFor("2026-03-29", -1, "calendar", new Set())).toBe("2026-03-28");
    expect(dueDateFor("2026-03-28", 1, "calendar", new Set())).toBe("2026-03-29");
    expect(dueDateFor("2026-11-08", -14, "calendar", new Set())).toBe("2026-10-25");
    expect(dueDateFor("2026-10-24", 2, "calendar", new Set())).toBe("2026-10-26");
  });

  it("rejects fractional offsets and bad dates", () => {
    expect(() => dueDateFor("2026-11-08", 1.5, "calendar")).toThrow();
    expect(() => dueDateFor("2026-02-30", 1, "calendar")).toThrow();
  });
});

describe("dueDateFor, business days", () => {
  const none = new Set<string>();

  it("counts only Monday to Friday", () => {
    // 2026-11-08 is a Sunday.
    expect(dueDateFor("2026-11-08", -1, "business", none)).toBe("2026-11-06"); // Fri
    expect(dueDateFor("2026-11-08", -3, "business", none)).toBe("2026-11-04"); // Wed
    expect(dueDateFor("2026-11-09", -1, "business", none)).toBe("2026-11-06"); // Mon → Fri
    expect(dueDateFor("2026-11-06", 1, "business", none)).toBe("2026-11-09"); // Fri → Mon
    expect(dueDateFor("2026-11-06", 5, "business", none)).toBe("2026-11-13");
  });

  it("offset 0 keeps a working day and otherwise moves to the working day before", () => {
    expect(dueDateFor("2026-11-04", 0, "business", none)).toBe("2026-11-04");
    expect(dueDateFor("2026-11-08", 0, "business", none)).toBe("2026-11-06"); // Sunday → Friday
    expect(dueDateFor("2026-11-07", 0, "business", none)).toBe("2026-11-06"); // Saturday → Friday
  });

  it("steps over holidays when counting", () => {
    const holidays = nrw("2026-04-01", "2026-06-30");
    // Ascension Thursday 14.05.2026.
    expect(dueDateFor("2026-05-18", -1, "business", holidays)).toBe("2026-05-15");
    expect(dueDateFor("2026-05-18", -2, "business", holidays)).toBe("2026-05-13"); // skips Thu
    expect(dueDateFor("2026-05-12", 2, "business", holidays)).toBe("2026-05-15"); // Wed, (Thu), Fri
    // Calendar days ignore them.
    expect(dueDateFor("2026-05-18", -2, "calendar", holidays)).toBe("2026-05-16");
  });

  it("an offset landing on a holiday moves on to the next working day in that direction", () => {
    const holidays = nrw("2026-04-01", "2026-04-30");
    // Good Friday 03.04. and Easter Monday 06.04.2026: +1 working day after Thursday is Tuesday.
    expect(dueDateFor("2026-04-02", 1, "business", holidays)).toBe("2026-04-07");
    // ...and -1 working day before Tuesday 07.04. is Thursday 02.04.
    expect(dueDateFor("2026-04-07", -1, "business", holidays)).toBe("2026-04-02");
    // T on a holiday that is a weekday moves to the day before.
    expect(dueDateFor("2026-04-06", 0, "business", holidays)).toBe("2026-04-02");
  });

  it("reaches over the year boundary with the NRW calendar", () => {
    // 01.01.2027 is a Friday and New Year's Day.
    expect(dueDateForNrw("2027-01-04", -1, "business")).toBe("2026-12-31");
    expect(dueDateForNrw("2026-12-23", 3, "business")).toBe("2026-12-29"); // 24., (25., 26., 27.), 28., 29.
  });

  it("long business offsets stay inside the holiday window", () => {
    const { from, to } = holidayWindow("2026-06-07", -60);
    expect(from < "2026-03-01").toBe(true);
    expect(to > "2026-06-07").toBe(true);
    // 60 plain working days before Sunday 07.06.2026 would be Monday 16.03.; six weekday holidays
    // in between (03.04., 06.04., 01.05., 14.05., 25.05., 04.06.) push it back to Friday 06.03.
    expect(dueDateForNrw("2026-06-07", -60, "business")).toBe("2026-03-06");
  });

  it("negative and positive offsets are mirror images on a plain week", () => {
    expect(dueDateFor("2026-11-04", 2, "business", none)).toBe("2026-11-06");
    expect(dueDateFor("2026-11-06", -2, "business", none)).toBe("2026-11-04");
  });
});

describe("isBusinessDay", () => {
  it("is false on weekends and holidays", () => {
    const holidays = nrw("2026-05-01", "2026-05-31");
    expect(isBusinessDay("2026-05-14", holidays)).toBe(false); // Ascension
    expect(isBusinessDay("2026-05-16", holidays)).toBe(false); // Saturday
    expect(isBusinessDay("2026-05-18", holidays)).toBe(true);
  });
});

describe("due instants", () => {
  it("clockTime normalises Postgres times", () => {
    expect(clockTime("09:00:00")).toBe("09:00");
    expect(clockTime("9:05")).toBe("09:05");
    expect(clockTime("17:30:15.5")).toBe("17:30");
    expect(clockTime("24:00")).toBeNull();
    expect(clockTime(null)).toBeNull();
    expect(clockTime("abc")).toBeNull();
  });

  it("resolves the wall-clock time in Europe/Berlin, summer and winter time", () => {
    expect(dueInstantFor("2026-07-01", null, "09:00").toISOString()).toBe(
      "2026-07-01T07:00:00.000Z",
    );
    expect(dueInstantFor("2026-12-01", null, "09:00").toISOString()).toBe(
      "2026-12-01T08:00:00.000Z",
    );
    // Item time wins over the company default.
    expect(dueInstantFor("2026-12-01", "17:30:00", "09:00").toISOString()).toBe(
      "2026-12-01T16:30:00.000Z",
    );
  });

  it("keeps the local time on the days the clocks change", () => {
    expect(dueInstantFor("2026-03-28", null, "09:00").toISOString()).toBe(
      "2026-03-28T08:00:00.000Z",
    );
    expect(dueInstantFor("2026-03-29", null, "09:00").toISOString()).toBe(
      "2026-03-29T07:00:00.000Z",
    );
    expect(dueInstantFor("2026-10-24", null, "09:00").toISOString()).toBe(
      "2026-10-24T07:00:00.000Z",
    );
    expect(dueInstantFor("2026-10-25", null, "09:00").toISOString()).toBe(
      "2026-10-25T08:00:00.000Z",
    );
  });

  it("taskDueInstant needs the anchor; without it the task has no due date yet", () => {
    const anchors = new Map([["event_day", "2026-11-08"]]);
    const defaults = { defaultDueTime: "09:00" };
    const rule = { anchorKey: "event_day", offsetDays: -7, dayMode: "calendar" as const };
    expect(taskDueInstant(anchors, rule, new Set(), defaults)?.toISOString()).toBe(
      "2026-11-01T08:00:00.000Z",
    );
    expect(
      taskDueInstant(anchors, { ...rule, anchorKey: "permit_decision" }, new Set(), defaults),
    ).toBeNull();
    expect(taskDueInstant(anchors, { ...rule, anchorKey: null }, new Set(), defaults)).toBeNull();
    expect(taskDueInstant(anchors, { ...rule, offsetDays: null }, new Set(), defaults)).toBeNull();
  });
});
