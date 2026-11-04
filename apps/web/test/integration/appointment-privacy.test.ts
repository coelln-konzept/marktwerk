import { describe, expect, it } from "vitest";
import { appointmentAccess } from "@/components/appointments/appointment-privacy";

const contact = { id: "c1", name: "Frau Meier", phone: "+49221123", email: "m@x.de" };

describe("appointmentAccess", () => {
  it("shows contact and venue link to roles with contact and venue read", () => {
    for (const role of ["owner", "manager", "staff"] as const) {
      expect(appointmentAccess(role, { contact })).toEqual({
        showContact: true,
        contact,
        venueLink: true,
      });
    }
  });

  it("hides the contact block and the venue link from field users", () => {
    expect(appointmentAccess("field", { contact })).toEqual({
      showContact: false,
      contact: null,
      venueLink: false,
    });
  });
});
