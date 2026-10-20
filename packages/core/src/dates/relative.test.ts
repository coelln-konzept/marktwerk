import { describe, expect, it } from "vitest";
import { formatOffset, resolveRelativeDue } from "./relative";

describe("resolveRelativeDue", () => {
  it("resolves a negative offset to Berlin wall-clock time", () => {
    // Market 2026-11-08, T-30 at 09:00 → 2026-10-09 09:00 CEST (UTC+2)
    expect(resolveRelativeDue("2026-11-08", -30, "09:00").toISOString()).toBe(
      "2026-10-09T07:00:00.000Z",
    );
  });

  it("keeps the wall-clock time across the DST change", () => {
    // DST ends 2026-10-25. T-7 from 2026-11-01 at 06:00 is 2026-10-25 06:00 CET (UTC+1)
    expect(resolveRelativeDue("2026-11-01", -7, "06:00").toISOString()).toBe(
      "2026-10-25T05:00:00.000Z",
    );
    // and one day earlier is still summer time
    expect(resolveRelativeDue("2026-11-01", -8, "06:00").toISOString()).toBe(
      "2026-10-24T04:00:00.000Z",
    );
  });

  it("supports positive offsets (post-event tasks)", () => {
    expect(resolveRelativeDue("2026-12-31", 2, "10:30").toISOString()).toBe(
      "2027-01-02T09:30:00.000Z",
    );
  });

  it("rejects malformed input", () => {
    expect(() => resolveRelativeDue("08.11.2026", 0, "09:00")).toThrow();
    expect(() => resolveRelativeDue("2026-11-08", 0, "9am")).toThrow();
    expect(() => resolveRelativeDue("2026-11-08", 1.5, "09:00")).toThrow();
  });
});

describe("formatOffset", () => {
  it.each([
    [-30, "T-30"],
    [0, "T"],
    [2, "T+2"],
  ])("%i → %s", (offset, label) => {
    expect(formatOffset(offset)).toBe(label);
  });
});
