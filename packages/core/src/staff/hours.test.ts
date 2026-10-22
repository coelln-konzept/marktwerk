import { describe, expect, it } from "vitest";
import {
  addMonthsToMonth,
  type ContractTerms,
  checkContractTerms,
  contractOn,
  findOverlappingContract,
  minijobHistory,
  minijobStatusOf,
  monthEnd,
  monthStart,
  PAYROLL_CSV_HEADER,
  payrollCsv,
  payrollDeadline,
  payrollMonthToClose,
  payrollReminderStage,
  payrollRemindFrom,
  personMonth,
  UTF8_BOM,
  yearToDateCents,
} from "./hours";
import type { ShiftTimesInput } from "./worktime";

const terms = (patch: Partial<ContractTerms> = {}): ContractTerms => ({
  type: "minijob",
  hourlyRateCents: 1390,
  contractedHoursPerWeek: 10,
  fixedMonthlyPayCents: null,
  workingTimeAccount: false,
  otherMinijobDeclared: false,
  validFrom: "2026-01-01",
  validUntil: null,
  ...patch,
});

const worked = (
  workDate: string,
  start: string,
  end: string,
  breakMinutes = 0,
): ShiftTimesInput => ({
  workDate,
  status: "worked",
  plannedStart: start,
  plannedEnd: end,
  actualStart: start,
  actualEnd: end,
  breakMinutes,
});

describe("months", () => {
  it("normalises and walks months, across years", () => {
    expect(monthStart("2026-05-17")).toBe("2026-05-01");
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(addMonthsToMonth("2026-01-15", -1)).toBe("2025-12-01");
    expect(addMonthsToMonth("2026-11-01", 3)).toBe("2027-02-01");
    expect(addMonthsToMonth("2026-05-01", -11)).toBe("2025-06-01");
  });
});

describe("checkContractTerms", () => {
  it("accepts a complete Minijob contract", () => {
    expect(checkContractTerms(terms())).toBeNull();
  });

  it("requires contracted hours (no §12 TzBfG fiction), except for freelancers", () => {
    expect(checkContractTerms(terms({ contractedHoursPerWeek: null }))).toBe("hours_required");
    expect(
      checkContractTerms(terms({ type: "freelance", contractedHoursPerWeek: null })),
    ).toBeNull();
  });

  it("requires an hourly rate for a Minijob and some pay for everyone", () => {
    expect(checkContractTerms(terms({ hourlyRateCents: null, fixedMonthlyPayCents: 60_300 }))).toBe(
      "rate_required",
    );
    expect(
      checkContractTerms(
        terms({ type: "full_time", hourlyRateCents: null, fixedMonthlyPayCents: 300_000 }),
      ),
    ).toBeNull();
    expect(checkContractTerms(terms({ type: "full_time", hourlyRateCents: null }))).toBe(
      "rate_required",
    );
  });

  it("a working-time account needs a fixed pay", () => {
    expect(checkContractTerms(terms({ workingTimeAccount: true }))).toBe("fixed_pay_required");
    expect(
      checkContractTerms(terms({ workingTimeAccount: true, fixedMonthlyPayCents: 60_300 })),
    ).toBeNull();
  });

  it("validates dates and amounts", () => {
    expect(checkContractTerms(terms({ validUntil: "2025-12-31" }))).toBe("invalid_dates");
    expect(checkContractTerms(terms({ validFrom: "2026-02-30" }))).toBe("invalid_dates");
    expect(checkContractTerms(terms({ hourlyRateCents: 0 }))).toBe("invalid_amount");
    expect(checkContractTerms(terms({ hourlyRateCents: 13.9 }))).toBe("invalid_amount");
    expect(checkContractTerms(terms({ contractedHoursPerWeek: 200 }))).toBe("invalid_amount");
  });
});

describe("contract periods", () => {
  const a = { id: "a", validFrom: "2026-01-01", validUntil: "2026-06-30" };
  const b = { id: "b", validFrom: "2026-07-01", validUntil: null };

  it("finds overlaps, treating an open end as unlimited and touching days as overlap", () => {
    expect(findOverlappingContract({ validFrom: "2026-07-01", validUntil: null }, [a])).toBeNull();
    expect(findOverlappingContract({ validFrom: "2026-06-30", validUntil: null }, [a])?.id).toBe(
      "a",
    );
    expect(findOverlappingContract({ validFrom: "2027-01-01", validUntil: null }, [b])?.id).toBe(
      "b",
    );
    expect(
      findOverlappingContract({ validFrom: "2025-01-01", validUntil: "2025-12-31" }, [a, b]),
    ).toBeNull();
  });

  it("ignores the contract being edited", () => {
    expect(
      findOverlappingContract({ id: "a", validFrom: "2026-01-01", validUntil: "2026-12-31" }, [a]),
    ).toBeNull();
  });

  it("picks the contract valid on a day", () => {
    expect(contractOn([a, b], "2026-06-30")?.id).toBe("a");
    expect(contractOn([a, b], "2026-07-01")?.id).toBe("b");
    expect(contractOn([a, b], "2025-12-31")).toBeNull();
  });
});

