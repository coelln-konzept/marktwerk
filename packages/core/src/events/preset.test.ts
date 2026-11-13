import { describe, expect, it } from "vitest";
import { checkPresetFields, type PresetFieldsInput, presetKeyBase } from "./preset";
import { defaultSchedule, type ScheduleRow } from "./schedule";

const valid: PresetFieldsInput = {
  name: "Flohmarkt Neumarkt",
  durationDays: 1,
  publicTitle: null,
  publicText: null,
  schedule: defaultSchedule(),
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

  it("flags a Zeitplan with any issue (the rows say which, via validateSchedule)", () => {
    const [setup, open, teardown] = defaultSchedule();
    if (!setup || !open || !teardown) throw new Error("default schedule");
    expect(codes({ schedule: [setup, teardown] })).toEqual(["invalid_schedule@schedule"]);
    expect(codes({ schedule: [{ ...open, to: "25:00" }] })).toEqual(["invalid_schedule@schedule"]);
    expect(codes({ schedule: [{ ...open, from: "17:00" }] })).toEqual([
      "invalid_schedule@schedule",
    ]);
    expect(codes({ schedule: [open] })).toEqual([]);
  });

  it("checks the day rules for the preset's length", () => {
    const earlyTeardown = { ...defaultSchedule()[2], from: "07:00", to: "10:00" } as ScheduleRow;
    const schedule = [...defaultSchedule(), earlyTeardown];
    expect(codes({ schedule })).toEqual(["invalid_schedule@schedule"]);
    expect(codes({ schedule, durationDays: 2 })).toEqual([]);
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

  it("allows no Kürzel or a normalised one of 1–4 characters", () => {
    expect(codes({ shortCode: null })).toEqual([]);
    expect(codes({ shortCode: "ALT" })).toEqual([]);
    expect(codes({ shortCode: "SÜD" })).toEqual([]);
    expect(codes({ shortCode: "ABCDE" })).toEqual(["invalid_short_code@shortCode"]);
    expect(codes({ shortCode: "alt" })).toEqual(["invalid_short_code@shortCode"]);
    expect(codes({ shortCode: "" })).toEqual(["invalid_short_code@shortCode"]);
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
