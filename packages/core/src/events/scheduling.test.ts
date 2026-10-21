import { describe, expect, it } from "vitest";
import { checkCandidates, endsOnFor, type ScheduledEvent } from "./scheduling";

const event = (
  id: string,
  venueId: string,
  startsOn: string,
  endsOn = startsOn,
): ScheduledEvent => ({
  id,
  name: `Event ${id}`,
  venueId,
  startsOn,
  endsOn,
});

describe("checkCandidates", () => {
  it("computes the last day from the preset's duration", () => {
    expect(endsOnFor("2026-08-21", 3)).toBe("2026-08-23");
    expect(() => endsOnFor("2026-08-21", 0)).toThrow();
  });

  it("flags NRW holidays, including Whit Sunday for planning", () => {
    const [check] = checkCandidates(
      [{ venueId: "v1", startsOn: "2026-05-24", endsOn: "2026-05-24" }],
      [],
    );
    expect(check?.holidays.map((h) => h.key)).toEqual(["whit_sunday"]);
  });

  it("flags a venue that already has an event that day", () => {
    const [check] = checkCandidates(
      [{ venueId: "v1", startsOn: "2026-06-07", endsOn: "2026-06-07" }],
      [event("a", "v1", "2026-06-06", "2026-06-07"), event("b", "v2", "2026-06-07")],
    );
    expect(check?.venueConflicts).toEqual([{ id: "a", name: "Event a", startsOn: "2026-06-06" }]);
  });

  it("flags overlapping candidates at the same venue within one batch", () => {
    const checks = checkCandidates(
      [
        { venueId: "v1", startsOn: "2026-06-07", endsOn: "2026-06-07" },
        { venueId: "v1", startsOn: "2026-06-06", endsOn: "2026-06-07" },
      ],
      [],
    );
    expect(checks.map((c) => c.overlapsCandidate)).toEqual([null, "2026-06-06"]);
  });

  it("counts existing events and earlier candidates against the weekend cap of 4", () => {
    const existing = [
      event("a", "v1", "2026-05-16"),
      event("b", "v2", "2026-05-16"),
      event("c", "v3", "2026-05-17"),
    ];
    const checks = checkCandidates(
      [
        { venueId: "v4", startsOn: "2026-05-17", endsOn: "2026-05-17" },
        { venueId: "v5", startsOn: "2026-05-16", endsOn: "2026-05-16" },
      ],
      existing,
    );
    expect(checks.map((c) => [c.startsOn, c.weekendLoad[0]?.count, c.overWeekendCap])).toEqual([
      ["2026-05-16", 4, false],
      ["2026-05-17", 5, true],
    ]);
  });

  it("does not count weekday events against a weekend", () => {
    const [check] = checkCandidates(
      [{ venueId: "v1", startsOn: "2026-05-13", endsOn: "2026-05-13" }],
      [],
    );
    expect(check?.weekendLoad).toEqual([]);
    expect(check?.overWeekendCap).toBe(false);
  });
});