describe("personMonth", () => {
  it("sums hours per day and pays hours × rate", () => {
    const m = personMonth({
      month: "2026-05-01",
      contracts: [terms()],
      shifts: [
        worked("2026-05-02", "08:00", "16:30", 30), // 8 h
        worked("2026-05-09", "09:00", "13:00"), // 4 h
        worked("2026-06-01", "09:00", "13:00"), // other month
      ],
    });
    expect(m.workedMinutes).toBe(12 * 60);
    expect(m.dayMinutes).toEqual({ "2026-05-02": 480, "2026-05-09": 240 });
    expect(m.grossCents).toBe(16_680); // 12 h × 13,90 €
    expect(m.contractType).toBe("minijob");
    expect(m.lastRateCents).toBe(1390);
  });

  it("keeps planned hours apart and counts them in the total", () => {
    const m = personMonth({
      month: "2026-05-01",
      contracts: [terms()],
      shifts: [
        worked("2026-05-02", "08:00", "12:00"),
        {
          workDate: "2026-05-30",
          status: "confirmed",
          plannedStart: "08:00",
          plannedEnd: "12:00",
          actualStart: null,
          actualEnd: null,
          breakMinutes: 0,
        },
      ],
    });
    expect(m.workedMinutes).toBe(240);
    expect(m.plannedMinutes).toBe(240);
    expect(m.totalMinutes).toBe(480);
  });

  it("uses the rate that was valid on the work day (dated rates), rounding once per rate", () => {
    const m = personMonth({
      month: "2026-05-01",
      contracts: [
        terms({ validFrom: "2026-01-01", validUntil: "2026-05-14", hourlyRateCents: 1390 }),
        terms({ validFrom: "2026-05-15", validUntil: null, hourlyRateCents: 1500 }),
      ],
      shifts: [worked("2026-05-14", "08:00", "12:00"), worked("2026-05-15", "08:00", "12:00")],
    });
    expect(m.rates).toEqual([
      { rateCents: 1390, minutes: 240 },
      { rateCents: 1500, minutes: 240 },
    ]);
    expect(m.grossCents).toBe(5560 + 6000);
    expect(m.lastRateCents).toBe(1500);
  });

  it("rounds a rate bucket once, not shift by shift", () => {
    // 7 shifts of 20 min at 13,90 € = 140 min -> 32,43 €, not 7 × 4,63 = 32,41 €
    const shifts = Array.from({ length: 7 }, (_, i) =>
      worked(`2026-05-0${i + 1}`, "08:00", "08:20"),
    );
    const m = personMonth({ month: "2026-05-01", contracts: [terms()], shifts });
    expect(m.grossCents).toBe(Math.round((140 * 1390) / 60));
  });

  it("pays a fixed monthly pay (working-time account) whatever the hours", () => {
    const m = personMonth({
      month: "2026-05-01",
      contracts: [terms({ fixedMonthlyPayCents: 60_300, workingTimeAccount: true })],
      shifts: [worked("2026-05-02", "08:00", "18:00", 45)],
    });
    expect(m.fixedPayCents).toBe(60_300);
    expect(m.hourlyPayCents).toBe(0);
    expect(m.grossCents).toBe(60_300);
    expect(m.workedMinutes).toBe(555);
  });

  it("pays a salary even without shifts and reports no work minutes", () => {
    const m = personMonth({
      month: "2026-05-01",
      contracts: [
        terms({ type: "full_time", hourlyRateCents: null, fixedMonthlyPayCents: 320_000 }),
      ],
      shifts: [],
    });
    expect(m.grossCents).toBe(320_000);
    expect(m.contractType).toBe("full_time");
  });

  it("reports minutes on days without a contract", () => {
    const m = personMonth({
      month: "2026-05-01",
      contracts: [terms({ validFrom: "2026-05-10" })],
      shifts: [worked("2026-05-02", "08:00", "12:00"), worked("2026-05-12", "08:00", "12:00")],
    });
    expect(m.uncoveredMinutes).toBe(240);
    expect(m.grossCents).toBe(5560);
  });

  it("handles a past-midnight shift on the last day of the month", () => {
    const m = personMonth({
      month: "2026-05-01",
      contracts: [terms()],
      shifts: [worked("2026-05-31", "22:00", "06:00", 30)],
    });
    // Belongs to May 31st, all 7.5 h are May hours.
    expect(m.dayMinutes).toEqual({ "2026-05-31": 450 });
  });

  it("flags a declared other Minijob", () => {
    const m = personMonth({
      month: "2026-05-01",
      contracts: [terms({ otherMinijobDeclared: true })],
      shifts: [],
    });
    expect(m.otherMinijobDeclared).toBe(true);
  });
});

