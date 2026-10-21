import { describe, expect, it } from "vitest";
import {
  canTransitionPermit,
  eventPermitHealth,
  isOpenPermit,
  isUnfiled,
  PERMIT_STATUSES,
  PERMIT_TRANSITIONS,
  permitDisplayState,
} from "./status";

describe("permit transitions", () => {
  it("follows not_started → preparing → applied → granted / rejected", () => {
    expect(canTransitionPermit("not_started", "preparing")).toBe(true);
    expect(canTransitionPermit("preparing", "applied")).toBe(true);
    expect(canTransitionPermit("applied", "granted")).toBe(true);
    expect(canTransitionPermit("applied", "rejected")).toBe(true);
  });

  it("does not allow skipping the authority or leaving superseded", () => {
    expect(canTransitionPermit("not_started", "rejected")).toBe(false);
    expect(canTransitionPermit("granted", "rejected")).toBe(false);
    expect(PERMIT_TRANSITIONS.superseded).toEqual([]);
  });

  it("never lists a status as its own successor", () => {
    for (const status of PERMIT_STATUSES) {
      expect(PERMIT_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it("knows which statuses are still to be filed or open", () => {
    expect(isUnfiled("not_started")).toBe(true);
    expect(isUnfiled("applied")).toBe(false);
    expect(isOpenPermit("applied")).toBe(true);
    expect(isOpenPermit("granted")).toBe(false);
  });
});

describe("permitDisplayState", () => {
  const today = "2027-01-10";
  it("maps the plain statuses", () => {
    expect(permitDisplayState({ status: "not_started", validUntil: null }, today)).toBe("missing");
    expect(permitDisplayState({ status: "preparing", validUntil: null }, today)).toBe("preparing");
    expect(permitDisplayState({ status: "applied", validUntil: null }, today)).toBe("applied");
    expect(permitDisplayState({ status: "rejected", validUntil: null }, today)).toBe("rejected");
  });

  it("derives expiring and expired from the validity of a granted permit", () => {
    expect(permitDisplayState({ status: "granted", validUntil: null }, today)).toBe("granted");
    expect(permitDisplayState({ status: "granted", validUntil: "2027-12-31" }, today)).toBe(
      "granted",
    );
    expect(permitDisplayState({ status: "granted", validUntil: "2027-03-01" }, today)).toBe(
      "expiring",
    );
    expect(permitDisplayState({ status: "granted", validUntil: "2027-01-10" }, today)).toBe(
      "expiring",
    );
    expect(permitDisplayState({ status: "granted", validUntil: "2027-01-09" }, today)).toBe(
      "expired",
    );
  });
});

describe("eventPermitHealth", () => {
  const today = "2027-03-01";
  const granted = { status: "granted", applyBy: null, validUntil: null, required: true } as const;

  it("is null without any permit and ok when all are granted", () => {
    expect(eventPermitHealth([], "2027-05-02", today)).toBeNull();
    expect(eventPermitHealth([granted, granted], "2027-05-02", today)).toBe("ok");
  });

  it("ignores permits an event does not need", () => {
    const open = {
      status: "not_started",
      applyBy: "2027-01-01",
      validUntil: null,
      required: false,
    } as const;
    expect(eventPermitHealth([granted, open], "2027-05-02", today)).toBe("ok");
    const notRequired = { ...granted, status: "not_required" } as const;
    expect(eventPermitHealth([notRequired], "2027-05-02", today)).toBe("ok");
  });

  it("warns while something is open and the event is far away", () => {
    const applied = {
      status: "applied",
      applyBy: "2027-02-01",
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([granted, applied], "2027-05-02", today)).toBe("warn");
  });

  it("is critical when an application is overdue, rejected, expired or the event is close", () => {
    const overdue = {
      status: "not_started",
      applyBy: "2027-02-01",
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([overdue], "2027-05-02", today)).toBe("critical");
    const rejected = {
      status: "rejected",
      applyBy: null,
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([rejected], "2027-05-02", today)).toBe("critical");
    const expired = {
      status: "granted",
      applyBy: null,
      validUntil: "2027-02-01",
      required: true,
    } as const;
    expect(eventPermitHealth([expired], "2027-05-02", today)).toBe("critical");
    const pending = {
      status: "preparing",
      applyBy: "2027-03-20",
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([pending], "2027-03-10", today)).toBe("critical");
  });

  it("warns for a permit that runs out after the event and is critical if it ends before", () => {
    const expiring = {
      status: "granted",
      applyBy: null,
      validUntil: "2027-04-15",
      required: true,
    } as const;
    expect(eventPermitHealth([expiring], "2027-04-10", today)).toBe("warn");
    expect(eventPermitHealth([expiring], "2027-05-02", today)).toBe("critical");
  });
});
