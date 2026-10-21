import { describe, expect, it } from "vitest";
import {
  ESCALATION_ROLLOVERS,
  escalationDedupeKey,
  isRolloverCandidate,
  rolloverDedupeKey,
  shouldEscalate,
} from "./rollover";

const TODAY = "2026-10-21";
const base = {
  status: "todo" as const,
  dueAt: new Date("2026-10-20T07:00:00Z"),
  lastRolledAt: null,
};

describe("isRolloverCandidate", () => {
  it("carries over open tasks whose due day has passed", () => {
    expect(isRolloverCandidate(base, TODAY)).toBe(true);
    for (const status of ["in_progress", "waiting_external", "blocked"] as const)
      expect(isRolloverCandidate({ ...base, status }, TODAY)).toBe(true);
  });

  it("leaves tasks due today or later alone", () => {
    expect(isRolloverCandidate({ ...base, dueAt: new Date("2026-10-21T07:00:00Z") }, TODAY)).toBe(
      false,
    );
    expect(isRolloverCandidate({ ...base, dueAt: new Date("2026-10-30T07:00:00Z") }, TODAY)).toBe(
      false,
    );
  });

  it("uses the Berlin day: due 00:30 today Berlin is not yet overdue", () => {
    expect(isRolloverCandidate({ ...base, dueAt: new Date("2026-10-20T22:30:00Z") }, TODAY)).toBe(
      false,
    );
    expect(isRolloverCandidate({ ...base, dueAt: new Date("2026-10-19T22:30:00Z") }, TODAY)).toBe(
      true,
    );
  });

  it("ignores finished tasks and tasks without a due date", () => {
    for (const status of ["done", "skipped", "cancelled"] as const)
      expect(isRolloverCandidate({ ...base, status }, TODAY)).toBe(false);
    expect(isRolloverCandidate({ ...base, dueAt: null }, TODAY)).toBe(false);
  });

  it("counts once per Berlin day, so a second run changes nothing", () => {
    // rolled at 00:05 Berlin today (= 22:05Z yesterday)
    expect(
      isRolloverCandidate({ ...base, lastRolledAt: new Date("2026-10-20T22:05:00Z") }, TODAY),
    ).toBe(false);
    // rolled yesterday → counts again today
    expect(
      isRolloverCandidate({ ...base, lastRolledAt: new Date("2026-10-19T22:05:00Z") }, TODAY),
    ).toBe(true);
  });
});

describe("escalation", () => {
  it("tells the manager when the count reaches 3, not before and not every night after", () => {
    expect(ESCALATION_ROLLOVERS).toBe(3);
    expect(shouldEscalate(2)).toBe(false);
    expect(shouldEscalate(3)).toBe(true);
    expect(shouldEscalate(4)).toBe(false);
  });

  it("derives deterministic dedupe keys per task and count", () => {
    expect(rolloverDedupeKey("t1", 2)).toBe("task:t1:rolled-over:2");
    expect(escalationDedupeKey("t1", 3)).toBe("task:t1:escalated:3");
    expect(rolloverDedupeKey("t1", 2)).not.toBe(rolloverDedupeKey("t1", 3));
  });
});
