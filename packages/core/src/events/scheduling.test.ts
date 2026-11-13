import { describe, expect, it } from "vitest";
import {
  checkCandidates,
  endsOnFor,
  groupConsecutiveDates,
  type ScheduledEvent,
} from "./scheduling";

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

  it("gives no hint for a busy weekend at other venues (UT2-11: no weekend count)", () => {
    const existing = ["a", "b", "c", "d", "e"].map((id, i) => event(id, `v${i + 1}`, "2026-05-16"));
    const [check] = checkCandidates(
      [{ venueId: "v9", startsOn: "2026-05-16", endsOn: "2026-05-17" }],
      existing,
    );
    expect(check).toMatchObject({ holidays: [], venueConflicts: [], overlapsCandidate: null });
    expect(Object.keys(check ?? {})).not.toContain("weekendLoad");
  });
});

describe("groupConsecutiveDates", () => {
  it("merges a Saturday and Sunday into one two-day event", () => {
    expect(groupConsecutiveDates(["2026-11-15", "2026-11-14"], 1)).toEqual([
      { startsOn: "2026-11-14", durationDays: 2 },
    ]);
  });

  it("keeps gaps apart and drops duplicates", () => {
    expect(
      groupConsecutiveDates(["2026-11-14", "2026-11-14", "2026-11-21", "2026-11-22"], 1),
    ).toEqual([
      { startsOn: "2026-11-14", durationDays: 1 },
      { startsOn: "2026-11-21", durationDays: 2 },
    ]);
  });

  it("runs across month and year ends and the DST weekends", () => {
    expect(groupConsecutiveDates(["2026-10-31", "2026-11-01"], 1)).toEqual([
      { startsOn: "2026-10-31", durationDays: 2 },
    ]);
    expect(groupConsecutiveDates(["2026-12-31", "2027-01-01"], 1)).toEqual([
      { startsOn: "2026-12-31", durationDays: 2 },
    ]);
    // Clocks go forward on Sunday 2027-03-28.
    expect(groupConsecutiveDates(["2027-03-27", "2027-03-28"], 1)).toEqual([
      { startsOn: "2027-03-27", durationDays: 2 },
    ]);
  });

  it("never makes an event shorter than the preset", () => {
    // A two-day preset picked on Saturday alone still runs Saturday to Sunday.
    expect(groupConsecutiveDates(["2026-11-14"], 2)).toEqual([
      { startsOn: "2026-11-14", durationDays: 2 },
    ]);
    // Saturday and Sunday picked for a two-day preset: one event, not two overlapping ones.
    expect(groupConsecutiveDates(["2026-11-14", "2026-11-15"], 2)).toEqual([
      { startsOn: "2026-11-14", durationDays: 2 },
    ]);
    // A preset-length event that would run into the next picked day takes it in.
    expect(groupConsecutiveDates(["2026-11-14", "2026-11-16"], 3)).toEqual([
      { startsOn: "2026-11-14", durationDays: 3 },
    ]);
  });

  it("splits runs longer than the maximum", () => {
    const days = Array.from({ length: 16 }, (_, i) => endsOnFor("2026-07-01", i + 1));
    expect(groupConsecutiveDates(days, 1)).toEqual([
      { startsOn: "2026-07-01", durationDays: 14 },
      { startsOn: "2026-07-15", durationDays: 2 },
    ]);
  });
});
