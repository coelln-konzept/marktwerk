import { describe, expect, it } from "vitest";
import { isMarketColor, MARKET_COLORS, nextMarketColor } from "./market-colors";

describe("nextMarketColor", () => {
  it("starts with the first palette colour", () => {
    expect(nextMarketColor([])).toBe("plum");
  });

  it("picks the least used colour, ties in palette order", () => {
    expect(nextMarketColor(["plum", "rose", null])).toBe("brown");
    expect(nextMarketColor(["rose"])).toBe("plum");
  });

  it("repeats only once every colour is taken", () => {
    const all = [...MARKET_COLORS];
    expect(nextMarketColor(all)).toBe("plum");
    expect(nextMarketColor([...all, "plum", "rose"])).toBe("brown");
  });

  it("ignores unknown values", () => {
    expect(nextMarketColor(["red", "plum"])).toBe("rose");
    expect(isMarketColor("red")).toBe(false);
    expect(isMarketColor("petrol")).toBe(true);
  });
});
