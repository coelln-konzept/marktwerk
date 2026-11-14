import { describe, expect, it } from "vitest";
import {
  canMoveEvent,
  eventDateRange,
  isAnnounced,
  isClockTime,
  isEventDateInRange,
  isHappening,
  normalizeClockTime,
  parseEuroCents,
} from "./details";

describe("isClockTime", () => {
  it("accepts only HH:mm from 00:00 to 23:59", () => {
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("7:00")).toBe(false);
    expect(isClockTime("8 Uhr")).toBe(false);
    expect(isClockTime("23:59")).toBe(true);
    expect(isClockTime("00:00")).toBe(true);
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

describe("event date range", () => {
  it("runs from 1 January last year to 31 December five years ahead", () => {
    expect(eventDateRange("2026-11-14")).toEqual({ min: "2025-01-01", max: "2031-12-31" });
    // New Year's Eve and New Year's Day: the range follows the calendar year of today.
    expect(eventDateRange("2026-12-31").max).toBe("2031-12-31");
    expect(eventDateRange("2027-01-01")).toEqual({ min: "2026-01-01", max: "2032-12-31" });
  });

  it("accepts dates inside and rejects typos, far years and non-dates", () => {
    const today = "2026-11-14";
    expect(isEventDateInRange("2025-01-01", today)).toBe(true);
    expect(isEventDateInRange("2031-12-31", today)).toBe(true);
    expect(isEventDateInRange("2024-12-31", today)).toBe(false);
    expect(isEventDateInRange("2032-01-01", today)).toBe(false);
    expect(isEventDateInRange("9999-12-31", today)).toBe(false);
    expect(isEventDateInRange("0001-01-01", today)).toBe(false);
    expect(isEventDateInRange("2026-02-30", today)).toBe(false);
    expect(isEventDateInRange("", today)).toBe(false);
    expect(isEventDateInRange(null, today)).toBe(false);
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
