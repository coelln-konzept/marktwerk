import { can, type Role } from "@marktwerk/core";
import { describe, expect, it } from "vitest";
import { appointmentAccess } from "@/components/appointments/appointment-privacy";

const contact = { id: "c1", name: "Frau Meier", phone: "+49221123", email: "m@x.de" };
const OFFICE: Role[] = ["owner", "manager"];

describe("appointmentAccess", () => {
  it("shows contact and venue link to the office roles", () => {
    for (const role of OFFICE) {
      expect(appointmentAccess(role, { contact })).toEqual({
        showContact: true,
        contact,
        venueLink: true,
      });
    }
  });

  it("is only ever asked for roles that may write events, and all of those may read contacts and venues", () => {
    // Besprechungen are office-only (event write). Every such role currently has contact and venue read,
    // so the gating below is a guard for a future role that can write events but not read contacts.
    for (const role of ["owner", "manager", "staff", "field"] as const) {
      if (!can(role, "event", "write")) continue;
      expect(can(role, "contact", "read")).toBe(true);
      expect(can(role, "venue", "read")).toBe(true);
    }
  });

  it("still hides the contact block and the venue link from a role without those reads", () => {
    expect(appointmentAccess("field", { contact })).toEqual({
      showContact: false,
      contact: null,
      venueLink: false,
    });
  });
});
