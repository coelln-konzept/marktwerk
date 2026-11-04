import { isIsoDate } from "../dates/calendar";
import { clockTime } from "../tasks/due";
import { isValidEmail } from "../text/email";

/** What the Termin form sends: plain strings, blank means "not set". */
export type AppointmentDraft = {
  title: string;
  onDate: string;
  startsAt: string | null;
  endsAt: string | null;
  venueId: string | null;
  locationText: string | null;
  notes: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  saveContact: boolean;
};

export type AppointmentProblem =
  | "title_required"
  | "date_invalid"
  | "end_without_start"
  | "end_before_start"
  | "time_invalid"
  | "two_locations"
  | "contact_name_required"
  | "email_invalid";

const clean = (value: string | null | undefined) => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

/**
 * First problem of a Termin draft, or null when it is fine. Strings are trimmed (blank = not set).
 * A Termin lies within one day (no overnight: the end must be after the start). With a saved contact
 * (`contactId`) the inline contact fields are ignored.
 */
export function checkAppointment(d: AppointmentDraft): AppointmentProblem | null {
  if (clean(d.title) === null) return "title_required";
  if (!isIsoDate(d.onDate?.trim())) return "date_invalid";

  const rawStart = clean(d.startsAt);
  const rawEnd = clean(d.endsAt);
  const start = rawStart === null ? null : clockTime(rawStart);
  const end = rawEnd === null ? null : clockTime(rawEnd);
  if ((rawStart !== null && start === null) || (rawEnd !== null && end === null))
    return "time_invalid";
  if (end !== null && start === null) return "end_without_start";
  if (start !== null && end !== null && end <= start) return "end_before_start";

  if (clean(d.venueId) !== null && clean(d.locationText) !== null) return "two_locations";

  if (clean(d.contactId) === null) {
    const name = clean(d.contactName);
    const phone = clean(d.contactPhone);
    const email = clean(d.contactEmail);
    if (name === null && (phone !== null || email !== null)) return "contact_name_required";
    if (email !== null && !isValidEmail(email)) return "email_invalid";
  }
  return null;
}
