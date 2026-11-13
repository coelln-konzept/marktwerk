import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE,
  defaultSchedule,
  MAX_SCHEDULE_ROWS,
  parseSchedule,
  rowsForDay,
  type ScheduleRow,
  sameSchedule,
  scheduleFromTimes,
  scheduleSummary,
  sortSchedule,
  validateSchedule,
} from "./schedule";

const row = (
  audience: ScheduleRow["audience"],
  kind: ScheduleRow["kind"],
  day: ScheduleRow["day"],
  from: string,
  to: string,
): ScheduleRow => ({ audience, kind, day, from, to });

const setupFirst = row("vendors", "setup", "first", "06:00", "08:00");
const openEach = row("visitors", "open", "each", "08:00", "16:00");
const teardownLast = row("vendors", "teardown", "last", "16:00", "18:00");
const earlyTeardown = row("vendors", "teardown", "last", "07:00", "10:00");

describe("DEFAULT_SCHEDULE", () => {
  it("is the three rows of ADR 0022", () => {
    expect(defaultSchedule()).toEqual([setupFirst, openEach, teardownLast]);
  });

  it("is valid for single- and multi-day events", () => {
    expect(validateSchedule(DEFAULT_SCHEDULE, 1)).toEqual([]);
    expect(validateSchedule(DEFAULT_SCHEDULE, 3)).toEqual([]);
  });

  it("hands out copies that don't touch the constant", () => {
    const copy = defaultSchedule();
    (copy[0] as ScheduleRow).from = "05:00";
    expect(DEFAULT_SCHEDULE[0]?.from).toBe("06:00");
    expect(Object.isFrozen(DEFAULT_SCHEDULE[0])).toBe(true);
  });
});

describe("scheduleFromTimes", () => {
  it("migrates the usual times to the three default-shaped rows", () => {
    expect(
      scheduleFromTimes({ setup: "05:00", open: "08:00", close: "16:00", teardown: "18:00" }),
    ).toEqual([
      row("vendors", "setup", "first", "05:00", "08:00"),
      openEach,
      row("vendors", "teardown", "last", "16:00", "18:00"),
    ]);
  });

  it("leaves out windows of zero length", () => {
    expect(
      scheduleFromTimes({ setup: "08:00", open: "08:00", close: "16:00", teardown: "16:00" }),
    ).toEqual([openEach]);
  });

  it("turns a setup after opening (multi-day: set up the day before) into a before row", () => {
    expect(
      scheduleFromTimes({ setup: "14:00", open: "10:00", close: "18:00", teardown: "20:00" }),
    ).toEqual([
      row("vendors", "setup", "before", "14:00", "23:59"),
      row("visitors", "open", "each", "10:00", "18:00"),
      row("vendors", "teardown", "last", "18:00", "20:00"),
    ]);
  });

  it("falls back to the default value of each missing or malformed field", () => {
    expect(scheduleFromTimes(null)).toEqual(defaultSchedule());
    expect(scheduleFromTimes({})).toEqual(defaultSchedule());
    expect(scheduleFromTimes({ setup: "", open: "7:00", close: null, teardown: "24:00" })).toEqual(
      defaultSchedule(),
    );
    expect(scheduleFromTimes({ open: "10:00" })).toEqual([
      row("vendors", "setup", "first", "06:00", "10:00"),
      row("visitors", "open", "each", "10:00", "16:00"),
      teardownLast,
    ]);
  });

  it("uses the default opening hours if open/close don't form a window", () => {
    expect(
      scheduleFromTimes({ setup: "05:00", open: "17:00", close: "09:00", teardown: "19:00" }),
    ).toEqual([
      row("vendors", "setup", "first", "05:00", "08:00"),
      openEach,
      row("vendors", "teardown", "last", "16:00", "19:00"),
    ]);
  });

  it("always produces a valid Zeitplan", () => {
    const inputs = [
      { setup: "05:00", open: "08:00", close: "16:00", teardown: "18:00" },
      { setup: "14:00", open: "10:00", close: "18:00", teardown: "20:00" },
      { setup: "23:59", open: "10:00", close: "18:00", teardown: "18:00" },
      { open: "17:00", close: "09:00" },
      {},
    ];
    for (const input of inputs) expect(validateSchedule(scheduleFromTimes(input), 2)).toEqual([]);
  });
});

