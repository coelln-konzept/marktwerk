import { describe, expect, it } from "vitest";
import { upcomingWeekend } from "./weekend";

describe("upcomingWeekend", () => {
  it("picks the coming Saturday and Sunday on weekdays", () => {
    expect(upcomingWeekend("2026-10-21")).toEqual({ saturday: "2026-10-24", sunday: "2026-10-25" }); // Wed
    expect(upcomingWeekend("2026-10-19")).toEqual({ saturday: "2026-10-24", sunday: "2026-10-25" }); // Mon
    expect(upcomingWeekend("2026-10-23")).toEqual({ saturday: "2026-10-24", sunday: "2026-10-25" }); // Fri
  });

  it("keeps the current weekend on Saturday and Sunday", () => {
    expect(upcomingWeekend("2026-10-24")).toEqual({ saturday: "2026-10-24", sunday: "2026-10-25" });
    expect(upcomingWeekend("2026-10-25")).toEqual({ saturday: "2026-10-24", sunday: "2026-10-25" });
  });

  it("crosses month, year and DST boundaries", () => {
    expect(upcomingWeekend("2026-12-30")).toEqual({ saturday: "2027-01-02", sunday: "2027-01-03" });
    expect(upcomingWeekend("2026-03-26")).toEqual({ saturday: "2026-03-28", sunday: "2026-03-29" }); // spring forward
    expect(upcomingWeekend("2026-10-26")).toEqual({ saturday: "2026-10-31", sunday: "2026-11-01" });
  });
});
