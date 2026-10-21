import { describe, expect, it } from "vitest";
import { aggregateBudget, eventMoneyHealth, seasonShareCents } from "./budget";
import { centsToInput, parseMoneyCents, parseVatRateBp } from "./money";

const ORDER = ["location", "security", "toilets", "other"];

describe("aggregateBudget", () => {
  it("sums plan, committed and actual per category in category order", () => {
    const { rows, totals } = aggregateBudget(
      {
        planned: [
          { category: "toilets", plannedCents: 90_000 },
          { category: "security", plannedCents: 190_000 },
        ],
        payables: [
          { category: "security", committedCents: 200_000, actualCents: 100_000 },
          { category: "security", committedCents: 10_000, actualCents: 0 },
          { category: "toilets", committedCents: 80_000, actualCents: 80_000 },
        ],
        expenses: [{ category: "other", amountCents: 1_234 }],
      },
      ORDER,
    );
    expect(rows.map((r) => r.category)).toEqual(["security", "toilets", "other"]);
    expect(rows[0]).toEqual({
      category: "security",
      plannedCents: 190_000,
      committedCents: 210_000,
      actualCents: 100_000,
      varianceCents: -20_000,
    });
    expect(rows[1]).toMatchObject({
      committedCents: 80_000,
      actualCents: 80_000,
      varianceCents: 10_000,
    });
    // No plan line: nothing to compare against.
    expect(rows[2]).toEqual({
      category: "other",
      plannedCents: 0,
      committedCents: 1_234,
      actualCents: 1_234,
      varianceCents: null,
    });
    expect(totals).toEqual({
      plannedCents: 280_000,
      committedCents: 291_234,
      actualCents: 181_234,
      varianceCents: -11_234,
    });
  });

  it("counts a planned category without costs and leaves the variance open without any plan", () => {
    const planned = aggregateBudget(
      { planned: [{ category: "gema", plannedCents: 50_000 }], payables: [], expenses: [] },
      ORDER,
    );
    expect(planned.rows).toEqual([
      {
        category: "gema",
        plannedCents: 50_000,
        committedCents: 0,
        actualCents: 0,
        varianceCents: 50_000,
      },
    ]);
    const unplanned = aggregateBudget(
      {
        planned: [],
        payables: [{ category: "location", committedCents: 100, actualCents: 0 }],
        expenses: [],
      },
      ORDER,
    );
    expect(unplanned.totals.varianceCents).toBeNull();
  });

  it("is empty without data", () => {
    expect(aggregateBudget({ planned: [], payables: [], expenses: [] })).toEqual({
      rows: [],
      totals: { plannedCents: 0, committedCents: 0, actualCents: 0, varianceCents: null },
    });
  });
});

describe("seasonShareCents", () => {
  it("divides a season payable over the events, in whole cents", () => {
    expect(seasonShareCents(1_500_000, 10)).toBe(150_000);
    expect(seasonShareCents(100, 3)).toBe(33);
    expect(seasonShareCents(100, 0)).toBe(0);
  });
});

describe("eventMoneyHealth", () => {
  const base = {
    overdueCount: 0,
    dueSoonCount: 0,
    installmentCount: 0,
    plannedCents: 0,
    committedCents: 0,
  };
  it("is critical for overdue rates, warn for rates due soon or costs over plan", () => {
    expect(eventMoneyHealth({ ...base, overdueCount: 1, installmentCount: 2 })).toBe("critical");
    expect(eventMoneyHealth({ ...base, dueSoonCount: 1, installmentCount: 2 })).toBe("warn");
    expect(eventMoneyHealth({ ...base, plannedCents: 100, committedCents: 101 })).toBe("warn");
  });

  it("is ok once money is tracked and null before", () => {
    expect(eventMoneyHealth({ ...base, installmentCount: 3 })).toBe("ok");
    expect(eventMoneyHealth({ ...base, plannedCents: 5000 })).toBe("ok");
    expect(eventMoneyHealth(base)).toBeNull();
  });
});

describe("parseMoneyCents", () => {
  it("reads German and plain notation", () => {
    expect(parseMoneyCents("15.000,00 €")).toBe(1_500_000);
    expect(parseMoneyCents("1.234,5")).toBe(123_450);
    expect(parseMoneyCents("12.50")).toBe(1250);
    expect(parseMoneyCents("2.700")).toBe(270_000);
    expect(parseMoneyCents("0,01")).toBe(1);
  });

  it("rejects garbage, negatives and amounts above the limit", () => {
    expect(parseMoneyCents("")).toBeNull();
    expect(parseMoneyCents("abc")).toBeNull();
    expect(parseMoneyCents("-5")).toBeNull();
    expect(parseMoneyCents("12,345")).toBeNull();
    expect(parseMoneyCents("2.000.000,00")).toBeNull();
  });

  it("formats cents for an input field", () => {
    expect(centsToInput(123_456)).toBe("1234,56");
    expect(centsToInput(5, false)).toBe("0.05");
  });
});

describe("parseVatRateBp", () => {
  it("reads percent into basis points", () => {
    expect(parseVatRateBp("19")).toBe(1900);
    expect(parseVatRateBp("7 %")).toBe(700);
    expect(parseVatRateBp("5,5")).toBe(550);
    expect(parseVatRateBp("0")).toBe(0);
    expect(parseVatRateBp("101")).toBeNull();
    expect(parseVatRateBp("x")).toBeNull();
  });
});
