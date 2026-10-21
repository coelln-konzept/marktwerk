import { describe, expect, it } from "vitest";
import {
  formatCoordinate,
  formatMetres,
  isBundesland,
  isPostalCode,
  MAX_LENGTH_CM,
  parseCoordinate,
  parseMetresToCm,
} from "./measure";

describe("parseMetresToCm", () => {
  it.each([
    ["4,5", 450],
    ["4.5", 450],
    ["4,50", 450],
    ["4,05", 405],
    ["4,5 m", 450],
    [" 12 M ", 1200],
    ["0,01", 1],
    ["0", 0],
    ["1.250", 125_000],
    ["1.250,5", 125_050],
    ["10000", MAX_LENGTH_CM],
  ])("%j → %i cm", (input, cm) => {
    expect(parseMetresToCm(input)).toBe(cm);
  });

  it.each(["", "m", "abc", "-4", "4,555", "4,5,5", "4 5 6x", "10000,01", "99999999999999999999"])(
    "rejects %j",
    (input) => {
      expect(parseMetresToCm(input)).toBeNull();
    },
  );

  it("avoids floating point drift (1,15 m is 115 cm, not 114)", () => {
    expect(parseMetresToCm("1,15")).toBe(115);
    expect(parseMetresToCm("8,2")).toBe(820);
  });
});

describe("formatMetres", () => {
  it.each([
    [450, "de", "4,5"],
    [400, "de", "4"],
    [425, "de", "4,25"],
    [5, "de", "0,05"],
    [450, "en", "4.5"],
    [0, "de", "0"],
  ])("%i cm (%s) → %s", (cm, locale, text) => {
    expect(formatMetres(cm, locale)).toBe(text);
  });

  it("reads back what it wrote", () => {
    for (const cm of [1, 99, 100, 101, 450, 1_234, 125_050, MAX_LENGTH_CM]) {
      expect(parseMetresToCm(formatMetres(cm))).toBe(cm);
    }
  });
});

describe("coordinates", () => {
  it.each([
    ["50,9375", "lat", 50.9375],
    ["6.96", "lng", 6.96],
    ["-33,5", "lat", -33.5],
    ["90", "lat", 90],
    ["180", "lng", 180],
  ] as const)("%j (%s) → %d", (input, axis, value) => {
    expect(parseCoordinate(input, axis)).toBe(value);
  });

  it.each([
    ["", "lat"],
    ["91", "lat"],
    ["181", "lng"],
    ["abc", "lat"],
    ["1,2,3", "lng"],
    ["1e3", "lng"],
  ] as const)("rejects %j (%s)", (input, axis) => {
    expect(parseCoordinate(input, axis)).toBeNull();
  });

  it("formats with the locale's decimal separator", () => {
    expect(formatCoordinate(50.9375, "de")).toBe("50,9375");
    expect(formatCoordinate(50.9375, "en")).toBe("50.9375");
  });
});

describe("postal code and Bundesland", () => {
  it("accepts five figures only", () => {
    expect(isPostalCode("50667")).toBe(true);
    expect(isPostalCode("01067")).toBe(true);
    expect(["5066", "506677", "5066a", "", " 50667"].some(isPostalCode)).toBe(false);
  });

  it("knows the sixteen states", () => {
    expect(isBundesland("NW")).toBe(true);
    expect(isBundesland("XX")).toBe(false);
    expect(isBundesland("nw")).toBe(false);
  });
});
