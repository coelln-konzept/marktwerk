import { describe, expect, it } from "vitest";
import { permitCoversSeveralEvents } from "./apply-task";
import { PERMIT_CADENCES } from "./status";

describe("permitCoversSeveralEvents", () => {
  it("is false for single-event permits and permits without a requirement", () => {
    expect(PERMIT_CADENCES.filter(permitCoversSeveralEvents)).toEqual([
      "per_season",
      "per_year",
      "multi_year",
      "standing",
    ]);
    expect(permitCoversSeveralEvents(null)).toBe(false);
    expect(permitCoversSeveralEvents(undefined)).toBe(false);
  });
});
