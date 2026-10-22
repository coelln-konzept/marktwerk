import { describe, expect, it } from "vitest";
import {
  addMonths,
  HU_WEIGHT_LIMIT_KG,
  huIntervalMonths,
  nextAnnualDate,
  OBLIGATION_PRESETS,
  obligationDedupeKey,
  obligationReminderPlan,
  obligationStatus,
  rollForward,
} from "./obligations";

describe("addMonths", () => {
  it("adds whole months", () => {
    expect(addMonths("2026-03-15", 1)).toBe("2026-04-15");
    expect(addMonths("2026-03-15", 24)).toBe("2028-03-15");
    expect(addMonths("2026-11-10", 3)).toBe("2027-02-10");
  });

  it("clamps to the end of shorter months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
  });

  it("handles leap days", () => {
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonths("2028-02-29", 48)).toBe("2032-02-29");
  });

  it("crosses year ends and goes backwards", () => {
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -2)).toBe("2025-11-15");
    expect(addMonths("2026-05-10", 0)).toBe("2026-05-10");
  });

  it("rejects invalid input", () => {
    expect(() => addMonths("2026-02-30", 1)).toThrow();
    expect(() => addMonths("2026-02-10", 1.5)).toThrow();
  });
});

describe("nextAnnualDate", () => {
  it("takes this year's date if it is still ahead (or today), else next year's", () => {
    expect(nextAnnualDate("2026-10-21", 3, 31)).toBe("2027-03-31");
    expect(nextAnnualDate("2026-02-01", 3, 31)).toBe("2026-03-31");
    expect(nextAnnualDate("2026-03-31", 3, 31)).toBe("2026-03-31");
    expect(nextAnnualDate("2026-04-01", 3, 31)).toBe("2027-03-31");
  });

  it("clamps 29 February", () => {
    expect(nextAnnualDate("2026-10-01", 2, 29)).toBe("2027-02-28");
  });
});

describe("rollForward", () => {
  const base = { intervalMonths: null, intervalKm: null, nextDueOn: null, leadDays: 14 };

  it("rolls the date from the completion date when done well before the window", () => {
    expect(
      rollForward({
        ...base,
        intervalMonths: 12,
        nextDueOn: "2027-06-30",
        doneOn: "2026-10-20",
        doneKm: null,
      }),
    ).toEqual({ nextDueOn: "2027-10-20", nextDueKm: null });
  });

  it("keeps the old due date as anchor when done inside the reminder window", () => {
    // KSK report: done on 20 March, due 31 March, lead 30 days -> next 31 March
    expect(
      rollForward({
        ...base,
        intervalMonths: 12,
        leadDays: 30,
        nextDueOn: "2027-03-31",
        doneOn: "2027-03-20",
        doneKm: null,
      }),
    ).toEqual({ nextDueOn: "2028-03-31", nextDueKm: null });
  });

  it("keeps the anchor when done late, as long as that lies after the completion", () => {
    expect(
      rollForward({
        ...base,
        intervalMonths: 24,
        nextDueOn: "2026-09-30",
        doneOn: "2026-10-10",
        doneKm: null,
      }),
    ).toEqual({ nextDueOn: "2028-09-30", nextDueKm: null });
  });

  it("falls back to the completion date when the anchored date is not after it", () => {
    // 6-month interval, 8 months late: anchor + 6 months is still in the past
    expect(
      rollForward({
        ...base,
        intervalMonths: 6,
        nextDueOn: "2026-02-28",
        doneOn: "2026-10-15",
        doneKm: null,
      }),
    ).toEqual({ nextDueOn: "2027-04-15", nextDueKm: null });
  });

  it("clamps month ends", () => {
    expect(rollForward({ ...base, intervalMonths: 1, doneOn: "2026-01-31", doneKm: null })).toEqual(
      { nextDueOn: "2026-02-28", nextDueKm: null },
    );
  });

  it("rolls km from the reading at completion, not from the old target", () => {
    expect(
      rollForward({ ...base, intervalKm: 30_000, doneOn: "2026-10-20", doneKm: 91_400 }),
    ).toEqual({ nextDueOn: null, nextDueKm: 121_400 });
  });

  it("rolls date and km together", () => {
    expect(
      rollForward({
        ...base,
        intervalMonths: 12,
        intervalKm: 30_000,
        nextDueOn: "2026-11-01",
        doneOn: "2026-10-20",
        doneKm: 91_400,
      }),
    ).toEqual({ nextDueOn: "2027-11-01", nextDueKm: 121_400 });
  });

  it("leaves a target empty without interval or reading", () => {
    expect(rollForward({ ...base, doneOn: "2026-10-20", doneKm: null })).toEqual({
      nextDueOn: null,
      nextDueKm: null,
    });
    expect(
      rollForward({ ...base, intervalKm: 10_000, doneOn: "2026-10-20", doneKm: null }).nextDueKm,
    ).toBeNull();
  });
});

