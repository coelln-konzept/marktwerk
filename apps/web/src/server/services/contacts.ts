import "server-only";
import { can, isValidEmail, normalizePhone } from "@marktwerk/core";
import { contact, contactKind, locationAgreement, venue } from "@marktwerk/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

export const CONTACT_KINDS = contactKind.enumValues;
export type ContactKind = (typeof CONTACT_KINDS)[number];

/** What the form sends: plain strings, empty means "not set". */
export type ContactInput = {
  kind: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  notes?: string;
};

/** The stored fields of a contact (empty strings are stored as null). */
export type ContactFields = {
  kind: ContactKind;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  notes: string | null;
};

export type ContactError =
  | "not_found"
  | "invalid_kind"
  | "name_required"
  | "invalid_email"
  | "invalid_phone"
  | "too_long"
  /** The contact was changed (or archived) by someone else since the form was opened. */
  | "conflict";

export class ContactInputError extends Error {
  constructor(readonly code: ContactError) {
    super(code);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_LENGTH = 200;
const MAX_NOTES = 4000;

const isKind = (value: string): value is ContactKind =>
  (CONTACT_KINDS as readonly string[]).includes(value);

const blankToNull = (value: string | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Trims, validates and normalises the form input. The phone number becomes E.164 when it is a German
 * number and is otherwise kept as typed (but it must contain a digit); the e-mail must look like one.
 */
export function parseContactInput(input: ContactInput): ContactFields {
  if (!isKind(input.kind)) throw new ContactInputError("invalid_kind");
  const name = input.name.trim();
  if (name === "") throw new ContactInputError("name_required");

  const email = blankToNull(input.email);
  if (email !== null && !isValidEmail(email)) throw new ContactInputError("invalid_email");
  const typedPhone = blankToNull(input.phone);
  const phone = typedPhone === null ? null : normalizePhone(typedPhone);
  if (phone !== null && !/\d/.test(phone)) throw new ContactInputError("invalid_phone");

  const fields: ContactFields = {
    kind: input.kind,
    name,
    contactPerson: blankToNull(input.contactPerson),
    email,
    phone,
    street: blankToNull(input.street),
    postalCode: blankToNull(input.postalCode),
    city: blankToNull(input.city),
    notes: blankToNull(input.notes),
  };
  const { notes, ...short } = fields;
  if (Object.values(short).some((v) => v !== null && v.length > MAX_LENGTH))
    throw new ContactInputError("too_long");
  if (notes !== null && notes.length > MAX_NOTES) throw new ContactInputError("too_long");
  return fields;
}

/** Column names differ from the field names for the phone number. */
const toColumns = (f: ContactFields) => ({
  kind: f.kind,
  name: f.name,
  contactPerson: f.contactPerson,
  email: f.email,
  phoneE164: f.phone,
  street: f.street,
  postalCode: f.postalCode,
  city: f.city,
  notes: f.notes,
});

/** New contact ("Kontakt anlegen"). Audited as `contact.create` with the values. */
export async function createContact(actor: Actor, input: ContactInput): Promise<{ id: string }> {
  if (!can(actor.role, "contact", "write")) forbidden();
  const fields = parseContactInput(input);
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(contact).values(toColumns(fields)).returning({
      id: contact.id,
    });
    if (!created) throw new Error("contact insert returned no row");
    await audit(tx, actor.id, [
      { action: "contact.create", entityType: "contact", entityId: created.id, diff: { fields } },
    ]);
    return created;
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockContact(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new ContactInputError("not_found");
  const [row] = await tx
    .select()
    .from(contact)
    .where(and(eq(contact.id, id), isNull(contact.archivedAt)))
    .for("update");
  if (!row) throw new ContactInputError("not_found");
  return row;
}

const fieldsOf = (row: typeof contact.$inferSelect): ContactFields => ({
  kind: row.kind,
  name: row.name,
  contactPerson: row.contactPerson,
  email: row.email,
  phone: row.phoneE164,
  street: row.street,
  postalCode: row.postalCode,
  city: row.city,
  notes: row.notes,
});

/**
 * Edits a contact. `expectedUpdatedAt` (ISO string of the `updated_at` the form was loaded with) is
 * the optimistic lock: if someone saved in between, nothing is written and the error is "conflict".
 * Audited as `contact.update` with `{ changes: { field: { from, to } } }`; no change, no audit entry.
 */
export async function updateContact(
  actor: Actor,
  id: string,
  input: ContactInput,
  expectedUpdatedAt: string,
): Promise<{ changed: boolean; updatedAt: string }> {
  if (!can(actor.role, "contact", "write")) forbidden();
  const next = parseContactInput(input);
  return db.transaction(async (tx) => {
    const current = await lockContact(tx, id);
    if (current.updatedAt.toISOString() !== expectedUpdatedAt)
      throw new ContactInputError("conflict");

    const previous = fieldsOf(current);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(next) as (keyof ContactFields)[]) {
      if (previous[key] !== next[key]) changes[key] = { from: previous[key], to: next[key] };
    }
    if (Object.keys(changes).length === 0)
      return { changed: false, updatedAt: current.updatedAt.toISOString() };

    const [saved] = await tx
      .update(contact)
      .set(toColumns(next))
      .where(eq(contact.id, id))
      .returning({ updatedAt: contact.updatedAt });
    await audit(tx, actor.id, [
      { action: "contact.update", entityType: "contact", entityId: id, diff: { changes } },
    ]);
    return { changed: true, updatedAt: (saved?.updatedAt ?? new Date()).toISOString() };
  });
}

/** Where a contact is still referenced (kept when it is archived). */
export type ContactReferences = {
  venues: { id: string; name: string }[];
  agreements: { id: string; venueId: string; venueName: string }[];
};

async function referencesOf(tx: Tx, id: string): Promise<ContactReferences> {
  const venues = await tx
    .select({ id: venue.id, name: venue.name })
    .from(venue)
    .where(and(eq(venue.landownerContactId, id), isNull(venue.archivedAt)))
    .orderBy(asc(venue.name));
  const agreements = await tx
    .select({
      id: locationAgreement.id,
      venueId: venue.id,
      venueName: venue.name,
    })
    .from(locationAgreement)
    .innerJoin(venue, eq(venue.id, locationAgreement.venueId))
    .where(
      and(eq(locationAgreement.counterpartyContactId, id), isNull(locationAgreement.archivedAt)),
    )
    .orderBy(asc(venue.name));
  return { venues, agreements };
}

/**
 * Archives a contact (needs `contact:delete`). It disappears from the list and the pickers, but venues
 * and location agreements keep pointing at it, so nothing breaks; the audit entry lists those
 * references. Undo = `unarchiveContact`.
 */
export async function archiveContact(
  actor: Actor,
  id: string,
): Promise<{ name: string; references: ContactReferences }> {
  if (!can(actor.role, "contact", "delete")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockContact(tx, id);
    const references = await referencesOf(tx, id);
    await tx.update(contact).set({ archivedAt: new Date() }).where(eq(contact.id, id));
    await audit(tx, actor.id, [
      {
        action: "contact.archive",
        entityType: "contact",
        entityId: id,
        diff: {
          name: current.name,
          kind: current.kind,
          venues: references.venues.map((v) => v.name),
          agreements: references.agreements.length,
        },
      },
    ]);
    return { name: current.name, references };
  });
}

/** Brings an archived contact back (undo of the archive toast). Needs `contact:delete` like archiving. */
export async function unarchiveContact(actor: Actor, id: string): Promise<{ name: string }> {
  if (!can(actor.role, "contact", "delete")) forbidden();
  if (!UUID.test(id)) throw new ContactInputError("not_found");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ name: contact.name, archivedAt: contact.archivedAt })
      .from(contact)
      .where(eq(contact.id, id))
      .for("update");
    if (!row) throw new ContactInputError("not_found");
    // Already active (e.g. undone twice): nothing to do.
    if (row.archivedAt === null) return { name: row.name };
    await tx.update(contact).set({ archivedAt: null }).where(eq(contact.id, id));
    await audit(tx, actor.id, [
      {
        action: "contact.unarchive",
        entityType: "contact",
        entityId: id,
        diff: { name: row.name },
      },
    ]);
    return { name: row.name };
  });
}
