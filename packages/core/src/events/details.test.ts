import { describe, expect, it } from "vitest";
import {
  canMoveEvent,
  checkEventTimes,
  isAnnounced,
  isClockTime,
  isHappening,
  normalizeClockTime,
  parseEuroCents,
} from "./details";

const times = { setup: "05:00", open: "08:00", close: "16:00", teardown: "18:00" };

describe("checkEventTimes", () => {
  it("accepts the usual market day", () => {
    expect(checkEventTimes(times, false)).toBeNull();
    expect(checkEventTimes({ ...times, teardown: "16:00" }, false)).toBeNull();
  });

  it("rejects malformed times", () => {
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("7:00")).toBe(false);
    expect(isClockTime("23:59")).toBe(true);
    expect(checkEventTimes({ ...times, open: "8 Uhr" }, false)).toBe("invalid_time");
  });

  it("needs open < close ≤ teardown", () => {
    expect(checkEventTimes({ ...times, close: "08:00" }, false)).toBe("open_after_close");
    expect(checkEventTimes({ ...times, teardown: "15:00" }, false)).toBe("close_after_teardown");
  });

  it("allows a late setup time only for multi-day events (set up the day before)", () => {
    const late = { ...times, setup: "14:00" };
    expect(checkEventTimes(late, false)).toBe("setup_after_open");
    expect(checkEventTimes(late, true)).toBeNull();
  });
});

describe("normalizeClockTime", () => {
  it.each([
    ["5", "05:00"],
    ["05", "05:00"],
    ["530", "05:30"],
    ["0530", "05:30"],
    ["5:30", "05:30"],
    ["5.30", "05:30"],
    ["17:45 Uhr", "17:45"],
    ["0", "00:00"],
  ])("%s → %s", (input, time) => {
    expect(normalizeClockTime(input)).toBe(time);
  });

  it.each(["", "24", "12:60", "5 PM", "1:5", "abc"])("rejects %j", (input) => {
    expect(normalizeClockTime(input)).toBeNull();
  });
});

describe("parseEuroCents", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12,50 €", 1250],
    ["€ 2,50", 250],
    ["12.50", 1250],
    ["1.500", 150_000],
    ["1.234,56", 123_456],
    ["0", 0],
  ])("%s → %i cents", (input, cents) => {
    expect(parseEuroCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-5", "12,345", "1,2,3", "10000,01"])("rejects %j", (input) => {
    expect(parseEuroCents(input)).toBeNull();
  });
});

describe("moving events", () => {
  it("is possible until the event runs; announced ones get a warning", () => {
    expect(["draft", "planned", "confirmed"].every((s) => canMoveEvent(s as never))).toBe(true);
    expect(["live", "completed", "closed", "cancelled"].some((s) => canMoveEvent(s as never))).toBe(
      false,
    );
    expect(isAnnounced("draft")).toBe(false);
    expect(isAnnounced("confirmed")).toBe(true);
  });
});

describe("isHappening", () => {
  const day = { startsOn: "2026-12-04", endsOn: "2026-12-06" };
  it("is true while it runs or on one of its days", () => {
    expect(isHappening({ ...day, status: "live" }, "2026-11-01")).toBe(true);
    expect(isHappening({ ...day, status: "confirmed" }, "2026-12-04")).toBe(true);
    expect(isHappening({ ...day, status: "planned" }, "2026-12-06")).toBe(true);
    expect(isHappening({ ...day, status: "completed" }, "2026-12-05")).toBe(true);
  });
  it("is false before and after, and for drafts and cancelled events", () => {
    expect(isHappening({ ...day, status: "confirmed" }, "2026-12-03")).toBe(false);
    expect(isHappening({ ...day, status: "completed" }, "2026-12-07")).toBe(false);
    expect(isHappening({ ...day, status: "draft" }, "2026-12-05")).toBe(false);
    expect(isHappening({ ...day, status: "cancelled" }, "2026-12-05")).toBe(false);
  });
});
