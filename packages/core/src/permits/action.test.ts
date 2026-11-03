import { describe, expect, it } from "vitest";
import { permitActionTier, permitNeedsActionNow } from "./action";

const TODAY = "2026-10-29";
const HORIZON = 30;

describe("permitActionTier", () => {
  it("is overdue once the apply-by date has passed and nothing is filed", () => {
    expect(permitActionTier({ state: "missing", applyBy: "2026-10-28" }, TODAY, HORIZON)).toBe(
      "overdue",
    );
    expect(permitActionTier({ state: "preparing", applyBy: "2026-01-01" }, TODAY, HORIZON)).toBe(
      "overdue",
    );
  });

  it("is apply_now from today up to the horizon (inclusive), not_due after it", () => {
    expect(permitActionTier({ state: "missing", applyBy: TODAY }, TODAY, HORIZON)).toBe(
      "apply_now",
    );
    expect(permitActionTier({ state: "missing", applyBy: "2026-11-28" }, TODAY, HORIZON)).toBe(
      "apply_now",
    ); // day 30
    expect(permitActionTier({ state: "missing", applyBy: "2026-11-29" }, TODAY, HORIZON)).toBe(
      "not_due",
    ); // day 31
  });

  it("honours the company horizon", () => {
    const p = { state: "preparing", applyBy: "2026-12-20" } as const;
    expect(permitActionTier(p, TODAY, 30)).toBe("not_due");
    expect(permitActionTier(p, TODAY, 60)).toBe("apply_now");
    expect(permitActionTier(p, TODAY, 180)).toBe("apply_now");
  });

  it("counts calendar days across the DST change and the year end", () => {
    // Berlin leaves DST on 25.10.2026: a day is still a day.
    expect(permitActionTier({ state: "missing", applyBy: "2026-11-01" }, "2026-10-24", 8)).toBe(
      "apply_now",
    );
    expect(permitActionTier({ state: "missing", applyBy: "2026-11-02" }, "2026-10-24", 8)).toBe(
      "not_due",
    );
    // Across the year end and a leap day.
    expect(permitActionTier({ state: "missing", applyBy: "2027-01-14" }, "2026-12-15", 30)).toBe(
      "apply_now",
    );
    expect(permitActionTier({ state: "missing", applyBy: "2027-01-15" }, "2026-12-15", 30)).toBe(
      "not_due",
    );
    expect(permitActionTier({ state: "missing", applyBy: "2028-02-29" }, "2028-01-30", 30)).toBe(
      "apply_now",
    );
    expect(permitActionTier({ state: "missing", applyBy: "2028-03-01" }, "2028-01-30", 30)).toBe(
      "not_due",
    );
  });

  it("treats a missing permit without an apply-by date as due now", () => {
    expect(permitActionTier({ state: "missing", applyBy: null }, TODAY, HORIZON)).toBe("apply_now");
  });

  it("always needs action for rejected and expired permits", () => {
    expect(permitActionTier({ state: "rejected", applyBy: "2027-05-01" }, TODAY, HORIZON)).toBe(
      "overdue",
    );
    expect(permitActionTier({ state: "expired", applyBy: null }, TODAY, HORIZON)).toBe("overdue");
  });

  it("is null for everything that needs nothing from the office", () => {
    for (const state of [
      "applied",
      "granted",
      "expiring",
      "not_required",
      "past",
      "superseded",
    ] as const)
      expect(permitActionTier({ state, applyBy: "2026-01-01" }, TODAY, HORIZON)).toBeNull();
  });
});

describe("permitNeedsActionNow", () => {
  it("is the badge definition: overdue or due within the horizon", () => {
    expect(permitNeedsActionNow({ state: "missing", applyBy: "2026-10-01" }, TODAY, HORIZON)).toBe(
      true,
    );
    expect(permitNeedsActionNow({ state: "missing", applyBy: "2026-11-10" }, TODAY, HORIZON)).toBe(
      true,
    );
    expect(permitNeedsActionNow({ state: "missing", applyBy: "2027-02-17" }, TODAY, HORIZON)).toBe(
      false,
    );
    expect(permitNeedsActionNow({ state: "applied", applyBy: "2026-10-01" }, TODAY, HORIZON)).toBe(
      false,
    );
  });
});