describe("Minijob history", () => {
  const limit = (m: string) => (m >= "2027-01-01" ? 63_300 : 60_300);

  it("counts overrun months and earnings in the 11 months before", () => {
    const earned = new Map([
      ["2026-01", 61_000], // over
      ["2026-02", 40_000],
      ["2026-03", 70_000], // over
      ["2025-05", 99_999], // 12 months back: outside
      ["2026-06", 55_000], // the month itself: outside
    ]);
    const h = minijobHistory("2026-06-01", earned, limit);
    expect(h).toEqual({ previousOverrunMonths: 2, previousElevenMonthsCents: 171_000 });
  });

  it("measures each past month against the limit valid then", () => {
    const earned = new Map([
      ["2026-12", 61_000], // over the 2026 limit
      ["2027-01", 62_000], // under the 2027 limit
    ]);
    expect(minijobHistory("2027-02-01", earned, limit).previousOverrunMonths).toBe(1);
  });

  it("adds up the calendar year to date", () => {
    const earned = new Map([
      ["2025-12", 50_000],
      ["2026-01", 10_000],
      ["2026-03", 20_000],
      ["2026-09", 99_000],
    ]);
    expect(yearToDateCents("2026-03-01", earned)).toBe(30_000);
  });

  it("feeds the Minijob status: third overrun month is red", () => {
    const month = personMonth({
      month: "2026-06-01",
      contracts: [terms()],
      shifts: Array.from({ length: 10 }, (_, i) =>
        worked(`2026-06-${String(i + 1).padStart(2, "0")}`, "08:00", "13:00"),
      ),
    }); // 50 h × 13,90 = 695 €
    const params = { limitCents: 60_300, overrunCeilingFactor: 2, maxOverrunMonths: 2 };
    const first = minijobStatusOf(
      month,
      { previousOverrunMonths: 0, previousElevenMonthsCents: 0 },
      params,
    );
    expect(first.level).toBe("amber");
    const third = minijobStatusOf(
      month,
      { previousOverrunMonths: 2, previousElevenMonthsCents: 0 },
      params,
    );
    expect(third.level).toBe("red");
    expect(third.reasons).toContain("too_many_overrun_months");
  });

  it("uses fixed pay for the Minijob limit", () => {
    const month = personMonth({
      month: "2026-06-01",
      contracts: [terms({ fixedMonthlyPayCents: 60_300, workingTimeAccount: true })],
      shifts: [],
    });
    const status = minijobStatusOf(
      month,
      { previousOverrunMonths: 0, previousElevenMonthsCents: 0 },
      { limitCents: 60_300, overrunCeilingFactor: 2, maxOverrunMonths: 2 },
    );
    expect(status.level).toBe("ok");
    expect(status.earnedCents).toBe(60_300);
  });
});

describe("month close dates", () => {
  it("closes the previous month; deadline is the 15th of the following month", () => {
    expect(payrollMonthToClose("2026-06-12")).toBe("2026-05-01");
    expect(payrollMonthToClose("2026-01-03")).toBe("2025-12-01");
    expect(payrollDeadline("2026-05-01")).toBe("2026-06-15");
    expect(payrollDeadline("2026-12-01")).toBe("2027-01-15");
    expect(payrollRemindFrom("2026-05-01")).toBe("2026-06-12");
  });

  it("reminds from the 12th, is due on the 15th and overdue after", () => {
    expect(payrollReminderStage("2026-06-11")).toBe("none");
    expect(payrollReminderStage("2026-06-12")).toBe("remind");
    expect(payrollReminderStage("2026-06-14")).toBe("remind");
    expect(payrollReminderStage("2026-06-15")).toBe("due");
    expect(payrollReminderStage("2026-06-16")).toBe("overdue");
  });
});

describe("payrollCsv", () => {
  it("writes German Excel CSV: BOM, semicolons, decimal commas, one row per person", () => {
    const csv = payrollCsv([
      {
        name: "Dieter Krause",
        contractType: "minijob",
        workedMinutes: 44 * 60 + 30,
        hourlyRateCents: 1400,
        grossCents: 62_300,
        justification: "Krankheitsvertretung So 26.04.",
      },
      {
        name: "Anna Bauer",
        contractType: "full_time",
        workedMinutes: 160 * 60,
        hourlyRateCents: null,
        grossCents: 320_000,
        justification: null,
      },
    ]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.slice(1)).toBe(
      [
        PAYROLL_CSV_HEADER,
        "Anna Bauer;Vollzeit;160,00;;3200,00;",
        "Dieter Krause;Minijob;44,50;14,00;623,00;Krankheitsvertretung So 26.04.",
        "",
      ].join("\r\n"),
    );
  });

  it("quotes cells with separators or quotes and defuses formulas", () => {
    const csv = payrollCsv([
      {
        name: '=HYPERLINK("x")',
        contractType: null,
        workedMinutes: 0,
        hourlyRateCents: null,
        grossCents: 0,
        justification: 'Vertretung; "kurzfristig"\nkrank',
      },
    ]);
    const line = csv.split("\r\n")[1];
    expect(line).toBe('"\'=HYPERLINK(""x"")";;0,00;;0,00;"Vertretung; ""kurzfristig""\nkrank"');
  });
});
