import "server-only";
import { contact, event, locationAgreement, venue } from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { isUuid } from "./venues";

type EventStatusKey = typeof event.$inferSelect.status;

export type AgreementDate = {
  date: string;
  /** The event generated for this date, if there is one (not archived). */
  event: { id: string; name: string; status: EventStatusKey } | null;
};

export type VenueAgreement = Awaited<ReturnType<typeof listVenueAgreements>>[number];

async function withDates<T extends { id: string; fixedDates: string[] }>(rows: T[]) {
  if (rows.length === 0) return [];
  const linked = await db
    .select({
      agreementId: event.locationAgreementId,
      id: event.id,
      name: event.name,
      status: event.status,
      startsOn: event.startsOn,
    })
    .from(event)
    .where(
      and(
        inArray(
          event.locationAgreementId,
          rows.map((r) => r.id),
        ),
        isNull(event.archivedAt),
      ),
    )
    .orderBy(asc(event.startsOn));
  return rows.map((row) => {
    const dates: AgreementDate[] = row.fixedDates.map((date) => {
      const found = linked.find((e) => e.agreementId === row.id && e.startsOn === date);
      return {
        date,
        event: found ? { id: found.id, name: found.name, status: found.status } : null,
      };
    });
    return {
      ...row,
      dates,
      /** Fixed dates that have no event yet: what "Termine erzeugen" would create. */
      pending: dates.filter((d) => !d.event).map((d) => d.date),
    };
  });
}

const columns = {
  id: locationAgreement.id,
  venueId: locationAgreement.venueId,
  counterpartyContactId: locationAgreement.counterpartyContactId,
  counterpartyName: contact.name,
  validFrom: locationAgreement.validFrom,
  validUntil: locationAgreement.validUntil,
  fixedDates: locationAgreement.fixedDates,
  terms: locationAgreement.terms,
};

/** Agreements of a venue (not archived), newest validity first, with the events generated so far. */
export async function listVenueAgreements(venueId: string) {
  if (!isUuid(venueId)) return [];
  const rows = await db
    .select(columns)
    .from(locationAgreement)
    .leftJoin(contact, eq(contact.id, locationAgreement.counterpartyContactId))
    .where(and(eq(locationAgreement.venueId, venueId), isNull(locationAgreement.archivedAt)))
    .orderBy(asc(locationAgreement.validFrom), asc(locationAgreement.validUntil));
  return withDates(rows);
}

/** One agreement with its venue's name (for the "Termine erzeugen" page). */
export async function getAgreement(id: string) {
  if (!isUuid(id)) return null;
  const rows = await db
    .select({ ...columns, venueName: venue.name })
    .from(locationAgreement)
    .innerJoin(venue, eq(venue.id, locationAgreement.venueId))
    .leftJoin(contact, eq(contact.id, locationAgreement.counterpartyContactId))
    .where(and(eq(locationAgreement.id, id), isNull(locationAgreement.archivedAt)));
  return (await withDates(rows))[0] ?? null;
}

export type ContactOption = { id: string; name: string };

/** Contacts to pick the counterparty from (not archived). */
export async function listContactOptions(): Promise<ContactOption[]> {
  return db
    .select({ id: contact.id, name: contact.name })
    .from(contact)
    .where(isNull(contact.archivedAt))
    .orderBy(asc(contact.name));
}
