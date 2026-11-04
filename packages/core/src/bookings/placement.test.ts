import { describe, expect, it } from "vitest";
import {
  autoPlace,
  checkFit,
  DEFAULT_GAP_RULE,
  explainNoFit,
  explainUnplaceable,
  nearestFit,
  type Placement,
  type PlacementRow,
  quoteStall,
  stallNumber,
} from "./placement";

const rowA: PlacementRow = {
  id: "a",
  label: "A",
  lengthCm: 2000,
  carAllowed: false,
  carSlots: 0,
  power: true,
};
const rowB: PlacementRow = {
  id: "b",
  label: "B",
  lengthCm: 1000,
  carAllowed: true,
  carSlots: 1,
  power: false,
};
const at = (id: string, rowId: string, startCm: number, endCm: number, car = false): Placement => ({
  id,
  rowId,
  startCm,
  endCm,
  car,
});

describe("checkFit", () => {
  const existing = [at("x", "a", 400, 800)];
  it("accepts a free interval and touching neighbours", () => {
    expect(checkFit(rowA, existing, { startCm: 0, lengthCm: 400, car: false })).toBeNull();
    expect(checkFit(rowA, existing, { startCm: 800, lengthCm: 300, car: false })).toBeNull();
  });
  it("rejects overlaps and the row end", () => {
    expect(checkFit(rowA, existing, { startCm: 700, lengthCm: 300, car: false })).toBe("overlap");
    expect(checkFit(rowA, existing, { startCm: 1800, lengthCm: 300, car: false })).toBe(
      "out_of_row",
    );
  });
  it("lets a stall move over its own old position", () => {
    expect(checkFit(rowA, existing, { startCm: 500, lengthCm: 400, car: false }, "x")).toBeNull();
  });
  it("counts car slots per row", () => {
    expect(checkFit(rowA, [], { startCm: 0, lengthCm: 500, car: true })).toBe("no_car_space");
    const one = [at("c", "b", 0, 500, true)];
    expect(checkFit(rowB, one, { startCm: 500, lengthCm: 500, car: true })).toBe("no_car_space");
    expect(checkFit(rowB, one, { startCm: 500, lengthCm: 500, car: false })).toBeNull();
  });
  it("gap rule: no 1 m leftovers, at least 3 m to the row end", () => {
    const r = DEFAULT_GAP_RULE;
    // 100 cm left between x (ends 800) and the candidate → unsellable
    expect(
      checkFit(rowA, existing, { startCm: 900, lengthCm: 300, car: false }, undefined, r),
    ).toBe("gap_rule");
    expect(
      checkFit(rowA, existing, { startCm: 1000, lengthCm: 300, car: false }, undefined, r),
    ).toBeNull();
    // 1 m from the row start (an edge) → needs 3 m or flush
    expect(
      checkFit(rowA, existing, { startCm: 100, lengthCm: 300, car: false }, undefined, r),
    ).toBe("gap_rule");
  });
});

describe("nearestFit", () => {
  it("lands where dropped when free, else slides to the closest gap", () => {
    const existing = [at("x", "a", 400, 800)];
    expect(nearestFit(rowA, existing, { lengthCm: 300, car: false }, 1230)).toBe(1250);
    expect(nearestFit(rowA, existing, { lengthCm: 300, car: false }, 600)).toBe(800);
    expect(nearestFit(rowA, existing, { lengthCm: 300, car: false }, 380)).toBe(100);
  });
  it("returns null when the row is full", () => {
    expect(nearestFit(rowB, [at("x", "b", 0, 1000)], { lengthCm: 100, car: false }, 0)).toBeNull();
  });
});

describe("autoPlace", () => {
  it("honours the Stammplatz preference first, then fills the first row with room", () => {
    const res = autoPlace(
      [rowA, rowB],
      [],
      [
        { id: "r1", lengthCm: 400, carRequested: false, power: false },
        {
          id: "r2",
          lengthCm: 300,
          carRequested: false,
          power: false,
          preferredRowLabel: "B",
          preferredOffsetCm: 600,
        },
      ],
    );
    expect(res.unplaced).toEqual([]);
    expect(res.placed.find((p) => p.id === "r2")).toMatchObject({ rowId: "b", startCm: 600 });
    expect(res.placed.find((p) => p.id === "r1")).toMatchObject({ rowId: "a", startCm: 0 });
  });
  it("reports requests that don't fit", () => {
    const res = autoPlace(
      [rowB],
      [],
      [{ id: "big", lengthCm: 1200, carRequested: false, power: false }],
    );
    expect(res.unplaced).toEqual([{ requestId: "big", reason: "no_space" }]);
  });
});

describe("quoteStall / stallNumber", () => {
  it("bills started half metres", () => {
    expect(quoteStall({ lengthCm: 320, pricePerMCents: 1500, bookingFeeCents: 250 })).toEqual({
      billedCm: 350,
      frontageCents: 5250,
      feeCents: 250,
      totalCents: 5500,
    });
  });
  it("numbers stalls by row and metre", () => {
    expect(stallNumber("A", 0)).toBe("A-1");
    expect(stallNumber("C", 1150)).toBe("C-12");
  });
});

describe("explainNoFit / explainUnplaceable", () => {
  const car = { lengthCm: 500, car: true };
  it("names the reason per row, most fundamental first", () => {
    expect(explainNoFit(rowA, [], car)).toEqual({ kind: "car_not_allowed" });
    expect(explainNoFit(rowB, [at("c", "b", 0, 500, true)], car)).toEqual({
      kind: "car_slots_full",
      slots: 1,
    });
    expect(explainNoFit(rowB, [], { lengthCm: 1200, car: false })).toEqual({
      kind: "too_long",
      rowLengthCm: 1000,
    });
    expect(explainNoFit(rowB, [], { lengthCm: 300, car: false, power: true })).toEqual({
      kind: "no_power",
    });
    expect(explainNoFit(rowB, [at("x", "b", 200, 800)], { lengthCm: 300, car: false })).toEqual({
      kind: "no_gap",
      largestGapCm: 200,
    });
  });
  it("tells the gap rule apart from a missing gap", () => {
    // free 400 cm at the end: a 300 cm stall would leave 100 cm → only the gap rule blocks it
    const existing = [at("x", "a", 0, 1600)];
    expect(
      explainNoFit(rowA, existing, { lengthCm: 300, car: false }, undefined, DEFAULT_GAP_RULE),
    ).toEqual({
      kind: "gap_rule",
      largestGapCm: 400,
    });
    expect(explainNoFit(rowA, existing, { lengthCm: 300, car: false })).toBeNull();
  });
  it("groups the reasons over all rows; empty when it fits somewhere", () => {
    const groups = explainUnplaceable([rowA, rowB], [at("c", "b", 0, 500, true)], car);
    expect(groups).toEqual([
      { reason: { kind: "car_not_allowed" }, rowLabels: ["A"] },
      { reason: { kind: "car_slots_full", slots: 1 }, rowLabels: ["B"] },
    ]);
    expect(explainUnplaceable([rowA, rowB], [], car)).toEqual([]);
  });
});
