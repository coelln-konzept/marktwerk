import { describe, expect, it } from "vitest";
import { isPermitSort, permitListGroup, sortPermits } from "./order";

const row = (
  title: string,
  over: Partial<Parameters<typeof sortPermits>[0][number]> = {},
): Parameters<typeof sortPermits>[0][number] => ({
  title,
  applyBy: null,
  state: "missing",
  venueName: "Altstadt",
  nextEventOn: null,
  ...over,
});

describe("sortPermits", () => {
  it("sorts by apply-by, earliest first, permits without a date last", () => {
    const rows = [
      row("C"),
      row("B", { applyBy: "2027-02-17" }),
      row("A", { applyBy: "2026-12-04" }),
      row("D", { applyBy: "2027-01-02" }),
    ];
    expect(sortPermits(rows, "antrag").map((r) => r.title)).toEqual(["A", "D", "B", "C"]);
  });

  it("breaks ties by title and does not touch the input", () => {
    const rows = [row("Zeta", { applyBy: "2027-01-01" }), row("Äpfel", { applyBy: "2027-01-01" })];
    expect(sortPermits(rows, "antrag").map((r) => r.title)).toEqual(["Äpfel", "Zeta"]);
    expect(rows.map((r) => r.title)).toEqual(["Zeta", "Äpfel"]);
  });

  it("sorts by venue, then apply-by", () => {
    const rows = [
      row("1", { venueName: "Neuss", applyBy: "2027-01-01" }),
      row("2", { venueName: "Bergisch Gladbach", applyBy: "2027-03-01" }),
      row("3", { venueName: "Bergisch Gladbach", applyBy: "2027-02-01" }),
      row("4", { venueName: null }),
    ];
    expect(sortPermits(rows, "ort").map((r) => r.title)).toEqual(["4", "3", "2", "1"]);
  });

  it("sorts the worst state first and by next market", () => {
    const rows = [
      row("granted", { state: "granted" }),
      row("rejected", { state: "rejected" }),
      row("missing", { state: "missing" }),
    ];
    expect(sortPermits(rows, "status").map((r) => r.title)).toEqual([
      "rejected",
      "missing",
      "granted",
    ]);
    const markets = [
      row("late", { nextEventOn: "2027-05-01" }),
      row("none"),
      row("soon", { nextEventOn: "2026-11-08" }),
    ];
    expect(sortPermits(markets, "markt").map((r) => r.title)).toEqual(["soon", "late", "none"]);
  });
});

describe("isPermitSort", () => {
  it("accepts the four sorts only", () => {
    for (const ok of ["antrag", "ort", "status", "markt"]) expect(isPermitSort(ok)).toBe(true);
    for (const bad of ["", "Antrag", undefined, null, 1]) expect(isPermitSort(bad)).toBe(false);
  });
});

describe("permitListGroup", () => {
  it("splits what to apply for now, later, and the rest", () => {
    expect(permitListGroup({ tier: "overdue", upcomingEvents: 3 })).toBe("now");
    expect(permitListGroup({ tier: "apply_now", upcomingEvents: 1 })).toBe("now");
    expect(permitListGroup({ tier: "not_due", upcomingEvents: 7 })).toBe("later");
    expect(permitListGroup({ tier: null, upcomingEvents: 7 })).toBe("other");
  });

  it("keeps permits no upcoming market asks for out of the groups", () => {
    expect(permitListGroup({ tier: "overdue", upcomingEvents: 0 })).toBe("other");
  });
});
