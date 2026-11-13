import { describe, expect, it } from "vitest";
import { PERMIT_TYPES } from "./status";
import {
  defaultVenueNeeds,
  isVenueNeedType,
  itemPermitType,
  mainPermitType,
  planVenueNeeds,
  suggestedVenueNeeds,
  VENUE_NEED_DEFAULTS,
  VENUE_NEED_TYPES,
} from "./venue-needs";

describe("venue needs: the offered types", () => {
  it("offers only existing permit types, each with a title, a category and a lead time", () => {
    for (const type of VENUE_NEED_TYPES) {
      expect(PERMIT_TYPES).toContain(type);
      expect(VENUE_NEED_DEFAULTS[type].title).not.toBe("");
      expect(VENUE_NEED_DEFAULTS[type].leadTimeDays).toBeGreaterThan(0);
    }
    expect(isVenueNeedType("water")).toBe(true);
    expect(isVenueNeedType("traffic_order")).toBe(false);
    expect(isVenueNeedType(null)).toBe(false);
  });
});

describe("defaultVenueNeeds", () => {
  it("pre-ticks the Marktgenehmigung and the Festsetzung on city ground", () => {
    expect(mainPermitType("municipal")).toBe("market_permit");
    expect(defaultVenueNeeds("municipal")).toEqual(["market_permit", "market_fixing"]);
  });

  it("pre-ticks the owner's OK and the Festsetzung on private ground", () => {
    expect(mainPermitType("private")).toBe("landowner_ok");
    expect(defaultVenueNeeds("private")).toEqual(["landowner_ok", "market_fixing"]);
  });
});

describe("suggestedVenueNeeds", () => {
  it("is the defaults for an Ort without requirements", () => {
    expect(suggestedVenueNeeds("private", [])).toEqual(["landowner_ok", "market_fixing"]);
    expect(suggestedVenueNeeds("municipal", [])).toEqual(["market_permit", "market_fixing"]);
  });

  it("swaps the main permit on a switch Städtisch → Privat and keeps the extras", () => {
    expect(
      suggestedVenueNeeds("private", ["market_permit", "market_fixing", "no_parking", "toilets"]),
    ).toEqual(["landowner_ok", "market_fixing", "no_parking", "toilets"]);
  });

  it("swaps it back on Privat → Städtisch", () => {
    expect(suggestedVenueNeeds("municipal", ["landowner_ok", "water"])).toEqual([
      "market_permit",
      "market_fixing",
      "water",
    ]);
  });

  it("ignores types the dialog does not offer", () => {
    expect(suggestedVenueNeeds("municipal", ["traffic_order", "gema"])).toEqual([
      "market_permit",
      "market_fixing",
    ]);
  });
});

describe("planVenueNeeds", () => {
  const req = (id: string, permitType: string) => ({ id, permitType });

  it("creates every ticked type for a new Ort", () => {
    expect(planVenueNeeds([], ["landowner_ok", "market_fixing", "signage"])).toEqual({
      create: ["landowner_ok", "market_fixing", "signage"],
      archive: [],
    });
  });

  it("creates only what is missing and removes the unticked need types", () => {
    const current = [
      req("a", "market_permit"),
      req("b", "market_fixing"),
      req("c", "no_parking"),
      req("d", "traffic_order"),
    ];
    const plan = planVenueNeeds(current, ["landowner_ok", "market_fixing"]);
    expect(plan.create).toEqual(["landowner_ok"]);
    // The Sperrung (not offered in the dialog) stays.
    expect(plan.archive.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("keeps several requirements of one ticked type and drops unknown ticks", () => {
    const current = [req("a", "toilets"), req("b", "toilets")];
    expect(planVenueNeeds(current, ["toilets", "nonsense", "gema"])).toEqual({
      create: [],
      archive: [],
    });
  });

  it("changes nothing when the ticks match", () => {
    expect(planVenueNeeds([req("a", "market_permit")], ["market_permit"])).toEqual({
      create: [],
      archive: [],
    });
  });
});

describe("itemPermitType", () => {
  it("lets a Marktgenehmigung item stand for the owner's OK on private ground", () => {
    expect(itemPermitType("market_permit", ["landowner_ok", "market_fixing"])).toBe("landowner_ok");
  });

  it("keeps the Marktgenehmigung where the Ort needs one, also next to an owner's OK", () => {
    expect(itemPermitType("market_permit", ["market_permit", "market_fixing"])).toBe(
      "market_permit",
    );
    expect(itemPermitType("market_permit", ["market_permit", "landowner_ok"])).toBe(
      "market_permit",
    );
  });

  it("stays market_permit where neither is needed (nothing to link)", () => {
    expect(itemPermitType("market_permit", [])).toBe("market_permit");
    expect(itemPermitType("market_permit", ["water"])).toBe("market_permit");
  });

  it("leaves every other type alone", () => {
    expect(itemPermitType("market_fixing", ["landowner_ok"])).toBe("market_fixing");
    expect(itemPermitType("landowner_ok", ["market_permit"])).toBe("landowner_ok");
    expect(itemPermitType("water", new Set(["landowner_ok"]))).toBe("water");
  });
});