describe("validateSchedule", () => {
  it("rejects malformed times", () => {
    const issues = validateSchedule(
      [
        openEach,
        row("vendors", "setup", "first", "7:00", "08:00"),
        row("vendors", "teardown", "last", "16:00", "24:00"),
        row("team", "setup", "first", "06:00", ""),
      ],
      1,
    );
    expect(issues).toEqual([
      { code: "invalid_time", row: 1 },
      { code: "invalid_time", row: 2 },
      { code: "invalid_time", row: 3 },
    ]);
  });

  it("rejects unknown audience, kind or day (rows read from JSON)", () => {
    const bad = { ...openEach, audience: "customers" } as unknown as ScheduleRow;
    const badDay = { ...setupFirst, day: "second" } as unknown as ScheduleRow;
    expect(validateSchedule([openEach, bad, badDay], 2)).toEqual([
      { code: "invalid_row", row: 1 },
      { code: "invalid_row", row: 2 },
    ]);
  });

  it("needs from before to", () => {
    expect(
      validateSchedule([openEach, row("vendors", "setup", "first", "08:00", "08:00")], 1),
    ).toEqual([{ code: "from_not_before_to", row: 1 }]);
    expect(
      validateSchedule([openEach, row("vendors", "setup", "first", "09:00", "08:00")], 1),
    ).toEqual([{ code: "from_not_before_to", row: 1 }]);
  });

  it("needs visitor hours", () => {
    expect(validateSchedule([setupFirst, teardownLast], 1)).toEqual([
      { code: "no_visitor_hours", row: null },
    ]);
    expect(validateSchedule([], 2)).toEqual([{ code: "no_visitor_hours", row: null }]);
    expect(
      validateSchedule([row("team", "open", "each", "08:00", "16:00")], 1).map((i) => i.code),
    ).toEqual(["no_visitor_hours"]);
  });

  it("allows the day before only for setup", () => {
    const teamBefore = row("team", "setup", "before", "16:00", "20:00");
    expect(validateSchedule([teamBefore, openEach], 1)).toEqual([]);
    expect(validateSchedule([teamBefore, openEach], 3)).toEqual([]);
    expect(
      validateSchedule([openEach, row("visitors", "open", "before", "18:00", "22:00")], 2),
    ).toEqual([{ code: "before_not_setup", row: 1 }]);
    expect(
      validateSchedule([openEach, row("vendors", "teardown", "before", "18:00", "20:00")], 2),
    ).toEqual([{ code: "before_not_setup", row: 1 }]);
  });

  it("accepts first/each/last on a single-day event (all mean that day)", () => {
    expect(
      validateSchedule(
        [
          row("visitors", "open", "first", "10:00", "17:00"),
          row("team", "teardown", "each", "17:00", "19:00"),
        ],
        1,
      ),
    ).toEqual([]);
  });

  it("accepts the early tear-down on the last morning of a multi-day event", () => {
    expect(validateSchedule([setupFirst, openEach, earlyTeardown, teardownLast], 2)).toEqual([]);
  });

  it("flags a tear-down before opening on a single-day event", () => {
    expect(validateSchedule([setupFirst, openEach, earlyTeardown, teardownLast], 1)).toEqual([
      { code: "teardown_before_open", row: 2 },
    ]);
    // Also on day "first"/"each", and against the day's earliest opening.
    expect(
      validateSchedule(
        [
          row("visitors", "open", "first", "10:00", "16:00"),
          row("team", "teardown", "each", "09:00", "11:00"),
        ],
        1,
      ),
    ).toEqual([{ code: "teardown_before_open", row: 1 }]);
    // Starting at or after opening is the user's call (e.g. a stand leaving early).
    expect(
      validateSchedule([openEach, row("vendors", "teardown", "last", "08:00", "09:00")], 1),
    ).toEqual([]);
    expect(
      validateSchedule([openEach, row("vendors", "teardown", "last", "12:00", "14:00")], 1),
    ).toEqual([]);
  });

  it("flags identical rows after the first", () => {
    expect(
      validateSchedule([setupFirst, openEach, { ...setupFirst }, { ...setupFirst }], 1),
    ).toEqual([
      { code: "duplicate_row", row: 2 },
      { code: "duplicate_row", row: 3 },
    ]);
    // Same window for another audience or day is fine.
    expect(
      validateSchedule([setupFirst, { ...setupFirst, audience: "team" }, openEach], 1),
    ).toEqual([]);
  });

  it("reports at most one issue per row", () => {
    expect(
      validateSchedule([openEach, row("visitors", "open", "before", "24:00", "08:00")], 2),
    ).toEqual([{ code: "invalid_time", row: 1 }]);
  });

  it("refuses a nonsense duration", () => {
    expect(() => validateSchedule([openEach], 0)).toThrow(RangeError);
    expect(() => validateSchedule([openEach], 1.5)).toThrow(RangeError);
  });
});

