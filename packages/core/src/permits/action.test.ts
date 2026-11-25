import { describe, expect, it } from "vitest";
import { logbookDisplayState, permitActionTier, permitNeedsActionNow } from "./action";

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

describe("logbookDisplayState", () => {
  const show = (state: "missing" | "preparing", applyBy: string | null) =>
    logbookDisplayState(state, permitActionTier({ state, applyBy }, TODAY, HORIZON));

  it("shows a not-started permit beyond the horizon as 'Noch nicht fällig'", () => {
    expect(show("missing", "2027-03-01")).toBe("not_due");
  });

  it("keeps 'Fehlt' when the apply-by date is within the horizon, passed or unknown", () => {
    expect(show("missing", "2026-11-15")).toBe("missing");
    expect(show("missing", "2026-10-01")).toBe("missing");
    expect(show("missing", null)).toBe("missing");
  });

  it("leaves other states alone, even when they are not due", () => {
    expect(show("preparing", "2027-03-01")).toBe("preparing");
    expect(logbookDisplayState("applied", null)).toBe("applied");
  });

  it("a not-due permit stays out of 'Jetzt zu tun'", () => {
    expect(permitActionTier({ state: "not_due", applyBy: "2027-03-01" }, TODAY, HORIZON)).toBe(
      "not_due",
    );
    expect(permitNeedsActionNow({ state: "not_due", applyBy: "2027-03-01" }, TODAY, HORIZON)).toBe(
      false,
    );
  });
});

describe("logbookDisplayState: Antwort überfällig", () => {
  const show = (expectedDecisionOn: string | null, today = TODAY) =>
    logbookDisplayState("applied", null, { expectedDecisionOn, today });

  it("shows a filed permit whose expected decision has passed as 'Antwort überfällig'", () => {
    expect(show("2026-10-28")).toBe("answer_overdue");
    expect(show("2026-01-15")).toBe("answer_overdue");
  });

  it("stays 'Beantragt' on the expected day, before it and without a date", () => {
    expect(show("2026-10-29")).toBe("applied");
    expect(show("2026-10-30")).toBe("applied");
    expect(show(null)).toBe("applied");
    // Without the answer data the state is left alone (callers that only know the status).
    expect(logbookDisplayState("applied", null)).toBe("applied");
  });

  it("year boundary: decision expected on 31.12., overdue on 01.01.", () => {
    expect(show("2026-12-31", "2026-12-31")).toBe("applied");
    expect(show("2026-12-31", "2027-01-01")).toBe("answer_overdue");
  });

  it("never touches another state, even with a passed decision date", () => {
    const answer = { expectedDecisionOn: "2026-01-01", today: TODAY };
    for (const state of ["granted", "preparing", "rejected", "past", "missing"] as const)
      expect(logbookDisplayState(state, null, answer)).toBe(state);
  });

  it("is not part of 'Jetzt zu tun' (the badge counts permits to apply for)", () => {
    const permit = { state: "answer_overdue" as const, applyBy: "2026-09-01" };
    expect(permitActionTier(permit, TODAY, HORIZON)).toBeNull();
  });
});
