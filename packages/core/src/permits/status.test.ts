import { describe, expect, it } from "vitest";
import {
  canTransitionPermit,
  eventPermitHealth,
  isOpenPermit,
  isUnfiled,
  PERMIT_STATUSES,
  PERMIT_TRANSITIONS,
  permitDisplayState,
  splitPermitTransitions,
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

describe("splitPermitTransitions", () => {
  it("makes the nearest forward step primary and never a backward step", () => {
    expect(splitPermitTransitions("not_started")).toEqual({
      primary: "preparing",
      secondary: ["applied", "granted"],
      menu: ["not_required"],
    });
    expect(splitPermitTransitions("preparing")).toEqual({
      primary: "applied",
      secondary: ["granted"],
      menu: ["not_started", "not_required"],
    });
    expect(splitPermitTransitions("applied")).toEqual({
      primary: "granted",
      secondary: ["rejected"],
      menu: ["preparing", "not_required"],
    });
  });

  it("offers going back from granted in the menu and replacing as the visible action", () => {
    expect(splitPermitTransitions("granted")).toEqual({
      primary: null,
      secondary: ["superseded"],
      menu: ["applied"],
    });
  });

  it("treats the road as forward from a rejected or not-required permit", () => {
    expect(splitPermitTransitions("rejected")).toEqual({
      primary: "preparing",
      secondary: ["applied", "superseded"],
      menu: ["not_required"],
    });
    expect(splitPermitTransitions("not_required").primary).toBe("not_started");
    expect(splitPermitTransitions("superseded")).toEqual({
      primary: null,
      secondary: [],
      menu: [],
    });
  });

  it("covers every allowed transition exactly once", () => {
    for (const status of PERMIT_STATUSES) {
      const { primary, secondary, menu } = splitPermitTransitions(status);
      const all = [...(primary ? [primary] : []), ...secondary, ...menu];
      expect([...all].sort()).toEqual([...PERMIT_TRANSITIONS[status]].sort());
    }
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

  it("warns while a permit can be acted on and the event is far away", () => {
    // Not filed, apply-by within the 30-day horizon.
    const due = {
      status: "preparing",
      applyBy: "2027-03-15",
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([granted, due], "2027-05-02", today)).toBe("warn");
    // Apply-by is today (horizon starts here) and exactly 30 days out (inclusive).
    expect(eventPermitHealth([{ ...due, applyBy: today }], "2027-05-02", today)).toBe("warn");
    expect(eventPermitHealth([{ ...due, applyBy: "2027-03-31" }], "2027-05-02", today)).toBe(
      "warn",
    );
    // No apply-by date: nobody can say it is not due.
    expect(eventPermitHealth([{ ...due, applyBy: null }], "2027-05-02", today)).toBe("warn");
  });

  it("stays ok for permits that are not due yet or already filed", () => {
    const later = {
      status: "not_started",
      applyBy: "2027-04-01", // 31 days out: beyond the horizon
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([granted, later], "2027-06-12", today)).toBe("ok");
    expect(eventPermitHealth([later], "2027-06-12", today, "2027-06-12", 60)).toBe("warn");
    const applied = {
      status: "applied",
      applyBy: "2027-02-01",
      expectedDecisionOn: "2027-03-15",
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([granted, applied], "2027-05-02", today)).toBe("ok");
    // Decision expected today: not past yet.
    expect(
      eventPermitHealth([{ ...applied, expectedDecisionOn: today }], "2027-05-02", today),
    ).toBe("ok");
    // Applied without a known decision date is just waiting too.
    expect(eventPermitHealth([{ ...applied, expectedDecisionOn: null }], "2027-05-02", today)).toBe(
      "ok",
    );
  });

  it("warns once the expected decision of an applied permit has passed", () => {
    const late = {
      status: "applied",
      applyBy: "2027-01-10",
      expectedDecisionOn: "2027-02-28",
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([late], "2027-05-02", today)).toBe("warn");
  });

  it("is critical within 14 days of the market for anything not in hand, filed or not", () => {
    const applied = {
      status: "applied",
      applyBy: "2027-02-01",
      expectedDecisionOn: "2027-03-15",
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([applied], "2027-03-15", today)).toBe("critical"); // day 14
    expect(eventPermitHealth([applied], "2027-03-16", today)).toBe("ok"); // day 15
    const later = {
      status: "not_started",
      applyBy: "2027-09-01",
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([later], "2027-03-10", today)).toBe("critical");
  });

  it("counts the horizon in calendar days across the DST change", () => {
    const due = {
      status: "not_started",
      applyBy: "2026-11-24", // 30 days after 25.10.2026, the day Berlin leaves DST
      validUntil: null,
      required: true,
    } as const;
    expect(eventPermitHealth([due], "2027-04-10", "2026-10-25")).toBe("warn");
    expect(eventPermitHealth([{ ...due, applyBy: "2026-11-25" }], "2027-04-10", "2026-10-25")).toBe(
      "ok",
    );
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

  it("is ok when the permit runs out after the event's last day, warns when it ends within a multi-day event, critical if it ends before the start", () => {
    const expiring = {
      status: "granted",
      applyBy: null,
      validUntil: "2027-04-15",
      required: true,
    } as const;
    expect(eventPermitHealth([expiring], "2027-04-10", today)).toBe("ok");
    expect(eventPermitHealth([expiring], "2027-04-14", today, "2027-04-16")).toBe("warn");
    expect(eventPermitHealth([expiring], "2027-05-02", today)).toBe("critical");
  });
});
