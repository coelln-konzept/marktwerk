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

  it("limits field users to events and tasks", () => {
    expect(can("field", "task", "write")).toBe(true);
    expect(can("field", "event", "read")).toBe(true);
    expect(can("field", "permit", "read")).toBe(false);
    expect(can("field", "vendor", "read")).toBe(false);
  });

  it("denies anonymous users", () => {
    expect(can(null, "task", "read")).toBe(false);
  });
});
