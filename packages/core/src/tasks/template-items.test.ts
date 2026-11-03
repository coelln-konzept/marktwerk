import { describe, expect, it } from "vitest";
import {
  applicableItems,
  checkDependencies,
  checkTemplateItem,
  hasCondition,
  insertPoint,
  itemApplies,
  itemKeyBase,
  normalizeCondition,
  offsetLabel,
  offsetWords,
  rulerPosition,
  type TemplateItemFields,
  uniqueItemKey,
} from "./template-items";

const facts = { eventTypeKey: "flea", venueId: "v1", venueKind: "outdoor_public" };

const item = (patch: Partial<TemplateItemFields> = {}): TemplateItemFields => ({
  title: "Marktgenehmigung beantragen",
  description: null,
  phase: "pre",
  category: "permits",
  anchorKey: "event_day",
  offsetDays: -60,
  dayMode: "calendar",
  dueTime: null,
  dutyRoleId: null,
  priority: "normal",
  estimateMinutes: 30,
  requiresPhoto: false,
  requiresNote: false,
  requiresAttachment: false,
  isKey: false,
  permitType: null,
  checkItems: [],
  approverDutyRoleId: null,
  dependsOnKeys: [],
  condition: null,
  ...patch,
});

describe("itemApplies", () => {
  it("applies without a condition or with an empty one", () => {
    expect(itemApplies(null, facts)).toBe(true);
    expect(itemApplies(undefined, facts)).toBe(true);
    expect(itemApplies({}, facts)).toBe(true);
    expect(itemApplies({ eventTypeKeys: [] }, facts)).toBe(true);
  });

  it("needs a match in every list that is given", () => {
    expect(itemApplies({ eventTypeKeys: ["flea", "antique"] }, facts)).toBe(true);
    expect(itemApplies({ eventTypeKeys: ["street_fair"] }, facts)).toBe(false);
    expect(itemApplies({ venueIds: ["v1"] }, facts)).toBe(true);
    expect(itemApplies({ venueIds: ["v2"] }, facts)).toBe(false);
    expect(itemApplies({ eventTypeKeys: ["flea"], venueKinds: ["indoor"] }, facts)).toBe(false);
    expect(itemApplies({ eventTypeKeys: ["flea"], venueKinds: ["outdoor_public"] }, facts)).toBe(
      true,
    );
  });

  it("a venue kind condition does not match a venue without kind", () => {
    expect(itemApplies({ venueKinds: ["indoor"] }, { ...facts, venueKind: null })).toBe(false);
  });

  it("filters a list of items and keeps their order", () => {
    const items = [
      { id: "a", condition: null },
      { id: "b", condition: { eventTypeKeys: ["street_fair"] } },
      { id: "c", condition: { eventTypeKeys: ["flea"] } },
    ];
    expect(applicableItems(items, facts).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("normalises conditions", () => {
    expect(normalizeCondition({ eventTypeKeys: [], venueKinds: [" "] })).toBeNull();
    expect(normalizeCondition({ eventTypeKeys: ["flea", "flea", " food "] })).toEqual({
      eventTypeKeys: ["flea", "food"],
    });
    expect(hasCondition({ venueIds: ["x"] })).toBe(true);
    expect(hasCondition(null)).toBe(false);
  });
});

describe("checkTemplateItem", () => {
  it("accepts a normal item", () => {
    expect(checkTemplateItem(item())).toEqual([]);
    expect(checkTemplateItem(item({ dueTime: "17:30", offsetDays: 3 }))).toEqual([]);
  });

  it("flags each broken field", () => {
    const codes = (patch: Partial<TemplateItemFields>) =>
      checkTemplateItem(item(patch)).map((i) => i.code);
    expect(codes({ title: "  " })).toEqual(["invalid_title"]);
    expect(codes({ title: "x".repeat(201) })).toEqual(["invalid_title"]);
    expect(codes({ anchorKey: "Event Day" })).toEqual(["invalid_anchor"]);
    expect(codes({ offsetDays: 1.5 })).toEqual(["invalid_offset"]);
    expect(codes({ offsetDays: 400 })).toEqual(["invalid_offset"]);
    expect(codes({ offsetDays: -366 })).toEqual(["invalid_offset"]);
    expect(codes({ dueTime: "25:00" })).toEqual(["invalid_time"]);
    expect(codes({ estimateMinutes: -1 })).toEqual(["invalid_estimate"]);
    expect(codes({ checkItems: ["ok", " "] })).toEqual(["invalid_check_items"]);
    expect(codes({ phase: "later" as never })).toEqual(["invalid_phase"]);
    expect(codes({ category: "misc" as never })).toEqual(["invalid_category"]);
    expect(codes({ priority: "urgent" as never })).toEqual(["invalid_priority"]);
    expect(codes({ dayMode: "weekdays" as never })).toEqual(["invalid_day_mode"]);
    expect(codes({ permitType: "visa" as never })).toEqual(["invalid_permit_type"]);
    expect(codes({ permitType: "market_permit" })).toEqual([]);
  });
});

describe("checkDependencies", () => {
  it("accepts a chain and an independent item", () => {
    expect(
      checkDependencies([
        { stableKey: "a", dependsOnKeys: [] },
        { stableKey: "b", dependsOnKeys: ["a"] },
        { stableKey: "c", dependsOnKeys: ["a", "b"] },
      ]),
    ).toEqual([]);
  });

  it("finds unknown targets, self references and loops", () => {
    const issues = checkDependencies([
      { stableKey: "a", dependsOnKeys: ["c"] },
      { stableKey: "b", dependsOnKeys: ["a", "zzz"] },
      { stableKey: "c", dependsOnKeys: ["b"] },
      { stableKey: "d", dependsOnKeys: ["d"] },
    ]);
    expect(issues).toContainEqual({ key: "b", code: "unknown_dependency" });
    expect(issues).toContainEqual({ key: "d", code: "self_dependency" });
    const cycle = issues.filter((i) => i.code === "dependency_cycle").map((i) => i.key);
    expect(new Set(cycle)).toEqual(new Set(["a", "b", "c"]));
  });
});

describe("keys and labels", () => {
  it("makes stable keys from titles", () => {
    expect(itemKeyBase("Marktgenehmigung beantragen")).toBe("marktgenehmigung_beantragen");
    expect(itemKeyBase("Plakate & Aufkleber bestellen!")).toBe("plakate_aufkleber_bestellen");
    expect(itemKeyBase("Größe prüfen – Übersicht")).toBe("groesse_pruefen_uebersicht");
    expect(itemKeyBase("???")).toBe("aufgabe");
    expect(itemKeyBase("x".repeat(80)).length).toBe(50);
  });

  it("makes keys unique", () => {
    expect(uniqueItemKey("Plakate", new Set(["flyer"]))).toBe("plakate");
    expect(uniqueItemKey("Plakate", new Set(["plakate"]))).toBe("plakate_2");
    expect(uniqueItemKey("Plakate", new Set(["plakate", "plakate_2"]))).toBe("plakate_3");
  });

  it("labels offsets", () => {
    expect(offsetLabel(0)).toBe("T");
    expect(offsetLabel(-30)).toBe("T-30");
    expect(offsetLabel(2)).toBe("T+2");
  });
});

describe("rulerPosition", () => {
  it("stays within 0..1 and is monotonic", () => {
    const offsets = [-180, -90, -60, -30, -14, -1, 0, 1, 7, 30, 60];
    const positions = offsets.map((o) => rulerPosition(o, -180, 60));
    for (const p of positions) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < positions.length; i += 1)
      expect(positions[i] as number).toBeGreaterThan(positions[i - 1] as number);
    expect(positions[0]).toBe(0);
    expect(positions.at(-1)).toBe(1);
  });

  it("is linear close to the anchor", () => {
    const d1 = rulerPosition(-10, -30, 30) - rulerPosition(-20, -30, 30);
    const d2 = rulerPosition(0, -30, 30) - rulerPosition(-10, -30, 30);
    expect(d1).toBeCloseTo(d2, 6);
  });
});

describe("offsetWords", () => {
  it("speaks in weeks and months where that is exact", () => {
    expect(offsetWords(0)).toEqual({ kind: "on" });
    expect(offsetWords(-42)).toEqual({ kind: "weeks", count: 6, direction: "before" });
    expect(offsetWords(7)).toEqual({ kind: "weeks", count: 1, direction: "after" });
    expect(offsetWords(-180)).toEqual({ kind: "months", count: 6, direction: "before" });
    expect(offsetWords(-60)).toEqual({ kind: "months", count: 2, direction: "before" });
  });

  it("falls back to days and keeps business days as working days", () => {
    expect(offsetWords(-45)).toEqual({ kind: "days", count: 45, direction: "before" });
    expect(offsetWords(-3)).toEqual({ kind: "days", count: 3, direction: "before" });
    expect(offsetWords(-14, "business")).toEqual({
      kind: "workdays",
      count: 14,
      direction: "before",
    });
  });
});

describe("insertPoint", () => {
  const rows = [
    { key: "a", phase: "pre" as const, anchorKey: "event_day", offsetDays: -60 },
    { key: "b", phase: "pre" as const, anchorKey: "event_day", offsetDays: -21 },
    { key: "c", phase: "pre" as const, anchorKey: "booking_cutoff", offsetDays: 1 },
    { key: "d", phase: "pre" as const, anchorKey: "event_day", offsetDays: -5 },
    { key: "e", phase: "live" as const, anchorKey: "event_day", offsetDays: 0 },
  ];
  const at = (
    offsetDays: number,
    anchorKey = "event_day",
    phase: "pre" | "live" | "post" = "pre",
  ) => ({ phase, anchorKey, offsetDays });

  it("goes before the first later row of the same anchor", () => {
    expect(insertPoint(rows, at(-30))).toEqual({ afterKey: null, beforeKey: "b" });
    expect(insertPoint(rows, at(-90))).toEqual({ afterKey: null, beforeKey: "a" });
  });

  it("goes after the last row of the anchor when nothing is later", () => {
    expect(insertPoint(rows, at(-1))).toEqual({ afterKey: "d", beforeKey: null });
  });

  it("goes to the end of the phase when the anchor is new there", () => {
    expect(insertPoint(rows, at(2, "setup_day"))).toEqual({ afterKey: "d", beforeKey: null });
    expect(insertPoint(rows, at(2, "event_day", "post"))).toEqual({
      afterKey: null,
      beforeKey: null,
    });
  });
});
