import { describe, expect, it } from "vitest";
import { isSnoozed, isValidSnoozeDate, snoozePresetDate } from "./snooze";

describe("isSnoozed", () => {
  it("is snoozed until the snooze date, which is the day it is back", () => {
    expect(isSnoozed({ snoozedUntil: "2026-10-27" }, "2026-10-26")).toBe(true);
    expect(isSnoozed({ snoozedUntil: "2026-10-27" }, "2026-10-27")).toBe(false);
    expect(isSnoozed({ snoozedUntil: "2026-10-27" }, "2026-10-28")).toBe(false);
  });
  it("is never snoozed without a date", () => {
    expect(isSnoozed({ snoozedUntil: null }, "2026-10-26")).toBe(false);
  });
});

describe("snoozePresetDate", () => {
  it("tomorrow crosses month, year and leap day", () => {
    expect(snoozePresetDate("tomorrow", "2026-10-22")).toBe("2026-10-23");
    expect(snoozePresetDate("tomorrow", "2026-10-31")).toBe("2026-11-01");
    expect(snoozePresetDate("tomorrow", "2026-12-31")).toBe("2027-01-01");
    expect(snoozePresetDate("tomorrow", "2028-02-28")).toBe("2028-02-29");
  });
  it("next week is the next Monday, from any weekday", () => {
    // 2026-10-22 is a Thursday
    expect(snoozePresetDate("next_week", "2026-10-22")).toBe("2026-10-26");
    expect(snoozePresetDate("next_week", "2026-10-25")).toBe("2026-10-26"); // Sunday
    expect(snoozePresetDate("next_week", "2026-10-26")).toBe("2026-11-02"); // Monday: a week later
  });
  it("is stable across the DST switches (calendar dates, not 24 h steps)", () => {
    // clocks go back on 2026-10-25 and forward on 2026-03-29
    expect(snoozePresetDate("tomorrow", "2026-10-24")).toBe("2026-10-25");
    expect(snoozePresetDate("tomorrow", "2026-10-25")).toBe("2026-10-26");
    expect(snoozePresetDate("next_week", "2026-10-23")).toBe("2026-10-26");
    expect(snoozePresetDate("tomorrow", "2026-03-28")).toBe("2026-03-29");
    expect(snoozePresetDate("next_week", "2026-03-27")).toBe("2026-03-30");
    expect(snoozePresetDate("next_week", "2026-03-29")).toBe("2026-03-30");
  });
  it("next week crosses month and year ends", () => {
    expect(snoozePresetDate("next_week", "2026-10-29")).toBe("2026-11-02");
    expect(snoozePresetDate("next_week", "2026-12-30")).toBe("2027-01-04");
  });
});

describe("isValidSnoozeDate", () => {
  it("needs a real date after today", () => {
    expect(isValidSnoozeDate("2026-10-23", "2026-10-22")).toBe(true);
    expect(isValidSnoozeDate("2026-10-22", "2026-10-22")).toBe(false);
    expect(isValidSnoozeDate("2026-10-21", "2026-10-22")).toBe(false);
    expect(isValidSnoozeDate("2026-02-30", "2026-01-01")).toBe(false);
    expect(isValidSnoozeDate("morgen", "2026-10-22")).toBe(false);
    expect(isValidSnoozeDate(null, "2026-10-22")).toBe(false);
  });
});
