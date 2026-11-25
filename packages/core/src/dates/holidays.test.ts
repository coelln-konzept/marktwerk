import { describe, expect, it } from "vitest";
import {
  easterSunday,
  firstAdvent,
  holidaysBetween,
  holidayWeekends,
  holidayWeekendsBetween,
  isQuietHoliday,
  publicHolidays,
  quietObservances,
} from "./holidays";

describe("NRW public holidays", () => {
  it("computes Easter Sunday", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25"); // latest possible
  });

  it("computes Easter Sunday over many years, including both extremes and century years", () => {
    const known: Record<number, string> = {
      1818: "1818-03-22", // earliest possible
      1943: "1943-04-25", // latest possible
      2000: "2000-04-23",
      2008: "2008-03-23",
      2011: "2011-04-24",
      2019: "2019-04-21",
      2025: "2025-04-20",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
      2035: "2035-03-25",
      2100: "2100-03-28",
      2285: "2285-03-22", // earliest again
    };
    for (const [year, date] of Object.entries(known)) expect(easterSunday(Number(year))).toBe(date);
  });

  it("lists the movable and fixed holidays for 2026", () => {
    const byKey = Object.fromEntries(publicHolidays(2026).map((h) => [h.key, h.date]));
    expect(byKey).toMatchObject({
      good_friday: "2026-04-03",
      easter_monday: "2026-04-06",
      ascension: "2026-05-14",
      whit_monday: "2026-05-25",
      corpus_christi: "2026-06-04",
      all_saints: "2026-11-01",
    });
    expect(publicHolidays(2026).filter((h) => h.statutory)).toHaveLength(11);
  });

  it("marks Easter and Whit Sunday for planning, but not as statutory days", () => {
    const whitSunday = publicHolidays(2026).find((h) => h.key === "whit_sunday");
    expect(whitSunday).toMatchObject({ date: "2026-05-24", statutory: false });
  });

  it("collects holidays over a range spanning years", () => {
    const range = holidaysBetween("2026-12-20", "2027-01-10");
    expect([...range.keys()]).toEqual(["2026-12-25", "2026-12-26", "2027-01-01"]);
  });

  it("never lists the stille Tage that are no holiday by default (they are working days or Sundays)", () => {
    const range = holidaysBetween("2026-11-01", "2026-12-31");
    expect([...range.values()].every((h) => !h.observance)).toBe(true);
    expect(range.has("2026-12-24")).toBe(false);
  });
});

describe("stille Feiertage (FeiertG NW §6, §7 Abs. 2)", () => {
  it("finds the first Sunday of Advent between 27 November and 3 December", () => {
    expect(firstAdvent(2023)).toBe("2023-12-03"); // 3 December is a Sunday
    expect(firstAdvent(2024)).toBe("2024-12-01");
    expect(firstAdvent(2025)).toBe("2025-11-30");
    expect(firstAdvent(2026)).toBe("2026-11-29");
    expect(firstAdvent(2027)).toBe("2027-11-28");
    expect(firstAdvent(2022)).toBe("2022-11-27"); // earliest possible
  });

  it("dates Volkstrauertag and Totensonntag two and one Sundays before Advent", () => {
    const byKey = (year: number) =>
      Object.fromEntries(quietObservances(year).map((h) => [h.key, h.date]));
    expect(byKey(2024)).toEqual({
      national_mourning_day: "2024-11-17",
      sunday_of_the_dead: "2024-11-24",
      christmas_eve: "2024-12-24",
    });
    expect(byKey(2026)).toMatchObject({
      national_mourning_day: "2026-11-15",
      sunday_of_the_dead: "2026-11-22",
    });
    expect(byKey(2027)).toMatchObject({
      national_mourning_day: "2027-11-14",
      sunday_of_the_dead: "2027-11-21",
    });
    expect(byKey(2028)).toMatchObject({
      national_mourning_day: "2028-11-19",
      sunday_of_the_dead: "2028-11-26",
    });
  });

  it("marks Karfreitag, Allerheiligen, Volkstrauertag, Totensonntag and Heiligabend as quiet, with the hours", () => {
    const all = [
      ...holidaysBetween("2026-01-01", "2026-12-31", "NW", { observances: true }).values(),
    ];
    const quiet = Object.fromEntries(all.filter(isQuietHoliday).map((h) => [h.key, h.quiet]));
    expect(quiet).toEqual({
      good_friday: { fromHour: 0, untilHour: 24 },
      all_saints: { fromHour: 5, untilHour: 18 },
      national_mourning_day: { fromHour: 5, untilHour: 13 },
      sunday_of_the_dead: { fromHour: 5, untilHour: 18 },
      christmas_eve: { fromHour: 16, untilHour: 24 },
    });
  });

  it("keeps the observances out of the statutory count and marks them as such", () => {
    for (const h of quietObservances(2026))
      expect(h).toMatchObject({ statutory: false, observance: true });
    expect(publicHolidays(2026).every((h) => !h.observance)).toBe(true);
  });

  it("adds the observances to a range on request, across a year boundary", () => {
    const range = holidaysBetween("2026-12-20", "2027-01-10", "NW", { observances: true });
    expect([...range.keys()]).toEqual(["2026-12-24", "2026-12-25", "2026-12-26", "2027-01-01"]);
  });
});

describe("holiday weekends", () => {
  it("covers Saturday to Monday of Easter and Whitsun", () => {
    expect(holidayWeekends(2026)).toEqual([
      expect.objectContaining({ key: "easter", from: "2026-04-04", to: "2026-04-06" }),
      expect.objectContaining({ key: "whitsun", from: "2026-05-23", to: "2026-05-25" }),
    ]);
    expect(holidayWeekends(2027)).toEqual([
      expect.objectContaining({ key: "easter", from: "2027-03-27", to: "2027-03-29" }),
      expect.objectContaining({ key: "whitsun", from: "2027-05-15", to: "2027-05-17" }),
    ]);
  });

  it("maps every day of a weekend inside the range, and only those", () => {
    const days = holidayWeekendsBetween("2026-04-05", "2026-05-23");
    expect([...days.keys()]).toEqual(["2026-04-05", "2026-04-06", "2026-05-23"]);
    expect(days.get("2026-04-05")?.nameDe).toBe("Osterwochenende");
    expect(days.get("2026-05-23")?.nameDe).toBe("Pfingstwochenende");
    expect(days.has("2026-04-03")).toBe(false); // Karfreitag is not part of the weekend
  });

  it("handles an Easter weekend that starts in March and ends in April (2024)", () => {
    expect([...holidayWeekendsBetween("2024-03-01", "2024-04-30").keys()]).toEqual([
      "2024-03-30",
      "2024-03-31",
      "2024-04-01",
    ]);
  });
});
