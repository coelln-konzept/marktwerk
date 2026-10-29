import "server-only";
import { matchesAllWords } from "@marktwerk/core/text/search";
import { contact, locationAgreement, venue } from "@marktwerk/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { isUuid } from "./venues";

export const CONTACT_KINDS = ["authority", "landowner", "supplier", "service", "other"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export function isContactKind(value: string | undefined): value is ContactKind {
  return (CONTACT_KINDS as readonly string[]).includes(value ?? "");
}

const columns = {
  id: contact.id,
  kind: contact.kind,
  name: contact.name,
  contactPerson: contact.contactPerson,
  email: contact.email,
  phone: contact.phoneE164,
  street: contact.street,
  postalCode: contact.postalCode,
  city: contact.city,
  notes: contact.notes,
};

export type ContactRow = Awaited<ReturnType<typeof listContacts>>["rows"][number];

/**
 * All contacts matching the search (every word must match name, contact person, city, postcode, e-mail or
 * the phone number's digits, in any order; umlaut-insensitive), plus the count per
 * kind within that search, so the chips stay correct while searching. `kind` narrows only the rows.
 */
export async function listContacts(q?: string, kind?: ContactKind) {
  const all = await db
    .select(columns)
    .from(contact)
    .where(isNull(contact.archivedAt))
    .orderBy(asc(contact.name));
  const matching = q
    ? all.filter((c) =>
        matchesAllWords([c.name, c.contactPerson, c.city, c.postalCode, c.email], q, [c.phone]),
      )
    : all;
  const counts: Record<string, number> = {};
  for (const c of matching) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  return {
    rows: kind ? matching.filter((c) => c.kind === kind) : matching,
    counts,
    total: matching.length,
  };
}

/**
 * One contact with where it is used: venues it owns ("Eigentümer") and location agreements it is the
 * counterparty of. `updatedAt` (ISO) is the version the edit form sends back for the concurrency check.
 */
export async function getContact(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ ...columns, updatedAt: contact.updatedAt })
    .from(contact)
    .where(and(eq(contact.id, id), isNull(contact.archivedAt)));
  if (!row) return null;
  const venues = await db
    .select({ id: venue.id, name: venue.name, city: venue.city })
    .from(venue)
    .where(and(eq(venue.landownerContactId, id), isNull(venue.archivedAt)))
    .orderBy(asc(venue.name));
  const agreements = await db
    .select({ id: locationAgreement.id, venueId: venue.id, venueName: venue.name })
    .from(locationAgreement)
    .innerJoin(venue, eq(venue.id, locationAgreement.venueId))
    .where(
      and(eq(locationAgreement.counterpartyContactId, id), isNull(locationAgreement.archivedAt)),
    )
    .orderBy(asc(venue.name));
  return { ...row, updatedAt: row.updatedAt.toISOString(), venues, agreements };
}

/** Active contacts for pickers (e.g. the landowner of a venue); archived ones never show up here. */
export async function listContactOptions(kind?: ContactKind) {
  return db
    .select({ id: contact.id, name: contact.name, kind: contact.kind, city: contact.city })
    .from(contact)
    .where(and(isNull(contact.archivedAt), kind ? eq(contact.kind, kind) : undefined))
    .orderBy(asc(contact.name));
}
