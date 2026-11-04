import { describe, expect, it } from "vitest";
import { terminAccess } from "@/components/appointments/termin-privacy";

const contact = { id: "c1", name: "Frau Meier", phone: "+49221123", email: "m@x.de" };

describe("terminAccess", () => {
  it("shows contact and venue link to roles with contact and venue read", () => {
    for (const role of ["owner", "manager", "staff"] as const) {
      expect(terminAccess(role, { contact })).toEqual({
        showContact: true,
        contact,
        venueLink: true,
      });
    }
  });

  it("hides the contact block and the venue link from field users", () => {
    expect(terminAccess("field", { contact })).toEqual({
      showContact: false,
      contact: null,
      venueLink: false,
    });
  });
});
