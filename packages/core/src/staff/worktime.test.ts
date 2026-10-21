import { describe, expect, it } from "vitest";
import {
  ARBZG_STATUTORY_LIMITS,
  checkWorkingTime,
  clockToMinutes,
  effectiveSpan,
  minutesToClock,
  recordingAlertDate,
  recordingDeadline,
  recordingState,
  requiredBreakMinutes,
  type ShiftTimesInput,
  shiftLength,
  shiftWork,
} from "./worktime";

const span = (workDate: string, start: string, end: string, breakMinutes = 0) => ({
  workDate,
  start,
  end,
  breakMinutes,
});

describe("clock helpers", () => {
  it("parses HH:mm and HH:mm:ss, rejects the rest", () => {
    expect(clockToMinutes("08:30")).toBe(510);
    expect(clockToMinutes("08:30:00")).toBe(510);
    expect(clockToMinutes("24:00")).toBeNull();
    expect(clockToMinutes("8:30")).toBeNull();
    expect(clockToMinutes(null)).toBeNull();
  });

  it("formats minutes as HH:mm", () => {
    expect(minutesToClock(510)).toBe("08:30");
    expect(minutesToClock(1450)).toBe("00:10");
  });
});

describe("shiftLength", () => {
  it("subtracts the break", () => {
    expect(shiftLength(span("2026-05-16", "08:00", "16:30", 30))).toEqual({
      grossMinutes: 510,
      netMinutes: 480,
      endsNextDay: false,
    });
  });

  it("handles shifts past midnight", () => {
    expect(shiftLength(span("2026-05-16", "22:00", "06:00", 30))).toEqual({
      grossMinutes: 480,
      netMinutes: 450,
      endsNextDay: true,
    });
  });

  it("treats start = end as an empty shift, not 24 hours", () => {
    expect(shiftLength(span("2026-05-16", "08:00", "08:00"))?.netMinutes).toBe(0);
  });

  it("never goes below zero when the break is longer than the shift", () => {
    expect(shiftLength(span("2026-05-16", "08:00", "08:20", 45))?.netMinutes).toBe(0);
  });

  it("returns null for invalid times", () => {
    expect(shiftLength(span("2026-05-16", "8", "16:00"))).toBeNull();
  });

  describe("daylight saving time (Europe/Berlin)", () => {
    it("the night into the last Sunday of March is one hour shorter", () => {
      // 2026-03-29: 02:00 -> 03:00
      expect(shiftLength(span("2026-03-28", "22:00", "06:00"))?.grossMinutes).toBe(7 * 60);
    });

    it("the night into the last Sunday of October is one hour longer", () => {
      // 2026-10-25: 03:00 -> 02:00
      expect(shiftLength(span("2026-10-24", "22:00", "06:00"))?.grossMinutes).toBe(9 * 60);
    });

    it("a day shift on the switch day is unaffected when it is after the switch", () => {
      expect(shiftLength(span("2026-03-29", "08:00", "16:00"))?.grossMinutes).toBe(8 * 60);
      expect(shiftLength(span("2026-10-25", "08:00", "16:00"))?.grossMinutes).toBe(8 * 60);
    });

    it("a shift across the switch hour itself counts real elapsed time", () => {
      // 2026-03-29 01:00 -> 04:00 clock = 2 h elapsed
      expect(shiftLength(span("2026-03-29", "01:00", "04:00"))?.grossMinutes).toBe(120);
      // 2026-10-25 01:00 -> 04:00 clock = 4 h elapsed
      expect(shiftLength(span("2026-10-25", "01:00", "04:00"))?.grossMinutes).toBe(240);
    });
  });
});

describe("shiftWork", () => {
  const base: ShiftTimesInput = {
    workDate: "2026-05-16",
    status: "worked",
    plannedStart: "08:00",
    plannedEnd: "16:00",
    actualStart: null,
    actualEnd: null,
    breakMinutes: 30,
  };

  it("counts actual times as worked", () => {
    expect(shiftWork({ ...base, actualStart: "08:15:00", actualEnd: "17:15:00" })).toEqual({
      workedMinutes: 510,
      plannedMinutes: 0,
    });
  });

  it("counts planned times as planned while nothing is recorded", () => {
    expect(shiftWork({ ...base, status: "confirmed" })).toEqual({
      workedMinutes: 0,
      plannedMinutes: 450,
    });
  });

  it("ignores declined, cancelled and no-show shifts", () => {
    for (const status of ["declined", "cancelled", "no_show"] as const) {
      expect(shiftWork({ ...base, status, actualStart: "08:00", actualEnd: "16:00" })).toEqual({
        workedMinutes: 0,
        plannedMinutes: 0,
      });
    }
  });

  it("uses a half-recorded shift's planned times", () => {
    expect(effectiveSpan({ ...base, actualStart: "08:00" })?.source).toBe("planned");
  });
});

describe("requiredBreakMinutes", () => {
  it("is 0 up to 6 h, 30 min above 6 h, 45 min above 9 h", () => {
    expect(requiredBreakMinutes(360)).toBe(0);
    expect(requiredBreakMinutes(361)).toBe(30);
    expect(requiredBreakMinutes(540)).toBe(30);
    expect(requiredBreakMinutes(541)).toBe(45);
  });
});

