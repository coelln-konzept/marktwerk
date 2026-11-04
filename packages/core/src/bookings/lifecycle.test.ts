import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYMENT_RULES,
  paymentDueDate,
  paymentReference,
  reminderDate,
  sweepReservations,
} from "./lifecycle";

describe("paymentDueDate", () => {
  it("counts working days and skips the weekend", () => {
    // Thu 5 Nov 2026 + 4 working days: Fri 6, Mon 9, Tue 10, Wed 11
    expect(paymentDueDate("2026-11-05", "2026-11-22", 4)).toBe("2026-11-11");
  });

  it("skips NRW holidays (Allerheiligen, Mon 1 Nov 2027)", () => {
    expect(paymentDueDate("2027-10-29", "2027-11-28", 4)).toBe("2027-11-05");
  });

  it("is capped to the last working day before the market", () => {
    // Mon 9 Nov + 4 = Fri 13 Nov, but the market is Thu 12 Nov
    expect(paymentDueDate("2026-11-09", "2026-11-12", 4)).toBe("2026-11-11");
    // the due date may not be the market day itself either
    expect(paymentDueDate("2026-11-05", "2026-11-11", 4)).toBe("2026-11-10");
  });

  it("falls back to the market day when even the cap has passed", () => {
    // reserved Saturday for a Sunday market: the Friday before is already gone
    expect(paymentDueDate("2026-11-14", "2026-11-15", 4)).toBe("2026-11-15");
  });

  it("uses 4 working days by default", () => {
    expect(DEFAULT_PAYMENT_RULES).toEqual({ paymentDays: 4, reminderDaysBefore: 2 });
  });
});

describe("reminderDate", () => {
  it("is the given number of working days before the due date", () => {
    expect(reminderDate("2026-11-05", "2026-11-11", 2)).toBe("2026-11-09");
    // over a weekend: due Tue 17 Nov, 2 before = Fri 13 Nov
    expect(reminderDate("2026-11-10", "2026-11-17", 2)).toBe("2026-11-13");
  });

  it("is null when it would fall on or before the reservation day", () => {
    expect(reminderDate("2026-11-09", "2026-11-11", 2)).toBeNull();
    expect(reminderDate("2026-11-10", "2026-11-11", 3)).toBeNull();
  });

  it("can be on the due day itself", () => {
    expect(reminderDate("2026-11-05", "2026-11-11", 0)).toBe("2026-11-11");
  });
});

describe("paymentReference", () => {
  it("builds market initials, day and month, and the stall", () => {
    expect(
      paymentReference({
        eventName: "Flohmarkt Riehler Gürtel",
        marketDate: "2026-11-12",
        stallNumber: "B-13",
      }),
    ).toBe("RG-1211-B13");
  });

  it("folds umlauts and skips filler words", () => {
    expect(
      paymentReference({
        eventName: "Antikmarkt am Überseering",
        marketDate: "2026-03-01",
        stallNumber: "C-7",
      }),
    ).toBe("UE-0103-C7");
  });

  it("uses the first two letters of a single word", () => {
    expect(
      paymentReference({
        eventName: "Flohmarkt Troisdorf",
        marketDate: "2026-12-05",
        stallNumber: "A-1",
      }),
    ).toBe("TR-0512-A1");
  });

  it("stays within SEPA-safe characters and 20 characters", () => {
    const ref = paymentReference({
      eventName: "Stadtfest Große Kölner Herbst Woche Mit Vielen Wörtern",
      marketDate: "2026-09-19",
      stallNumber: "AA-120",
    });
    expect(ref).toMatch(/^[A-Z0-9-]+$/);
    expect(ref.length).toBeLessThanOrEqual(20);
  });
});

describe("sweepReservations", () => {
  const base = { dueOn: "2026-11-11", reminderOn: "2026-11-09" as string | null };

  it("reminds once on or after the reminder day", () => {
    const list = [
      { id: "a", ...base },
      { id: "b", ...base, remindedOn: "2026-11-09" },
      { id: "c", ...base, reminderOn: null },
    ];
    expect(sweepReservations(list, "2026-11-08")).toEqual({ remind: [], release: [] });
    expect(sweepReservations(list, "2026-11-10")).toEqual({ remind: ["a"], release: [] });
  });

  it("releases unpaid reservations after the due date, without a reminder", () => {
    const list = [
      { id: "a", ...base },
      { id: "p", ...base, paidOn: "2026-11-10" },
    ];
    expect(sweepReservations(list, "2026-11-11")).toEqual({ remind: ["a"], release: [] });
    expect(sweepReservations(list, "2026-11-12")).toEqual({ remind: [], release: ["a"] });
  });
});
