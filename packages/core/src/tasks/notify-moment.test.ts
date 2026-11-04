import { describe, expect, it } from "vitest";
import {
  checkNotifySetting,
  type NotifySetting,
  type NotifyTiming,
  notifyMoment,
} from "./notify-moment";

const due = new Date("2026-03-30T07:00:00Z"); // Mo 30.03.2026 09:00 Berlin (CEST, day after DST switch)
const created = new Date("2026-03-01T10:00:00Z");

describe("checkNotifySetting", () => {
  it("accepts no channels and no timing", () =>
    expect(checkNotifySetting({ channels: [], timing: null, at: null }, false)).toBeNull());
  it("rejects a timing without channels", () =>
    expect(checkNotifySetting({ channels: [], timing: "due_day", at: null }, true)).toBe(
      "unexpected_timing",
    ));
  it("needs a timing once a channel is ticked", () =>
    expect(checkNotifySetting({ channels: ["email"], timing: null, at: null }, true)).toBe(
      "timing_required",
    ));
  it("needs a moment for custom", () =>
    expect(checkNotifySetting({ channels: ["email"], timing: "custom", at: null }, true)).toBe(
      "at_required",
    ));
  it("needs a due date for relative timings", () =>
    expect(
      checkNotifySetting({ channels: ["whatsapp"], timing: "before_1d", at: null }, false),
    ).toBe("due_required"));
  it("allows on_create without a due date", () =>
    expect(
      checkNotifySetting({ channels: ["email"], timing: "on_create", at: null }, false),
    ).toBeNull());
});

describe("notifyMoment", () => {
  const s = (timing: NotifyTiming, at: Date | null = null): NotifySetting => ({
    channels: ["email"],
    timing,
    at,
  });
  it("on_create is the creation instant", () =>
    expect(notifyMoment(s("on_create"), due, created)).toEqual(created));
  it("due_day is 08:00 Berlin on the due day (CEST)", () =>
    expect(notifyMoment(s("due_day"), due, created)).toEqual(new Date("2026-03-30T06:00:00Z")));
  it("before_1d lands on the DST switch day and is 08:00 CEST (06:00Z)", () =>
    expect(notifyMoment(s("before_1d"), due, created)).toEqual(new Date("2026-03-29T06:00:00Z")));
  it("before_7d is 08:00 Berlin seven days earlier (CET)", () =>
    expect(notifyMoment(s("before_7d"), due, created)).toEqual(new Date("2026-03-23T07:00:00Z")));
  it("custom returns the stored instant", () => {
    const at = new Date("2026-03-20T15:30:00Z");
    expect(notifyMoment(s("custom", at), due, created)).toEqual(at);
  });
  it("relative timing without due is null", () =>
    expect(notifyMoment(s("due_day"), null, created)).toBeNull());
  it("no channels → null", () =>
    expect(notifyMoment({ channels: [], timing: null, at: null }, due, created)).toBeNull());
});
