import { describe, expect, it } from "vitest";
import { assignedText, rolledOverText, taskLink } from "./notification-text";

describe("notification texts", () => {
  it("names the event where the task has one", () => {
    const eventName = "Flohmarkt Bilk";
    expect(assignedText({ title: "Halteverbot beantragen", eventName }, "Anna").body).toBe(
      "Anna hat dir die Aufgabe zugewiesen (Flohmarkt Bilk).",
    );
    expect(rolledOverText({ title: "Halteverbot beantragen", eventName }, 1).body).toContain(
      "(Flohmarkt Bilk)",
    );
    expect(assignedText({ title: "Versicherung", eventName: null }, "Anna").body).toBe(
      "Anna hat dir die Aufgabe zugewiesen.",
    );
  });

  it("opens a task without an event on the Übersicht (the global board is hidden)", () => {
    expect(taskLink("t1", null)).toBe("/?aufgabe=t1");
    expect(taskLink("t1", "e1")).toBe("/veranstaltungen/e1/board?aufgabe=t1");
  });
});
