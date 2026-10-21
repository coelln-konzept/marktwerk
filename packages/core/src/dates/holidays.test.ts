import { describe, expect, it } from "vitest";
import { easterSunday, holidaysBetween, publicHolidays } from "./holidays";

describe("NRW public holidays", () => {
  it("computes Easter Sunday", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25"); // latest possible
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
});