describe("sortSchedule", () => {
  it("sorts by day, then from, without mutating the input", () => {
    const rows = [
      teardownLast,
      openEach,
      earlyTeardown,
      row("team", "setup", "before", "18:00", "21:00"),
      setupFirst,
    ];
    const before = [...rows];
    expect(sortSchedule(rows)).toEqual([
      row("team", "setup", "before", "18:00", "21:00"),
      setupFirst,
      openEach,
      earlyTeardown,
      teardownLast,
    ]);
    expect(rows).toEqual(before);
  });

  it("breaks ties by to, kind and audience", () => {
    const a = row("vendors", "setup", "first", "06:00", "08:00");
    const b = row("team", "setup", "first", "06:00", "08:00");
    const c = row("team", "setup", "first", "06:00", "07:00");
    expect(sortSchedule([a, b, c])).toEqual([c, b, a]);
  });
});

describe("rowsForDay", () => {
  const rows = [
    row("team", "setup", "before", "16:00", "20:00"),
    setupFirst,
    openEach,
    earlyTeardown,
    teardownLast,
  ];

  it("gives a multi-day event's rows per day", () => {
    expect(rowsForDay(rows, -1, 3)).toEqual([row("team", "setup", "before", "16:00", "20:00")]);
    expect(rowsForDay(rows, 0, 3)).toEqual([setupFirst, openEach]);
    expect(rowsForDay(rows, 1, 3)).toEqual([openEach]);
    expect(rowsForDay(rows, 2, 3)).toEqual([earlyTeardown, openEach, teardownLast]);
  });

  it("puts first, each and last on the one day of a single-day event", () => {
    expect(rowsForDay(DEFAULT_SCHEDULE, 0, 1)).toEqual(defaultSchedule());
    expect(rowsForDay(DEFAULT_SCHEDULE, -1, 1)).toEqual([]);
  });

  it("puts first and last on different days of a two-day event", () => {
    expect(rowsForDay(DEFAULT_SCHEDULE, 0, 2)).toEqual([setupFirst, openEach]);
    expect(rowsForDay(DEFAULT_SCHEDULE, 1, 2)).toEqual([openEach, teardownLast]);
  });

  it("has nothing outside the event", () => {
    expect(rowsForDay(rows, -2, 3)).toEqual([]);
    expect(rowsForDay(rows, 3, 3)).toEqual([]);
    expect(rowsForDay(rows, 0.5, 3)).toEqual([]);
  });
});

