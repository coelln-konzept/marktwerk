import { describe, expect, it } from "vitest";
import { type MinijobParameters, minijobMonthStatus } from "./minijob";

// 2026 values; in the app they come from the legal_parameter table.
const params2026: MinijobParameters = {
  limitCents: 60_300,
  overrunCeilingFactor: 2,
  maxOverrunMonths: 2,
};
const base = { hourlyRateCents: 1390, previousOverrunMonths: 0, previousElevenMonthsCents: 0 };

describe("minijobMonthStatus", () => {
  it("computes earnings and remaining hours under the limit", () => {
    const s = minijobMonthStatus(
      { ...base, workedMinutes: 20 * 60, plannedMinutes: 6 * 60 },
      params2026,
    );
    expect(s.earnedCents).toBe(36_140); // 26 h × 13,90 €
    expect(s.level).toBe("ok");
    // (603 − 361,40) € / 13,90 € ≈ 17,38 h → 1042 min
    expect(s.remainingMinutes).toBe(1042);
  });

  it("is amber for an occasional overrun within the ceiling", () => {
    const s = minijobMonthStatus(
      { ...base, workedMinutes: 50 * 60, plannedMinutes: 0 },
      params2026,
    );
    expect(s.earnedCents).toBe(69_500);
    expect(s.level).toBe("amber");
    expect(s.remainingMinutes).toBe(0);
    expect(s.reasons).toEqual(["over_monthly_limit"]);
  });

  it("is red above twice the limit", () => {
    const s = minijobMonthStatus(
      { ...base, workedMinutes: 90 * 60, plannedMinutes: 0 },
      params2026,
    );
    expect(s.level).toBe("red");
    expect(s.reasons).toContain("over_overrun_ceiling");
  });

  it("is red for a third overrun month within 12 months", () => {
    const s = minijobMonthStatus(
      { ...base, workedMinutes: 50 * 60, plannedMinutes: 0, previousOverrunMonths: 2 },
      params2026,
    );
    expect(s.reasons).toContain("too_many_overrun_months");
    expect(s.level).toBe("red");
  });

  it("is red when the 12-month total exceeds 12 × limit", () => {
    const s = minijobMonthStatus(
      {
        ...base,
        workedMinutes: 40 * 60,
        plannedMinutes: 0,
        previousElevenMonthsCents: 11 * 60_300,
      },
      params2026,
    );
    expect(s.level).toBe("ok");
    expect(s.reasons).toEqual([]); // 40 h × 13,90 = 556 € keeps the year at 7.189 €
    const over = minijobMonthStatus(
      {
        ...base,
        workedMinutes: 44 * 60,
        plannedMinutes: 0,
        previousElevenMonthsCents: 11 * 60_300,
      },
      params2026,
    );
    expect(over.reasons).toContain("over_annual_limit");
    expect(over.level).toBe("red");
  });
});
