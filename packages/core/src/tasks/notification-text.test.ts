import { describe, expect, it } from "vitest";
import { assignedText, rolledOverText, seasonContextName, taskLink } from "./notification-text";

describe("season tasks in notification texts", () => {
  it("names the market and the season where an event task names its event", () => {
    const eventName = seasonContextName("Flohmarkt Bilk", 2027);
    expect(eventName).toBe("Flohmarkt Bilk · Saison 2027");
    expect(assignedText({ title: "Termine planen", eventName }, "Anna").body).toBe(
      "Anna hat dir die Aufgabe zugewiesen (Flohmarkt Bilk · Saison 2027).",
    );
    expect(rolledOverText({ title: "Termine planen", eventName }, 1).body).toContain(
      "(Flohmarkt Bilk · Saison 2027)",
    );
  });

  it("opens a season task on the Übersicht, as it has no event board (the global board is hidden)", () => {
    expect(taskLink("t1", null)).toBe("/?aufgabe=t1");
    expect(taskLink("t1", "e1")).toBe("/veranstaltungen/e1/board?aufgabe=t1");
  });
});
