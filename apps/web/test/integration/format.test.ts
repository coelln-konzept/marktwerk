import { describe, expect, it } from "vitest";
import { formatDateRangeYear, formatDateShortYear } from "@/lib/format";

const today = "2026-10-22";

describe("formatDateShortYear", () => {
  it("stays short in the current year", () => {
    expect(formatDateShortYear("2026-10-25", "de", today)).toBe("So 25.10.");
    expect(formatDateShortYear("2026-01-01", "de", today)).toBe("Do 01.01.");
  });

  it("appends the year in any other year", () => {
    expect(formatDateShortYear("2027-05-02", "de", today)).toBe("So 02.05.2027");
    expect(formatDateShortYear("2025-12-31", "de", today)).toBe("Mi 31.12.2025");
  });

  it("decides by the business date, not by the clock: new year's eve vs. new year", () => {
    expect(formatDateShortYear("2027-01-01", "de", "2026-12-31")).toBe("Fr 01.01.2027");
    expect(formatDateShortYear("2026-12-31", "de", "2026-12-31")).toBe("Do 31.12.");
  });

  it("uses the English day/month order", () => {
    expect(formatDateShortYear("2027-05-02", "en", today)).toBe("Sun 02/05/2027");
    expect(formatDateShortYear("2026-10-25", "en", today)).toBe("Sun 25/10");
  });
});

describe("formatDateRangeYear", () => {
  it("is the plain range in the current year", () => {
    expect(formatDateRangeYear("2026-08-21", "2026-08-23", "de", today)).toBe("Fr–So 21.–23.08.");
    expect(formatDateRangeYear("2026-10-25", "2026-10-25", "de", today)).toBe("So 25.10.");
  });

  it("adds the year for another year", () => {
    expect(formatDateRangeYear("2027-08-20", "2027-08-22", "de", today)).toBe(
      "Fr–So 20.–22.08.2027",
    );
    expect(formatDateRangeYear("2027-05-02", "2027-05-02", "de", today)).toBe("So 02.05.2027");
  });

  it("names both years when the range crosses the new year", () => {
    expect(formatDateRangeYear("2026-12-30", "2027-01-02", "de", today)).toBe(
      "Mi 30.12.–Sa 02.01.2027",
    );
  });
});
