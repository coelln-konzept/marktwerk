import { can, type Role } from "@marktwerk/core";
import type { AppointmentView } from "@/server/queries/appointments";

/**
 * What a role may see of a Besprechung's people and places: the contact block only with `contact:read`, the venue
 * as a link only with `venue:read` (plain text otherwise). The Besprechung itself needs `appointment:read` (office only).
 */
export function appointmentAccess(role: Role, appointment: Pick<AppointmentView, "contact">) {
  const showContact = can(role, "contact", "read");
  return {
    showContact,
    contact: showContact ? appointment.contact : null,
    venueLink: can(role, "venue", "read"),
  };
}
