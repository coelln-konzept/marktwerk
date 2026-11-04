import { can, type Role } from "@marktwerk/core";
import type { AppointmentView } from "@/server/queries/appointments";

/**
 * What a role may see of a Termin's people and places: the contact block only with `contact:read`, the venue
 * as a link only with `venue:read` (plain text otherwise). The Termin itself needs `event:read`.
 */
export function terminAccess(role: Role, termin: Pick<AppointmentView, "contact">) {
  const showContact = can(role, "contact", "read");
  return {
    showContact,
    contact: showContact ? termin.contact : null,
    venueLink: can(role, "venue", "read"),
  };
}
