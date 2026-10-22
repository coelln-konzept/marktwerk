import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  checkInstallmentSum,
  derivePayableStatus,
  type InstallmentLike,
  installmentReminderKey,
  installmentState,
  installmentUrgency,
  nextOpenInstallment,
  openAmountCents,
  planInstallments,
  reminderStage,
  splitCents,
} from "./installments";

const row = (over: Partial<InstallmentLike> = {}): InstallmentLike => ({
  status: "open",
  dueOn: "2026-11-01",
  amountCents: 1000,
  paidAmountCents: null,
  ...over,
});

describe("splitCents", () => {
  it("puts the remainder on the last rate", () => {
    expect(splitCents(10_000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitCents(10_001, 3)).toEqual([3333, 3333, 3335]);
    expect(splitCents(1_500_000, 3)).toEqual([500_000, 500_000, 500_000]);
  });

  it("always sums to the total", () => {
    for (const total of [1, 2, 99, 100, 12_345, 270_000, 999_999]) {
      for (const parts of [1, 2, 3, 7, 12]) {
        expect(splitCents(total, parts).reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("handles fewer cents than rates", () => {
    expect(splitCents(2, 3)).toEqual([0, 0, 2]);
  });

  it("rejects nonsense", () => {
    expect(() => splitCents(100, 0)).toThrow();
    expect(() => splitCents(-1, 2)).toThrow();
    expect(() => splitCents(10.5, 2)).toThrow();
  });
});

describe("addMonthsClamped", () => {
  it("clamps to the end of a shorter month but keeps the series day", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("crosses year boundaries", () => {
    expect(addMonthsClamped("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsClamped("2026-12-01", 12)).toBe("2027-12-01");
  });
});

describe("planInstallments", () => {
  it("generates n rates with due dates and a remainder on the last one", () => {
    expect(
      planInstallments({
        totalCents: 10_000,
        count: 3,
        firstDueOn: "2026-11-30",
        intervalMonths: 1,
      }),
    ).toEqual([
      { dueOn: "2026-11-30", amountCents: 3333 },
      { dueOn: "2026-12-30", amountCents: 3333 },
      { dueOn: "2027-01-30", amountCents: 3334 },
    ]);
  });

  it("rejects an invalid interval or too many rates", () => {
    const base = { totalCents: 100, count: 2, firstDueOn: "2026-11-30" };
    expect(() => planInstallments({ ...base, intervalMonths: 0 })).toThrow();
    expect(() => planInstallments({ ...base, count: 61, intervalMonths: 1 })).toThrow();
  });
});

describe("checkInstallmentSum", () => {
  it("accepts a plan that adds up", () => {
    expect(checkInstallmentSum(10_000, [3333, 3333, 3334])).toEqual({ ok: true });
  });

  it("reports what is missing or too much", () => {
    expect(checkInstallmentSum(10_000, [5000, 4000])).toEqual({
      ok: false,
      error: "sum_mismatch",
      differenceCents: 1000,
    });
    expect(checkInstallmentSum(10_000, [6000, 6000])).toMatchObject({
      error: "sum_mismatch",
      differenceCents: -2000,
    });
  });

  it("rejects empty plans and non-positive amounts", () => {
    expect(checkInstallmentSum(100, [])).toMatchObject({ ok: false, error: "empty" });
    expect(checkInstallmentSum(100, [100, 0])).toMatchObject({
      ok: false,
      error: "invalid_amount",
    });
    expect(checkInstallmentSum(100, [150, -50])).toMatchObject({
      ok: false,
      error: "invalid_amount",
    });
  });
});

describe("openAmountCents / installmentState", () => {
  it("is what is left on an unpaid or partly paid rate", () => {
    expect(openAmountCents(row())).toBe(1000);
    expect(openAmountCents(row({ status: "partially_paid", paidAmountCents: 400 }))).toBe(600);
    expect(openAmountCents(row({ status: "paid", paidAmountCents: 1000 }))).toBe(0);
    expect(openAmountCents(row({ status: "cancelled" }))).toBe(0);
  });

  it("shows unpaid rates past their due date as overdue", () => {
    expect(installmentState(row({ dueOn: "2026-10-20" }), "2026-10-21")).toBe("overdue");
    expect(installmentState(row({ dueOn: "2026-10-21" }), "2026-10-21")).toBe("open");
    expect(
      installmentState(row({ status: "partially_paid", dueOn: "2026-10-01" }), "2026-10-21"),
    ).toBe("overdue");
    expect(installmentState(row({ status: "paid", dueOn: "2026-10-01" }), "2026-10-21")).toBe(
      "paid",
    );
  });
});

describe("derivePayableStatus", () => {
  const today = "2026-10-21";

  it("is open while nothing is paid and nothing is late", () => {
    expect(derivePayableStatus([row(), row({ dueOn: "2026-12-01" })], today)).toBe("open");
  });

  it("is partially paid once money went out", () => {
    expect(
      derivePayableStatus(
        [row({ status: "paid", paidAmountCents: 1000, dueOn: "2026-09-01" }), row()],
        today,
      ),
    ).toBe("partially_paid");
    expect(
      derivePayableStatus([row({ status: "partially_paid", paidAmountCents: 100 })], today),
    ).toBe("partially_paid");
  });

  it("is overdue when any unpaid rate is late, even if others are paid", () => {
    expect(
      derivePayableStatus(
        [row({ status: "paid", paidAmountCents: 1000 }), row({ dueOn: "2026-10-01" })],
        today,
      ),
    ).toBe("overdue");
  });

  it("is paid when all active rates are paid; cancelled rates do not count", () => {
    expect(
      derivePayableStatus(
        [row({ status: "paid", paidAmountCents: 1000 }), row({ status: "cancelled" })],
        today,
      ),
    ).toBe("paid");
  });

  it("is cancelled when every rate is cancelled", () => {
    expect(derivePayableStatus([row({ status: "cancelled" })], today)).toBe("cancelled");
    expect(derivePayableStatus([], today)).toBe("cancelled");
  });
});

describe("nextOpenInstallment", () => {
  it("is the earliest rate that still needs money", () => {
    const rows = [
      row({ dueOn: "2026-12-01" }),
      row({ status: "paid", paidAmountCents: 1000, dueOn: "2026-09-01" }),
      row({ dueOn: "2026-11-01" }),
    ];
    expect(nextOpenInstallment(rows)?.dueOn).toBe("2026-11-01");
    expect(nextOpenInstallment([row({ status: "cancelled" })])).toBeNull();
  });
});

describe("reminderStage", () => {
  const today = "2026-10-21";
  it("walks 14 days → 3 days → due day → overdue", () => {
    expect(reminderStage("2026-11-30", today)).toBeNull();
    expect(reminderStage("2026-11-04", today)).toBe("d14");
    expect(reminderStage("2026-10-25", today)).toBe("d14");
    expect(reminderStage("2026-10-24", today)).toBe("d3");
    expect(reminderStage("2026-10-22", today)).toBe("d3");
    expect(reminderStage("2026-10-21", today)).toBe("due");
    expect(reminderStage("2026-10-20", today)).toBe("overdue");
  });

  it("makes keys that change with the due date", () => {
    const a = installmentReminderKey("i1", "d3", "2026-10-24");
    expect(a).toBe("installment:i1:d3:2026-10-24");
    expect(installmentReminderKey("i1", "d3", "2026-10-30")).not.toBe(a);
  });
});

describe("installmentUrgency", () => {
  it("ranks overdue, today and within a week", () => {
    expect(installmentUrgency("2026-10-20", "2026-10-21")).toBe("overdue");
    expect(installmentUrgency("2026-10-21", "2026-10-21")).toBe("today");
    expect(installmentUrgency("2026-10-28", "2026-10-21")).toBe("soon");
    expect(installmentUrgency("2026-10-29", "2026-10-21")).toBeNull();
  });
});
