import { describe, expect, it } from "vitest";
import type { EventPermitInput } from "../permits/status";
import { shouldAutoConfirm } from "./auto-confirm";

const today = "2026-10-22";
const planned = { status: "planned", startsOn: "2026-12-12" } as const;
const permit = (over: Partial<EventPermitInput> = {}): EventPermitInput => ({
  status: "granted",
  applyBy: null,
  validUntil: null,
  required: true,
  ...over,
});

describe("shouldAutoConfirm", () => {
  it("confirms a planned event when its only required permit is granted", () => {
    expect(shouldAutoConfirm(planned, [permit()], today)).toBe(true);
  });

  it("needs every required permit to be granted", () => {
    expect(shouldAutoConfirm(planned, [permit(), permit({ status: "applied" })], today)).toBe(
      false,
    );
    expect(shouldAutoConfirm(planned, [permit(), permit({ status: "granted" })], today)).toBe(true);
  });

  it("stays planned without any required permit", () => {
    expect(shouldAutoConfirm(planned, [], today)).toBe(false);
    expect(shouldAutoConfirm(planned, [permit({ required: false })], today)).toBe(false);
    expect(shouldAutoConfirm(planned, [permit({ status: "not_required" })], today)).toBe(false);
  });

  it("ignores permits that are not required for this event", () => {
    expect(
      shouldAutoConfirm(
        planned,
        [permit(), permit({ status: "not_started", required: false })],
        today,
      ),
    ).toBe(true);
    expect(shouldAutoConfirm(planned, [permit(), permit({ status: "not_required" })], today)).toBe(
      true,
    );
  });

  it("does not count rejected, superseded or expired permits", () => {
    expect(shouldAutoConfirm(planned, [permit({ status: "rejected" })], today)).toBe(false);
    expect(shouldAutoConfirm(planned, [permit({ status: "superseded" })], today)).toBe(false);
    expect(shouldAutoConfirm(planned, [permit({ validUntil: "2026-10-01" })], today)).toBe(false);
  });

  it("counts a permit that is about to expire only if it still reaches the event", () => {
    expect(shouldAutoConfirm(planned, [permit({ validUntil: "2026-12-31" })], today)).toBe(true);
    expect(shouldAutoConfirm(planned, [permit({ validUntil: "2026-11-30" })], today)).toBe(false);
  });

  it("only touches planned events", () => {
    for (const status of [
      "draft",
      "confirmed",
      "live",
      "completed",
      "closed",
      "cancelled",
    ] as const) {
      expect(shouldAutoConfirm({ status, startsOn: planned.startsOn }, [permit()], today)).toBe(
        false,
      );
    }
  });
});
