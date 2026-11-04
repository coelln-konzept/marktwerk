import "server-only";
import {
  type AppointmentDraft,
  type AppointmentProblem,
  can,
  checkAppointment,
  clockTime,
} from "@marktwerk/core";
import { appointment, contact, venue } from "@marktwerk/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { ContactInputError, parseContactInput } from "./contacts";

export type { AppointmentDraft };

export type AppointmentErrorCode =
  | AppointmentProblem
  | "not_found"
  | "conflict"
  | "phone_invalid"
  | "invalid_venue"
  | "invalid_contact";

export class AppointmentInputError extends Error {
  constructor(readonly code: AppointmentErrorCode) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const orNull = (value: string | null | undefined) => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

/** The stored fields of an appointment (times as "HH:MM"). */
type Values = {
  title: string;
  onDate: string;
  startsAt: string | null;
  endsAt: string | null;
  venueId: string | null;
  locationText: string | null;
  notes: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhoneE164: string | null;
  contactEmail: string | null;
};

const FIELDS = [
  "title",
  "onDate",
  "startsAt",
  "endsAt",
  "venueId",
  "locationText",
  "notes",
  "contactId",
  "contactName",
  "contactPhoneE164",
  "contactEmail",
] as const satisfies readonly (keyof Values)[];

/** Validates the draft; returns the values to store, with an inline contact parsed (not yet saved). */
function clean(input: AppointmentDraft) {
  const problem = checkAppointment(input);
  if (problem) throw new AppointmentInputError(problem);

  const contactId = orNull(input.contactId);
  let typed: ReturnType<typeof parseContactInput> | null = null;
  if (contactId === null && orNull(input.contactName) !== null) {
    try {
      typed = parseContactInput({
        kind: "other",
        name: input.contactName ?? "",
        phone: input.contactPhone ?? undefined,
        email: input.contactEmail ?? undefined,
      });
    } catch (error) {
      if (error instanceof ContactInputError) {
        if (error.code === "invalid_phone") throw new AppointmentInputError("phone_invalid");
        if (error.code === "invalid_email") throw new AppointmentInputError("email_invalid");
        if (error.code === "name_required")
          throw new AppointmentInputError("contact_name_required");
      }
      throw error;
    }
  }
  const saveTyped = typed !== null && input.saveContact;
  const values: Values = {
    title: input.title.trim(),
    onDate: input.onDate.trim(),
    startsAt: clockTime(input.startsAt),
    endsAt: clockTime(input.endsAt),
    venueId: orNull(input.venueId),
    locationText: orNull(input.locationText),
    notes: orNull(input.notes),
    contactId,
    contactName: typed && !saveTyped ? typed.name : null,
    contactPhoneE164: typed && !saveTyped ? typed.phone : null,
    contactEmail: typed && !saveTyped ? typed.email : null,
  };
  return { values, newContact: saveTyped ? typed : null };
}

async function checkReferences(tx: Tx, values: Values) {
  if (values.venueId !== null) {
    const ok =
      UUID.test(values.venueId) &&
      (await tx
        .select({ id: venue.id })
        .from(venue)
        .where(and(eq(venue.id, values.venueId), isNull(venue.archivedAt))));
    if (!ok || ok.length === 0) throw new AppointmentInputError("invalid_venue");
  }
  if (values.contactId !== null) {
    const ok =
      UUID.test(values.contactId) &&
      (await tx
        .select({ id: contact.id })
        .from(contact)
        .where(and(eq(contact.id, values.contactId), isNull(contact.archivedAt))));
    if (!ok || ok.length === 0) throw new AppointmentInputError("invalid_contact");
  }
}

/** Inserts the typed contact (audited like `createContact`) and points the values at it. */
async function saveNewContact(
  tx: Tx,
  actor: Actor,
  fields: ReturnType<typeof parseContactInput> | null,
  values: Values,
) {
  if (!fields) return;
  const [created] = await tx
    .insert(contact)
    .values({
      kind: fields.kind,
      name: fields.name,
      contactPerson: fields.contactPerson,
      email: fields.email,
      phoneE164: fields.phone,
      street: fields.street,
      postalCode: fields.postalCode,
      city: fields.city,
      notes: fields.notes,
    })
    .returning({ id: contact.id });
  if (!created) throw new Error("contact insert returned no row");
  await audit(tx, actor.id, [
    { action: "contact.create", entityType: "contact", entityId: created.id, diff: { fields } },
  ]);
  values.contactId = created.id;
}

const columns = (v: Values) => ({
  title: v.title,
  onDate: v.onDate,
  startsAt: v.startsAt,
  endsAt: v.endsAt,
  venueId: v.venueId,
  locationText: v.locationText,
  notes: v.notes,
  contactId: v.contactId,
  contactName: v.contactName,
  contactPhoneE164: v.contactPhoneE164,
  contactEmail: v.contactEmail,
});

const valuesOf = (row: typeof appointment.$inferSelect): Values => ({
  title: row.title,
  onDate: row.onDate,
  startsAt: clockTime(row.startsAt),
  endsAt: clockTime(row.endsAt),
  venueId: row.venueId,
  locationText: row.locationText,
  notes: row.notes,
  contactId: row.contactId,
  contactName: row.contactName,
  contactPhoneE164: row.contactPhoneE164,
  contactEmail: row.contactEmail,
});

async function lockAppointment(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new AppointmentInputError("not_found");
  const [row] = await tx.select().from(appointment).where(eq(appointment.id, id)).for("update");
  if (!row) throw new AppointmentInputError("not_found");
  return row;
}

/** New Termin. A typed contact with `saveContact` becomes a real contact (audited `contact.create`). */
export async function createAppointment(
  actor: Actor,
  input: AppointmentDraft,
): Promise<{ id: string; title: string }> {
  if (!can(actor.role, "event", "write")) forbidden();
  const { values, newContact } = clean(input);
  return db.transaction(async (tx) => {
    await checkReferences(tx, values);
    await saveNewContact(tx, actor, newContact, values);
    const [row] = await tx
      .insert(appointment)
      .values(columns(values))
      .returning({ id: appointment.id, title: appointment.title });
    if (!row) throw new Error("appointment insert returned no row");
    await audit(tx, actor.id, [
      {
        action: "appointment.create",
        entityType: "appointment",
        entityId: row.id,
        diff: { values },
      },
    ]);
    return row;
  });
}

/** Edits a Termin. Audited as `appointment.update` with `{changes: {field: {from, to}}}`. */
export async function updateAppointment(
  actor: Actor,
  id: string,
  input: AppointmentDraft,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "event", "write")) forbidden();
  const { values: next, newContact } = clean(input);
  return db.transaction(async (tx) => {
    const current = await lockAppointment(tx, id);
    if (current.archivedAt) throw new AppointmentInputError("conflict");
    const previous = valuesOf(current);
    await checkReferences(tx, {
      ...next,
      venueId: next.venueId === previous.venueId ? null : next.venueId,
      contactId: next.contactId === previous.contactId ? null : next.contactId,
    });
    await saveNewContact(tx, actor, newContact, next);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of FIELDS) {
      if (previous[field] !== next[field])
        changes[field] = { from: previous[field], to: next[field] };
    }
    if (Object.keys(changes).length === 0) return { changed: false };
    await tx
      .update(appointment)
      .set({ ...columns(next), updatedAt: new Date() })
      .where(eq(appointment.id, id));
    await audit(tx, actor.id, [
      { action: "appointment.update", entityType: "appointment", entityId: id, diff: { changes } },
    ]);
    return { changed: true };
  });
}

/** "Archivieren": the Termin disappears from lists. Audited as `appointment.archive`. */
export async function archiveAppointment(actor: Actor, id: string): Promise<{ title: string }> {
  if (!can(actor.role, "event", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockAppointment(tx, id);
    if (current.archivedAt) throw new AppointmentInputError("conflict");
    await tx.update(appointment).set({ archivedAt: new Date() }).where(eq(appointment.id, id));
    await audit(tx, actor.id, [
      {
        action: "appointment.archive",
        entityType: "appointment",
        entityId: id,
        diff: { title: current.title },
      },
    ]);
    return { title: current.title };
  });
}

/** Undo of "Archivieren". Audited as `appointment.restore`. */
export async function restoreAppointment(actor: Actor, id: string): Promise<{ title: string }> {
  if (!can(actor.role, "event", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockAppointment(tx, id);
    if (!current.archivedAt) throw new AppointmentInputError("conflict");
    await tx.update(appointment).set({ archivedAt: null }).where(eq(appointment.id, id));
    await audit(tx, actor.id, [
      {
        action: "appointment.restore",
        entityType: "appointment",
        entityId: id,
        diff: { title: current.title },
      },
    ]);
    return { title: current.title };
  });
}
