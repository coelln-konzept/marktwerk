import "server-only";
import { similarContactReason } from "@marktwerk/core/text/duplicates";
import { type InitialLetter, initialLetter, LETTERS } from "@marktwerk/core/text/letter";
import { matchesAllWords } from "@marktwerk/core/text/search";
import { contact, locationAgreement, venue } from "@marktwerk/db/schema";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { isUuid } from "./venues";

export const CONTACT_KINDS = ["authority", "landowner", "supplier", "service", "other"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export function isContactKind(value: string | undefined): value is ContactKind {
  return (CONTACT_KINDS as readonly string[]).includes(value ?? "");
}

/** Sortable columns of the Kontakte list (`?sortierung=`, UX-055); the default is the name. */
export const CONTACT_SORTS = ["name", "art", "stadt"] as const;
export type ContactSort = (typeof CONTACT_SORTS)[number];

export function isContactSort(value: string | undefined): value is ContactSort {
  return (CONTACT_SORTS as readonly string[]).includes(value ?? "");
}

const collator = new Intl.Collator("de", { sensitivity: "base", numeric: true });

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

/**
 * All contacts matching the search (every word must match name, contact person, city, postcode, e-mail or
 * the phone number's digits, in any order; umlaut-insensitive), plus the count per
 * kind within that search, so the chips stay correct while searching. `kind` narrows only the rows.
 *
 * The A–Z selector (CF9-7) works on this whole list, not in SQL: the list is loaded unpaged anyway, so
 * `initialLetter` from core decides the letter and there is no second implementation to keep in step.
 * `letter` narrows the rows and the per-kind counts; `letters` are the letters present under search and
 * kind (the letter itself does not apply), `letterTotal` the rows under search and letter.
 */
export async function listContacts(
  q?: string,
  kind?: ContactKind,
  letter?: InitialLetter,
  sort: { by: ContactSort; dir: "asc" | "desc" } = { by: "name", dir: "asc" },
) {
  const loaded = await db
    .select(columns)
    .from(contact)
    .where(isNull(contact.archivedAt))
    .orderBy(asc(contact.name));
  const all = sortContacts(loaded, sort.by, sort.dir);
  const matching = q
    ? all.filter((c) =>
        matchesAllWords([c.name, c.contactPerson, c.city, c.postalCode, c.email], q, [c.phone]),
      )
    : all;
  const ofKind = kind ? matching.filter((c) => c.kind === kind) : matching;
  const present = new Set(ofKind.map((c) => initialLetter(c.name)));
  const inLetter = letter ? matching.filter((c) => initialLetter(c.name) === letter) : matching;
  const counts: Record<string, number> = {};
  for (const c of inLetter) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  return {
    rows: kind ? inLetter.filter((c) => c.kind === kind) : inLetter,
    counts,
    total: matching.length,
    letterTotal: inLetter.length,
    letters: [...LETTERS, "#" as const].filter((l) => present.has(l)),
  };
}

/**
 * Sorts by a column with German collation. Ties keep the name order; empty cities go last in both
 * directions, so a descending sort doesn't start with blanks. Art sorts in the order of the filter
 * chips (Behörde, Eigentümer, Lieferant, Dienstleister, Sonstige).
 */
function sortContacts<T extends { name: string; kind: string; city: string | null }>(
  rows: T[],
  by: ContactSort,
  dir: "asc" | "desc",
): T[] {
  const sign = dir === "desc" ? -1 : 1;
  const key = (r: T) =>
    by === "name"
      ? r.name
      : by === "art"
        ? String((CONTACT_KINDS as readonly string[]).indexOf(r.kind))
        : (r.city ?? "");
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === "" || kb === "") {
      if (ka !== kb) return ka === "" ? 1 : -1;
    } else {
      const byKey = collator.compare(ka, kb);
      if (byKey !== 0) return sign * byKey;
    }
    return collator.compare(a.name, b.name);
  });
}

export type SimilarContact = {
  id: string;
  name: string;
  kind: ContactKind;
  city: string | null;
  reason: "name" | "phone" | "email";
};

/**
 * Active contacts that look like the one being typed (UX-028): the same name (ignoring case, spaces and
 * umlauts), phone number or e-mail. At most `limit`, same name first; `excludeId` is the contact being
 * edited. Only a hint for the form: nothing is blocked.
 */
export async function findSimilarContacts(
  typed: { name: string; phone?: string; email?: string },
  excludeId?: string,
  limit = 3,
): Promise<SimilarContact[]> {
  if (!typed.name.trim() && !typed.phone?.trim() && !typed.email?.trim()) return [];
  const rows = await db
    .select({
      id: contact.id,
      name: contact.name,
      kind: contact.kind,
      city: contact.city,
      phone: contact.phoneE164,
      email: contact.email,
    })
    .from(contact)
    .where(
      and(
        isNull(contact.archivedAt),
        excludeId && isUuid(excludeId) ? ne(contact.id, excludeId) : undefined,
      ),
    )
    .orderBy(asc(contact.name));
  const order = { name: 0, phone: 1, email: 2 } as const;
  return rows
    .flatMap(({ phone, email, ...row }) => {
      const reason = similarContactReason(typed, { name: row.name, phone, email });
      return reason ? [{ ...row, reason }] : [];
    })
    .sort((a, b) => order[a.reason] - order[b.reason])
    .slice(0, limit);
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
