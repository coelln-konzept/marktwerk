import { describe, expect, it } from "vitest";
import { checkDateInput, parseDateInput } from "@/lib/date-input";

const today = "2026-11-13";
const date = (text: string, opts: { min?: string; max?: string; required?: boolean } = {}) =>
  checkDateInput(text, { today, ...opts });

describe("parseDateInput", () => {
  it("reads German day.month with and without a year", () => {
    expect(date("5.3.")).toEqual({ value: "2026-03-05", error: null });
    expect(date("5.3")).toEqual({ value: "2026-03-05", error: null });
    expect(date("05.03.26")).toEqual({ value: "2026-03-05", error: null });
    expect(date("5.3.2027")).toEqual({ value: "2027-03-05", error: null });
    expect(date(" 31.12.2026 ")).toEqual({ value: "2026-12-31", error: null });
  });

  it("reads digits only as DDMM, DDMMYY and DDMMYYYY", () => {
    expect(date("0503")).toEqual({ value: "2026-03-05", error: null });
    expect(date("050327")).toEqual({ value: "2027-03-05", error: null });
    expect(date("05032027")).toEqual({ value: "2027-03-05", error: null });
  });

  it("reads the words, relative to the business date", () => {
    expect(date("heute")).toEqual({ value: "2026-11-13", error: null });
    expect(date("Morgen")).toEqual({ value: "2026-11-14", error: null });
    expect(date("übermorgen")).toEqual({ value: "2026-11-15", error: null });
    expect(date("gestern")).toEqual({ value: "2026-11-12", error: null });
    expect(date("tomorrow")).toEqual({ value: "2026-11-14", error: null });
    expect(checkDateInput("morgen", { today: "2026-12-31" }).value).toBe("2027-01-01");
  });

  it("reads back what the field writes (weekday in front) and ISO", () => {
    expect(date("Do 05.03.2026")).toEqual({ value: "2026-03-05", error: null });
    expect(date("Thu 05/03/2026")).toEqual({ value: "2026-03-05", error: null });
    expect(date("2026-03-05")).toEqual({ value: "2026-03-05", error: null });
  });

  it("calls half-typed input incomplete instead of dropping it", () => {
    for (const text of ["5", "5.", "05.", "5.3.2", "5.3.202", "050", "05032", "0503202", "heu"])
      expect(date(text), text).toEqual({ value: null, error: "incomplete" });
  });

  it("rejects days that do not exist and odd years", () => {
    for (const text of [
      "31.02.2026",
      "29.02.2027",
      "13.13.",
      "0.3.",
      "31022026x",
      "abc",
      "310220260",
      "1.2.31022",
    ])
      expect(date(text).error, text).toBe("invalid");
    expect(date("29.02.2028")).toEqual({ value: "2028-02-29", error: null });
    expect(date("123.4.")).toEqual({ value: null, error: "invalid" });
  });

  it("is empty for blank text, required only when asked", () => {
    expect(parseDateInput("  ", today)).toEqual({ kind: "empty" });
    expect(date("")).toEqual({ value: null, error: null });
    expect(date("", { required: true })).toEqual({ value: null, error: "required" });
  });
});

describe("checkDateInput min and max", () => {
  it("moves a date without a year into next year when min says so", () => {
    expect(date("5.3.", { min: today })).toEqual({ value: "2027-03-05", error: null });
    expect(date("0503", { min: today })).toEqual({ value: "2027-03-05", error: null });
    // Still this year when that is allowed.
    expect(date("20.11.", { min: today })).toEqual({ value: "2026-11-20", error: null });
  });

  it("never moves a typed year or a word", () => {
    expect(date("5.3.26", { min: today })).toEqual({ value: null, error: "tooEarly" });
    expect(date("gestern", { min: today })).toEqual({ value: null, error: "tooEarly" });
  });

  it("checks max", () => {
    expect(date("1.1.2028", { max: "2027-12-31" })).toEqual({ value: null, error: "tooLate" });
    expect(date("31.12.2027", { max: "2027-12-31" })).toEqual({ value: "2027-12-31", error: null });
  });
});
