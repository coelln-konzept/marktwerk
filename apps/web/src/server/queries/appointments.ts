import "server-only";
import { clockTime } from "@marktwerk/core";
import { appointment, contact, venue } from "@marktwerk/db/schema";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { isUuid } from "./venues";

/** A Termin as the screens show it; the contact is the saved one or the typed one (`id` null). */
export type AppointmentView = {
  id: string;
  title: string;
  onDate: string;
  startsAt: string | null;
  endsAt: string | null;
  venueId: string | null;
  venueName: string | null;
  locationText: string | null;
  notes: string | null;
  contact: { id: string | null; name: string; phone: string | null; email: string | null } | null;
};

const select = () =>
  db
    .select({
      id: appointment.id,
      title: appointment.title,
      onDate: appointment.onDate,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      venueId: appointment.venueId,
      venueName: venue.name,
      locationText: appointment.locationText,
      notes: appointment.notes,
      savedContactId: contact.id,
      savedName: contact.name,
      savedPhone: contact.phoneE164,
      savedEmail: contact.email,
      typedName: appointment.contactName,
      typedPhone: appointment.contactPhoneE164,
      typedEmail: appointment.contactEmail,
    })
    .from(appointment)
    .leftJoin(venue, eq(venue.id, appointment.venueId))
    .leftJoin(contact, eq(contact.id, appointment.contactId));

type Row = Awaited<ReturnType<ReturnType<typeof select>["limit"]>>[number];

function view(row: Row): AppointmentView {
  const contactView: AppointmentView["contact"] = row.savedContactId
    ? {
        id: row.savedContactId,
        name: row.savedName ?? "",
        phone: row.savedPhone,
        email: row.savedEmail,
      }
    : row.typedName
      ? { id: null, name: row.typedName, phone: row.typedPhone, email: row.typedEmail }
      : null;
  return {
    id: row.id,
    title: row.title,
    onDate: row.onDate,
    startsAt: clockTime(row.startsAt),
    endsAt: clockTime(row.endsAt),
    venueId: row.venueId,
    venueName: row.venueName,
    locationText: row.locationText,
    notes: row.notes,
    contact: contactView,
  };
}

/** One live (not archived) Termin, or null. */
export async function getAppointment(id: string): Promise<AppointmentView | null> {
  if (!isUuid(id)) return null;
  const [row] = await select()
    .where(and(eq(appointment.id, id), isNull(appointment.archivedAt)))
    .limit(1);
  return row ? view(row) : null;
}

/** Live Termine from `from` to `to` (inclusive ISO dates), by day, then all-day first, then start time. */
export async function listAppointmentsBetween(
  from: string,
  to: string,
): Promise<AppointmentView[]> {
  const rows = await select()
    .where(
      and(
        gte(appointment.onDate, from),
        lte(appointment.onDate, to),
        isNull(appointment.archivedAt),
      ),
    )
    .orderBy(
      asc(appointment.onDate),
      sql`${appointment.startsAt} asc nulls first`,
      asc(appointment.title),
    )
    .limit(500);
  return rows.map(view);
}

/** Live Termine of one day. */
export async function listAppointmentsOn(day: string): Promise<AppointmentView[]> {
  return listAppointmentsBetween(day, day);
}