describe("scheduleSummary", () => {
  it("summarises the default Zeitplan", () => {
    expect(scheduleSummary(DEFAULT_SCHEDULE)).toEqual({
      open: { from: "08:00", to: "16:00" },
      earliestSetup: "06:00",
      earliestSetupDay: "first",
    });
  });

  it("spans split opening hours and ignores the early tear-down", () => {
    expect(
      scheduleSummary([
        row("visitors", "open", "each", "13:00", "18:00"),
        row("visitors", "open", "each", "09:00", "12:00"),
        earlyTeardown,
        row("vendors", "setup", "first", "07:00", "09:00"),
        row("vendors", "setup", "first", "05:30", "07:00"),
      ]),
    ).toEqual({
      open: { from: "09:00", to: "18:00" },
      earliestSetup: "05:30",
      earliestSetupDay: "first",
    });
  });

  it("uses the first day's hours over the last day's", () => {
    expect(
      scheduleSummary([
        row("visitors", "open", "last", "10:00", "14:00"),
        row("visitors", "open", "first", "11:00", "17:00"),
      ]).open,
    ).toEqual({ from: "11:00", to: "17:00" });
    expect(scheduleSummary([row("visitors", "open", "last", "10:00", "14:00")]).open).toEqual({
      from: "10:00",
      to: "14:00",
    });
  });

  it("takes the earliest setup by day first, and only the vendors'", () => {
    expect(
      scheduleSummary([
        openEach,
        setupFirst,
        row("vendors", "setup", "before", "18:00", "21:00"),
        row("team", "setup", "before", "15:00", "21:00"),
      ]),
    ).toMatchObject({ earliestSetup: "18:00", earliestSetupDay: "before" });
  });

  it("is empty without visitor hours or setup, and ignores malformed rows", () => {
    expect(scheduleSummary([])).toEqual({
      open: null,
      earliestSetup: null,
      earliestSetupDay: null,
    });
    expect(
      scheduleSummary([
        row("visitors", "open", "each", "7:00", "16:00"),
        row("vendors", "setup", "first", "06:00", "24:00"),
      ]),
    ).toEqual({ open: null, earliestSetup: null, earliestSetupDay: null });
  });
});

describe("parseSchedule", () => {
  it("keeps exactly the five fields and normalises typed times", () => {
    expect(
      parseSchedule([
        { audience: "vendors", kind: "setup", day: "first", from: "6", to: "8.30", extra: 1 },
      ]),
    ).toEqual([row("vendors", "setup", "first", "06:00", "08:30")]);
  });

  it("leaves unknown values for validateSchedule", () => {
    const parsed = parseSchedule([
      { audience: "press", kind: "open", day: "each", from: "x", to: "16:00" },
    ]);
    expect(parsed).toEqual([
      { audience: "press", kind: "open", day: "each", from: "x", to: "16:00" },
    ]);
    expect(validateSchedule(parsed ?? [], 1).map((i) => i.code)).toEqual([
      "invalid_row",
      "no_visitor_hours",
    ]);
  });

  it("rejects anything that isn't a short list of rows with string fields", () => {
    expect(parseSchedule(null)).toBeNull();
    expect(parseSchedule({})).toBeNull();
    expect(parseSchedule([null])).toBeNull();
    expect(parseSchedule([{ ...openEach, from: 8 }])).toBeNull();
    expect(parseSchedule(Array.from({ length: MAX_SCHEDULE_ROWS + 1 }, () => openEach))).toBeNull();
    expect(parseSchedule([])).toEqual([]);
  });
});

describe("sameSchedule", () => {
  it("compares rows field by field, in order", () => {
    expect(sameSchedule(defaultSchedule(), defaultSchedule())).toBe(true);
    expect(sameSchedule([setupFirst, openEach], [openEach, setupFirst])).toBe(false);
    expect(sameSchedule([openEach], [{ ...openEach, to: "17:00" }])).toBe(false);
    expect(sameSchedule([openEach], [openEach, teardownLast])).toBe(false);
  });
});