describe("checkWorkingTime", () => {
  it("warns about more than 10 hours a day, summing shifts of one day", () => {
    const warnings = checkWorkingTime([
      span("2026-05-16", "05:00", "11:00", 30),
      span("2026-05-16", "13:00", "20:00", 45),
    ]);
    expect(warnings).toContainEqual({
      code: "daily_max",
      date: "2026-05-16",
      minutes: 330 + 375,
      limit: 600,
    });
  });

  it("does not warn at exactly 10 hours", () => {
    const warnings = checkWorkingTime([span("2026-05-16", "06:00", "16:45", 45)]);
    expect(warnings.filter((w) => w.code === "daily_max")).toEqual([]);
  });

  it("warns about less than 11 hours rest between two days", () => {
    const warnings = checkWorkingTime([
      span("2026-05-16", "14:00", "23:00", 45),
      span("2026-05-17", "07:00", "12:00"),
    ]);
    expect(warnings).toContainEqual({
      code: "rest_period",
      date: "2026-05-17",
      previousDate: "2026-05-16",
      restMinutes: 480,
      limit: 660,
    });
  });

  it("counts the rest from the end of a past-midnight shift", () => {
    const warnings = checkWorkingTime([
      span("2026-05-16", "18:00", "02:00", 30),
      span("2026-05-17", "09:00", "13:00"),
    ]);
    expect(warnings.find((w) => w.code === "rest_period")).toMatchObject({ restMinutes: 420 });
  });

  it("accepts exactly 11 hours of rest", () => {
    const warnings = checkWorkingTime([
      span("2026-05-16", "10:00", "19:00", 45),
      span("2026-05-17", "06:00", "10:00"),
    ]);
    expect(warnings.filter((w) => w.code === "rest_period")).toEqual([]);
  });

  it("treats a gap inside one day as a break, not a rest period", () => {
    const warnings = checkWorkingTime([
      span("2026-05-16", "06:00", "10:00"),
      span("2026-05-16", "13:00", "17:00"),
    ]);
    expect(warnings).toEqual([]);
  });

  it("flags overlapping shifts", () => {
    const warnings = checkWorkingTime([
      span("2026-05-16", "08:00", "12:00"),
      span("2026-05-16", "11:00", "15:00"),
    ]);
    expect(warnings.some((w) => w.code === "overlap")).toBe(true);
  });

  it("flags a missing break above 6 h and accepts a sufficient one", () => {
    const missing = checkWorkingTime([span("2026-05-16", "08:00", "15:00")]);
    expect(missing).toContainEqual({
      code: "break_missing",
      date: "2026-05-16",
      required: 30,
      actual: 0,
    });
    expect(checkWorkingTime([span("2026-05-16", "08:00", "15:00", 30)])).toEqual([]);
    // 9 h 30 min of work needs 45 min, 30 are not enough.
    const short = checkWorkingTime([span("2026-05-16", "08:00", "18:00", 30)]);
    expect(short).toContainEqual({
      code: "break_missing",
      date: "2026-05-16",
      required: 45,
      actual: 30,
    });
  });

  it("uses the limits passed in", () => {
    const strict = { ...ARBZG_STATUTORY_LIMITS, maxDailyMinutes: 480 };
    const warnings = checkWorkingTime([span("2026-05-16", "08:00", "17:30", 60)], strict);
    expect(warnings.some((w) => w.code === "daily_max")).toBe(true);
    expect(checkWorkingTime([span("2026-05-16", "08:00", "17:30", 60)])).toEqual([]);
  });

  it("sees the night shift on the DST night as shorter for the rest period", () => {
    // Shift ends 2026-03-29 06:00 (real 7 h after start); next shift starts 17:00 -> 11 h rest.
    const warnings = checkWorkingTime([
      span("2026-03-28", "22:00", "06:00", 30),
      span("2026-03-29", "17:00", "20:00"),
    ]);
    expect(warnings.filter((w) => w.code === "rest_period")).toEqual([]);
    const tight = checkWorkingTime([
      span("2026-03-28", "22:00", "06:00", 30),
      span("2026-03-29", "16:30", "20:00"),
    ]);
    expect(tight.find((w) => w.code === "rest_period")).toMatchObject({ restMinutes: 630 });
  });
});

describe("§17 MiLoG recording", () => {
  it("sets the deadline 7 days after the work day and the alert at day 5", () => {
    expect(recordingDeadline("2026-05-10")).toBe("2026-05-17");
    expect(recordingAlertDate("2026-05-10")).toBe("2026-05-15");
    expect(recordingDeadline("2026-01-28")).toBe("2026-02-04");
  });

  it("walks through the states", () => {
    const at = (today: string, hasActualTimes = false) =>
      recordingState({ workDate: "2026-05-10", hasActualTimes, today });
    expect(at("2026-05-10")).toBe("not_due");
    expect(at("2026-05-11")).toBe("pending");
    expect(at("2026-05-14")).toBe("pending");
    expect(at("2026-05-15")).toBe("alert");
    expect(at("2026-05-17")).toBe("alert");
    expect(at("2026-05-18")).toBe("overdue");
    expect(at("2026-05-18", true)).toBe("recorded");
  });
});
