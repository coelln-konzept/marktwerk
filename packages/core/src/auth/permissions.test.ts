import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("can", () => {
  it("lets owners do everything", () => {
    expect(can("owner", "user", "manage")).toBe(true);
    expect(can("owner", "settings", "manage")).toBe(true);
  });

  it("keeps user management away from managers", () => {
    expect(can("manager", "user", "manage")).toBe(false);
    expect(can("manager", "market", "delete")).toBe(true);
  });

  it("limits staff and field crew", () => {
    expect(can("staff", "task", "assign")).toBe(true);
    expect(can("staff", "venue", "write")).toBe(false);
    expect(can("field", "task", "write")).toBe(true);
    expect(can("field", "permit", "read")).toBe(false);
  });

  it("denies anonymous users", () => {
    expect(can(null, "task", "read")).toBe(false);
  });
});
