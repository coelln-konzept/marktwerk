import { describe, expect, it } from "vitest";
import { landownerKindsFor, mayOwnVenue, nextRowLabel } from "./rows";

describe("nextRowLabel", () => {
  it.each([
    [["A1", "A2", "A3"], "A4"],
    [["Reihe 09"], "Reihe 10"],
    [["B-007"], "B-008"],
    [["9"], "10"],
    [["Hauptweg Nord"], ""],
    [[], ""],
  ])("%j → %s", (labels, next) => {
    expect(nextRowLabel(labels)).toBe(next);
  });
});

describe("landowner kinds", () => {
  it("lets authorities own a städtisches Ort, not a private one", () => {
    expect(landownerKindsFor("municipal")).toEqual(["landowner", "authority"]);
    expect(landownerKindsFor("private")).toEqual(["landowner"]);
    expect(mayOwnVenue("authority", "municipal")).toBe(true);
    expect(mayOwnVenue("authority", "private")).toBe(false);
    expect(mayOwnVenue("landowner", "private")).toBe(true);
    expect(mayOwnVenue("supplier", "municipal")).toBe(false);
  });
});
