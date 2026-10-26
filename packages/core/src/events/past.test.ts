import { describe, expect, it } from "vitest";
import { isPastEvent, isPastMarketLeftover, PAST_EVENT_GRACE_DAYS, pastEventCutoff } from "./past";

describe("isPastEvent", () => {
  it("is past from the 8th day after the last event day", () => {
    expect(PAST_EVENT_GRACE_DAYS).toBe(7);
    expect(isPastEvent("2026-10-14", "2026-10-22")).toBe(true); // 8 days ago
    expect(isPastEvent("2026-10-15", "2026-10-22")).toBe(false); // exactly 7 days ago
    expect(isPastEvent("2026-10-16", "2026-10-22")).toBe(false);
  });
  it("is never past while running or ahead", () => {
    expect(isPastEvent("2026-10-22", "2026-10-22")).toBe(false);
    expect(isPastEvent("2026-11-30", "2026-10-22")).toBe(false);
  });
  it("crosses month and year ends", () => {
    expect(isPastEvent("2026-09-23", "2026-10-01")).toBe(true); // 8 days
    expect(isPastEvent("2026-09-24", "2026-10-01")).toBe(false); // 7 days
    expect(isPastEvent("2026-12-24", "2027-01-01")).toBe(true);
    expect(isPastEvent("2026-12-25", "2027-01-01")).toBe(false);
  });
  it("counts leap days", () => {
    expect(isPastEvent("2028-02-21", "2028-02-29")).toBe(true); // 8 days
    expect(isPastEvent("2028-02-22", "2028-02-29")).toBe(false); // 7 days
    expect(isPastEvent("2027-02-20", "2027-03-01")).toBe(true); // no leap day: 9 days
    expect(isPastEvent("2027-02-22", "2027-03-01")).toBe(false); // 7 days
  });
  it("counts calendar days across the DST switches, not 24 h steps", () => {
    // clocks go forward 2026-03-29 and back 2026-10-25
    expect(isPastEvent("2026-03-22", "2026-03-30")).toBe(true);
    expect(isPastEvent("2026-03-23", "2026-03-30")).toBe(false);
    expect(isPastEvent("2026-10-17", "2026-10-25")).toBe(true);
    expect(isPastEvent("2026-10-18", "2026-10-25")).toBe(false);
    expect(isPastEvent("2026-10-18", "2026-10-26")).toBe(true);
  });
});

describe("pastEventCutoff", () => {
  it("is seven days before today", () => {
    expect(pastEventCutoff("2026-10-22")).toBe("2026-10-15");
    expect(pastEventCutoff("2027-01-03")).toBe("2026-12-27");
  });
});

describe("isPastMarketLeftover", () => {
  const today = "2026-10-26";
  it("counts only already due or undated tasks of markets that ended more than 7 days ago", () => {
    expect(isPastMarketLeftover("2026-10-18", "2026-10-11", today)).toBe(true);
    expect(isPastMarketLeftover("2026-10-18", null, today)).toBe(true);
    expect(isPastMarketLeftover("2026-10-18", "2026-10-25", today)).toBe(true);
  });
  it("keeps follow-ups due today or later in the lists", () => {
    expect(isPastMarketLeftover("2026-10-18", "2026-10-26", today)).toBe(false);
    expect(isPastMarketLeftover("2026-10-17", "2026-10-31", today)).toBe(false);
  });
  it("never applies to current markets or tasks without a market", () => {
    expect(isPastMarketLeftover("2026-10-19", "2026-10-01", today)).toBe(false); // ended exactly 7 days ago
    expect(isPastMarketLeftover(null, "2026-10-01", today)).toBe(false);
  });
});
