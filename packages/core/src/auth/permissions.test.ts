import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("can", () => {
  it("lets owners do everything", () => {
    expect(can("owner", "user", "manage")).toBe(true);
    expect(can("owner", "finance", "write")).toBe(true);
  });

  it("keeps user management away from managers but gives them team and finance", () => {
    expect(can("manager", "user", "manage")).toBe(false);
    expect(can("manager", "event", "delete")).toBe(true);
    expect(can("manager", "team", "manage")).toBe(true);
    expect(can("manager", "finance", "write")).toBe(true);
  });

  it("keeps finance and other people's hours away from staff", () => {
    expect(can("staff", "task", "assign")).toBe(true);
    expect(can("staff", "venue", "write")).toBe(false);
    expect(can("staff", "finance", "read")).toBe(false);
    expect(can("staff", "team", "read")).toBe(false);
  });

  it("gives office staff the appointment grant and keeps it from field users", () => {
    expect(can("owner", "appointment", "delete")).toBe(true);
    expect(can("manager", "appointment", "write")).toBe(true);
    expect(can("staff", "appointment", "read")).toBe(true);
    expect(can("staff", "appointment", "write")).toBe(true);
    expect(can("staff", "appointment", "delete")).toBe(true);
    // Tasks: staff may delete (user test 2, D2-6), field users may not.
    expect(can("staff", "task", "delete")).toBe(true);
    expect(can("field", "task", "delete")).toBe(false);
    expect(can("field", "appointment", "read")).toBe(false);
    expect(can("field", "appointment", "write")).toBe(false);
  });

  it("limits field users to events and tasks", () => {
    expect(can("field", "task", "write")).toBe(true);
    expect(can("field", "event", "read")).toBe(true);
    expect(can("field", "permit", "read")).toBe(false);
    expect(can("field", "vendor", "read")).toBe(false);
  });

  it("gives the company-wide notification center to owner and manager only", () => {
    expect(can("owner", "notification", "manage")).toBe(true);
    expect(can("manager", "notification", "read")).toBe(true);
    expect(can("manager", "notification", "manage")).toBe(true);
    expect(can("staff", "notification", "read")).toBe(false);
    expect(can("field", "notification", "read")).toBe(false);
  });

  it("denies anonymous users", () => {
    expect(can(null, "task", "read")).toBe(false);
  });
});
