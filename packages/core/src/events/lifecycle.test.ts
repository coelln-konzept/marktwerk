import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  canTransition,
  EVENT_STATUSES,
  isEventStatus,
  requiresReason,
} from "./lifecycle";

describe("event lifecycle", () => {
  it("offers the agreed targets per status", () => {
    expect(allowedTransitions("draft")).toEqual(["planned", "confirmed", "cancelled"]);
    expect(allowedTransitions("planned")).toEqual(["confirmed", "cancelled", "draft"]);
    expect(allowedTransitions("confirmed")).toEqual(["live", "cancelled", "planned"]);
    expect(allowedTransitions("live")).toEqual(["completed"]);
    expect(allowedTransitions("completed")).toEqual(["closed"]);
    expect(allowedTransitions("closed")).toEqual([]);
    expect(allowedTransitions("cancelled")).toEqual(["draft"]);
  });

  it("never allows staying in the same status and only lists known statuses", () => {
    for (const from of EVENT_STATUSES) {
      const targets = allowedTransitions(from);
      expect(targets).not.toContain(from);
      expect(new Set(targets).size).toBe(targets.length);
      for (const to of targets) expect(EVENT_STATUSES).toContain(to);
    }
  });

  it("does not skip steps once an event is running", () => {
    expect(canTransition("confirmed", "completed")).toBe(false);
    expect(canTransition("live", "cancelled")).toBe(false);
    expect(canTransition("completed", "live")).toBe(false);
    expect(canTransition("closed", "draft")).toBe(false);
    expect(canTransition("draft", "live")).toBe(false);
  });

  it("allows the cancel-and-reopen round trip", () => {
    expect(canTransition("planned", "cancelled")).toBe(true);
    expect(canTransition("cancelled", "draft")).toBe(true);
    expect(canTransition("cancelled", "planned")).toBe(false);
  });

  it("requires a reason only for cancelling", () => {
    expect(EVENT_STATUSES.filter(requiresReason)).toEqual(["cancelled"]);
  });

  it("recognises status keys", () => {
    expect(isEventStatus("planned")).toBe(true);
    expect(isEventStatus("archived")).toBe(false);
    expect(isEventStatus(null)).toBe(false);
  });
});
