import { describe, expect, it } from "vitest";
import { isPermitHistory, permitCoversApplication } from "./event-state";
import { eventPermitHealth, PERMIT_STATUSES, permitStateForEvent } from "./status";

describe("permitCoversApplication", () => {
  it("is true once the permit is applied for or granted, false otherwise", () => {
    expect(PERMIT_STATUSES.filter(permitCoversApplication)).toEqual(["applied", "granted"]);
  });
});

describe("permitStateForEvent", () => {
  const event = { endsOn: "2026-11-01" };

  it("a one-day permit valid exactly on the market day is granted for that market", () => {
    const p = { status: "granted" as const, validUntil: "2026-11-01" };
    expect(permitStateForEvent(p, event, "2026-10-22")).toBe("granted");
  });

  it("covers a permit that outlasts the event even when it ends soon", () => {
    const p = { status: "granted" as const, validUntil: "2026-11-05" };
    expect(permitStateForEvent(p, event, "2026-10-22")).toBe("granted");
  });

  it("stays expiring when the permit ends before the event's last day", () => {
    const p = { status: "granted" as const, validUntil: "2026-10-31" };
    expect(permitStateForEvent(p, event, "2026-10-22")).toBe("expiring");
  });

  it("a permit that ran out after its (past) event is still granted for that event", () => {
    const p = { status: "granted" as const, validUntil: "2026-11-01" };
    expect(permitStateForEvent(p, event, "2026-11-20")).toBe("granted");
  });

  it("a permit that ran out before the event is expired", () => {
    const p = { status: "granted" as const, validUntil: "2026-10-01" };
    expect(permitStateForEvent(p, event, "2026-10-22")).toBe("expired");
  });

  it("other statuses are untouched", () => {
    expect(permitStateForEvent({ status: "applied", validUntil: "2026-11-01" }, event, "x")).toBe(
      "applied",
    );
    expect(permitStateForEvent({ status: "not_started", validUntil: null }, event, "x")).toBe(
      "missing",
    );
  });

  it("works across a multi-day event: the last day decides", () => {
    const p = { status: "granted" as const, validUntil: "2026-11-01" };
    expect(permitStateForEvent(p, { endsOn: "2026-11-02" }, "2026-10-22")).toBe("expiring");
    expect(permitStateForEvent(p, { endsOn: "2026-11-01" }, "2026-10-22")).toBe("granted");
  });

  it("is plain date arithmetic: the clock change on 2026-10-25 changes nothing", () => {
    const p = { status: "granted" as const, validUntil: "2026-10-25" };
    expect(permitStateForEvent(p, { endsOn: "2026-10-25" }, "2026-10-24")).toBe("granted");
  });
});

describe("eventPermitHealth with the event's last day", () => {
  it("is ok for a one-day permit valid on the market day", () => {
    const p = {
      status: "granted" as const,
      applyBy: null,
      validUntil: "2026-11-01",
      required: true,
    };
    expect(eventPermitHealth([p], "2026-11-01", "2026-10-22", "2026-11-01")).toBe("ok");
  });

  it("stays critical when the permit ends before the event starts", () => {
    const p = {
      status: "granted" as const,
      applyBy: null,
      validUntil: "2026-10-30",
      required: true,
    };
    expect(eventPermitHealth([p], "2026-11-01", "2026-10-22", "2026-11-01")).toBe("critical");
  });
});

describe("isPermitHistory", () => {
  it("expired with only past events is history", () => {
    expect(isPermitHistory({ state: "expired", linkedEvents: 1, upcomingEvents: 0 })).toBe(true);
  });
  it("expired with an upcoming event is still a warning", () => {
    expect(isPermitHistory({ state: "expired", linkedEvents: 2, upcomingEvents: 1 })).toBe(false);
  });
  it("expired without any linked event stays a warning", () => {
    expect(isPermitHistory({ state: "expired", linkedEvents: 0, upcomingEvents: 0 })).toBe(false);
  });
  it("other states are never history", () => {
    expect(isPermitHistory({ state: "granted", linkedEvents: 1, upcomingEvents: 0 })).toBe(false);
  });
});
