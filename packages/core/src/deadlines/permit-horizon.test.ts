import { describe, expect, it } from "vitest";
import {
  isPermitMarketInReach,
  isValidPermitHorizonDays,
  PERMIT_HORIZON_DEFAULT_DAYS,
  permitHorizonEnd,
  permitNotifyEnd,
  permitUrgency,
} from "./permit-horizon";

const TODAY = "2026-10-21";

describe("permitNotifyEnd", () => {
  it("is six calendar months ahead, across the year end", () => {
    expect(permitNotifyEnd(TODAY)).toBe("2027-04-21");
    expect(permitNotifyEnd("2026-06-15")).toBe("2026-12-15");
    expect(permitNotifyEnd("2026-07-01")).toBe("2027-01-01");
  });

  it("clamps to the last day of a shorter month, leap years included", () => {
    expect(permitNotifyEnd("2026-08-31")).toBe("2027-02-28");
    expect(permitNotifyEnd("2027-08-31")).toBe("2028-02-29");
    expect(permitNotifyEnd("2026-12-31")).toBe("2027-06-30");
  });
});

describe("isPermitMarketInReach", () => {
  it("lets markets up to six months ahead notify, not later ones", () => {
    expect(isPermitMarketInReach("2026-10-24", TODAY)).toBe(true);
    expect(isPermitMarketInReach("2027-04-21", TODAY)).toBe(true);
    expect(isPermitMarketInReach("2027-04-22", TODAY)).toBe(false);
  });

  it("does not hold back a permit that no market needs", () => {
    expect(isPermitMarketInReach(null, TODAY)).toBe(true);
  });
});

describe("permitUrgency", () => {
  it("splits overdue, today, soon (≤ 7 days) and upcoming (up to the horizon)", () => {
    expect(permitUrgency("2026-10-20", TODAY, 30)).toBe("overdue");
    expect(permitUrgency("2026-10-21", TODAY, 30)).toBe("today");
    expect(permitUrgency("2026-10-28", TODAY, 30)).toBe("soon");
    expect(permitUrgency("2026-10-29", TODAY, 30)).toBe("upcoming");
    expect(permitUrgency("2026-11-20", TODAY, 30)).toBe("upcoming"); // day 30
    expect(permitUrgency("2026-11-21", TODAY, 30)).toBeNull(); // day 31
  });

  it("honours a shorter horizon", () => {
    expect(permitUrgency("2026-11-04", TODAY, 14)).toBe("upcoming"); // day 14
    expect(permitUrgency("2026-11-05", TODAY, 14)).toBeNull();
    expect(permitUrgency("2026-10-28", TODAY, 7)).toBe("soon");
    expect(permitUrgency("2026-10-29", TODAY, 7)).toBeNull();
  });

  it("counts calendar days across month, year and DST changes", () => {
    expect(permitUrgency("2027-01-04", "2026-12-30", 7)).toBe("soon");
    expect(permitUrgency("2026-10-27", "2026-10-20", 7)).toBe("soon"); // DST ends 25 Oct
    expect(permitUrgency("2026-10-28", "2026-10-20", 7)).toBeNull();
  });
});

describe("permit horizon setting", () => {
  it("accepts integers from 7 to 180 only", () => {
    expect(isValidPermitHorizonDays(PERMIT_HORIZON_DEFAULT_DAYS)).toBe(true);
    for (const ok of [7, 180]) expect(isValidPermitHorizonDays(ok)).toBe(true);
    for (const bad of [6, 181, 0, -1, 30.5, Number.NaN, "30", null, undefined])
      expect(isValidPermitHorizonDays(bad)).toBe(false);
  });

  it("computes the last listed day", () => {
    expect(permitHorizonEnd(TODAY, 30)).toBe("2026-11-20");
  });
});
