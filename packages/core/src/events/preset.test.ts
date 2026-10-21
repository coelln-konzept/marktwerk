import { describe, expect, it } from "vitest";
import { checkPresetFields, type PresetFieldsInput, presetKeyBase } from "./preset";

const valid: PresetFieldsInput = {
  name: "Flohmarkt Neumarkt",
  durationDays: 1,
  publicTitle: null,
  publicText: null,
  times: { setup: "05:00", open: "08:00", close: "16:00", teardown: "18:00" },
  pricePerMCents: 1200,
  bookingFeeCents: 500,
  rrule: "FREQ=MONTHLY;BYDAY=SU;BYSETPOS=1",
};

const codes = (patch: Partial<PresetFieldsInput>) =>
  checkPresetFields({ ...valid, ...patch }).map((i) => `${i.code}@${i.field}`);

describe("checkPresetFields", () => {
  it("accepts a valid preset, with and without rhythm", () => {
    expect(checkPresetFields(valid)).toEqual([]);
    expect(checkPresetFields({ ...valid, rrule: null })).toEqual([]);
  });

  it("checks the name length after trimming", () => {
    expect(codes({ name: "   " })).toEqual(["invalid_name@name"]);
    expect(codes({ name: "x".repeat(121) })).toEqual(["invalid_name@name"]);
    expect(codes({ name: "x".repeat(120) })).toEqual([]);
  });

  it("allows 1 to 14 days", () => {
    expect(codes({ durationDays: 0 })).toEqual(["invalid_duration@duration"]);
    expect(codes({ durationDays: 15 })).toEqual(["invalid_duration@duration"]);
    expect(codes({ durationDays: 1.5 })).toEqual(["invalid_duration@duration"]);
    expect(codes({ durationDays: 14 })).toEqual([]);
  });

  it("limits the public texts", () => {
    expect(codes({ publicTitle: "x".repeat(201) })).toEqual(["invalid_public_title@publicTitle"]);
    expect(codes({ publicText: "x".repeat(5001) })).toEqual(["invalid_public_text@publicText"]);
  });

  it("names the time field that is wrong", () => {
    expect(codes({ times: { ...valid.times, teardown: "25:00" } })).toEqual([
      "invalid_time@teardown",
    ]);
    expect(codes({ times: { ...valid.times, open: "17:00" } })).toEqual(["open_after_close@close"]);
    expect(codes({ times: { ...valid.times, teardown: "15:00" } })).toEqual([
      "close_after_teardown@teardown",
    ]);
  });

  it("accepts a late setup time only for multi-day presets", () => {
    const times = { ...valid.times, setup: "09:00" };
    expect(codes({ times })).toEqual(["setup_after_open@setup"]);
    expect(codes({ times, durationDays: 3 })).toEqual([]);
  });

  it("limits prices to 0 – 1.000.000 cents", () => {
    expect(codes({ pricePerMCents: -1 })).toEqual(["invalid_price@price"]);
    expect(codes({ pricePerMCents: 1_000_001 })).toEqual(["invalid_price@price"]);
    expect(codes({ bookingFeeCents: 1.5 })).toEqual(["invalid_fee@fee"]);
    expect(codes({ pricePerMCents: 0, bookingFeeCents: 1_000_000 })).toEqual([]);
  });

  it("rejects rules that do not parse", () => {
    expect(codes({ rrule: "FREQ=WEEKLY;BYDAY=SU" })).toEqual(["invalid_rrule@rrule"]);
    expect(codes({ rrule: "nonsense" })).toEqual(["invalid_rrule@rrule"]);
  });
});

describe("presetKeyBase", () => {
  it("makes a lower-case ASCII slug", () => {
    expect(presetKeyBase("Frühjahrs-Flohmarkt")).toBe("fruehjahrs-flohmarkt");
    expect(presetKeyBase("  Straße & Café  ")).toBe("strasse-cafe");
  });

  it("falls back and truncates", () => {
    expect(presetKeyBase("!!!")).toBe("vorlage");
    expect(presetKeyBase("a".repeat(100))).toHaveLength(60);
  });
});
