import { describe, expect, it } from "vitest";
import { VENUE_NAME_MAX, venueNameFromAddress } from "./name";

describe("venueNameFromAddress", () => {
  it("joins city and street with a dash", () => {
    expect(venueNameFromAddress("Köln", "Neusser Str. 12")).toBe("Köln – Neusser Str. 12");
  });

  it("uses the city alone without a street, and squashes spaces", () => {
    expect(venueNameFromAddress("  Bonn ", null)).toBe("Bonn");
    expect(venueNameFromAddress("Bonn", "   ")).toBe("Bonn");
    expect(venueNameFromAddress("Bad  Honnef", "Am   Markt")).toBe("Bad Honnef – Am Markt");
  });

  it("is empty without a city and street, and never longer than the limit", () => {
    expect(venueNameFromAddress("", "")).toBe("");
    expect(venueNameFromAddress("K", "x".repeat(300))).toHaveLength(VENUE_NAME_MAX);
  });
});