describe("obligationStatus", () => {
  const today = "2026-10-21";
  const base = { nextDueOn: null, nextDueKm: null, leadDays: 14, today };

  it("is ok without any target", () => {
    expect(obligationStatus(base)).toMatchObject({ status: "ok", trigger: null });
  });

  it("by date: ok, soon within the lead days, due today, overdue after", () => {
    expect(obligationStatus({ ...base, nextDueOn: "2026-11-05" }).status).toBe("ok"); // 15 days
    expect(obligationStatus({ ...base, nextDueOn: "2026-11-04" })).toMatchObject({
      status: "soon",
      daysLeft: 14,
    });
    expect(obligationStatus({ ...base, nextDueOn: today }).status).toBe("due");
    expect(obligationStatus({ ...base, nextDueOn: "2026-10-20" })).toMatchObject({
      status: "overdue",
      daysLeft: -1,
    });
  });

  it("by km: soon within 1000 km, due at the target, overdue beyond", () => {
    const k = { ...base, currentKm: 90_000 };
    expect(obligationStatus({ ...k, nextDueKm: 95_000 }).status).toBe("ok");
    expect(obligationStatus({ ...k, nextDueKm: 90_800 })).toMatchObject({
      status: "soon",
      kmLeft: 800,
      trigger: "km",
    });
    expect(obligationStatus({ ...k, nextDueKm: 90_000 }).status).toBe("due");
    expect(obligationStatus({ ...k, nextDueKm: 89_900 }).status).toBe("overdue");
  });

  it("ignores a km target without an odometer reading", () => {
    expect(obligationStatus({ ...base, nextDueKm: 1000 }).status).toBe("ok");
  });

  it("takes whichever comes first", () => {
    const s = obligationStatus({
      ...base,
      nextDueOn: "2027-01-01",
      nextDueKm: 89_000,
      currentKm: 90_000,
    });
    expect(s).toMatchObject({ status: "overdue", trigger: "km" });
    const d = obligationStatus({
      ...base,
      nextDueOn: "2026-10-01",
      nextDueKm: 95_000,
      currentKm: 90_000,
    });
    expect(d).toMatchObject({ status: "overdue", trigger: "date" });
  });
});

describe("obligationReminderPlan", () => {
  const today = "2026-10-21";
  const base = { nextDueKm: null, leadDays: 14, today };

  it("sends nothing while ok", () => {
    expect(obligationReminderPlan({ ...base, nextDueOn: "2026-12-01" })).toMatchObject({
      stage: null,
      escalate: false,
    });
  });

  it("reminds the responsible person from lead days before, on the day too", () => {
    expect(obligationReminderPlan({ ...base, nextDueOn: "2026-11-04" }).stage).toBe("soon");
    expect(obligationReminderPlan({ ...base, nextDueOn: today }).stage).toBe("soon");
  });

  it("goes overdue the day after, escalates to the manager one day later", () => {
    expect(obligationReminderPlan({ ...base, nextDueOn: "2026-10-20" })).toMatchObject({
      stage: "overdue",
      escalate: false,
    });
    expect(obligationReminderPlan({ ...base, nextDueOn: "2026-10-19" })).toMatchObject({
      stage: "overdue",
      escalate: true,
    });
  });

  it("changes the dedupe key when the due date moves", () => {
    const a = obligationReminderPlan({ ...base, nextDueOn: "2026-10-20" });
    const b = obligationReminderPlan({ ...base, nextDueOn: "2027-10-20" });
    expect(obligationDedupeKey("x", "overdue", a.dueKey)).toBe("obligation:x:overdue:2026-10-20|-");
    expect(obligationDedupeKey("x", "overdue", b.dueKey)).not.toBe(
      obligationDedupeKey("x", "overdue", a.dueKey),
    );
  });
});

describe("huIntervalMonths", () => {
  const legal = { upTo3500: 24, over3500: 12 };
  it("uses the weight limit of 3.5 t inclusive", () => {
    expect(huIntervalMonths(3000, legal)).toBe(24);
    expect(huIntervalMonths(HU_WEIGHT_LIMIT_KG, legal)).toBe(24);
    expect(huIntervalMonths(3501, legal)).toBe(12);
    expect(huIntervalMonths(7500, legal)).toBe(12);
  });
  it("takes the shorter interval when the weight is unknown, null without legal data", () => {
    expect(huIntervalMonths(null, legal)).toBe(12);
    expect(huIntervalMonths(3000, { upTo3500: null, over3500: 12 })).toBeNull();
  });
});

describe("OBLIGATION_PRESETS", () => {
  it("has unique keys, and legal presets carry no fixed interval", () => {
    const keys = OBLIGATION_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of OBLIGATION_PRESETS.filter((x) => x.legal)) {
      expect(p.intervalMonths).toBeNull();
    }
    expect(OBLIGATION_PRESETS.find((p) => p.key === "kskReport")?.annualDate).toEqual({
      month: 3,
      day: 31,
    });
  });
});
