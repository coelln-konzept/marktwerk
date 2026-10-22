import { auditLog, contact, locationAgreement, venue } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getContact, listContactOptions, listContacts } from "@/server/queries/contacts";
import {
  archiveContact,
  ContactInputError,
  createContact,
  unarchiveContact,
  updateContact,
} from "@/server/services/contacts";
import { createActor, resetDatabase } from "../helpers/fixtures";

let owner: Awaited<ReturnType<typeof createActor>>;
let staff: Awaited<ReturnType<typeof createActor>>;
let manager: Awaited<ReturnType<typeof createActor>>;
let field: Awaited<ReturnType<typeof createActor>>;

beforeEach(async () => {
  await resetDatabase();
  owner = await createActor("owner");
  staff = await createActor("staff");
  manager = await createActor("manager");
  field = await createActor("field");
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ContactInputError) return error.code;
    throw error;
  }
  return null;
};

const audits = (action: string) =>
  db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(auditLog.at);

const valid = {
  kind: "authority",
  name: "Ordnungsamt Köln",
  contactPerson: "Frau Meier",
  email: "ordnungsamt@stadt-koeln.de",
  phone: "0221 123456",
  street: "Willy-Brandt-Platz 1",
  postalCode: "50679",
  city: "Köln",
  notes: "Erreichbar Mo-Fr",
};

const rowOf = async (id: string) => {
  const [row] = await db.select().from(contact).where(eq(contact.id, id));
  if (!row) throw new Error("no contact");
  return row;
};

describe("createContact", () => {
  it("stores trimmed values, normalises the phone number and audits", async () => {
    const { id } = await createContact(staff, {
      ...valid,
      name: "  Ordnungsamt Köln ",
      phone: "+49 (0)221 123456",
      notes: "  ",
    });
    const row = await rowOf(id);
    expect(row).toMatchObject({
      kind: "authority",
      name: "Ordnungsamt Köln",
      phoneE164: "+49221123456",
      email: "ordnungsamt@stadt-koeln.de",
      postalCode: "50679",
      notes: null,
      archivedAt: null,
    });

    const [entry] = await audits("contact.create");
    expect(entry).toMatchObject({ actorId: staff.id, entityType: "contact", entityId: id });
    expect(entry?.diff).toMatchObject({
      fields: { name: "Ordnungsamt Köln", phone: "+49221123456" },
    });
  });

  it("keeps a foreign number as typed (trimmed) and allows empty optional fields", async () => {
    const { id } = await createContact(owner, {
      kind: "supplier",
      name: "Stände GmbH",
      phone: " +43 1 5336000 ",
    });
    expect(await rowOf(id)).toMatchObject({
      phoneE164: "+43 1 5336000",
      email: null,
      street: null,
      contactPerson: null,
    });
  });

  it("rejects a missing name, a bad kind, a bad email, a number without digits and long values", async () => {
    expect(await code(createContact(owner, { ...valid, name: "   " }))).toBe("name_required");
    expect(await code(createContact(owner, { ...valid, kind: "friend" }))).toBe("invalid_kind");
    expect(await code(createContact(owner, { ...valid, email: "kein-email" }))).toBe(
      "invalid_email",
    );
    expect(await code(createContact(owner, { ...valid, phone: "bitte anrufen" }))).toBe(
      "invalid_phone",
    );
    expect(await code(createContact(owner, { ...valid, name: "x".repeat(201) }))).toBe("too_long");
    expect(await db.select().from(contact)).toHaveLength(0);
    expect(await audits("contact.create")).toHaveLength(0);
  });

  it("is forbidden for a role without contact:write", async () => {
    await createContact(owner, valid);
    await expect(createContact(field, valid)).rejects.toSatisfy(isForbidden);
    expect(await db.select().from(contact)).toHaveLength(1);
  });
});

describe("updateContact", () => {
  it("changes fields, audits the diff and moves updated_at", async () => {
    const { id } = await createContact(owner, valid);
    const before = await rowOf(id);

    const result = await updateContact(
      staff,
      id,
      { ...valid, city: "Bonn", phone: "0228 99 88 77" },
      before.updatedAt.toISOString(),
    );
    expect(result.changed).toBe(true);
    const after = await rowOf(id);
    expect(after).toMatchObject({ city: "Bonn", phoneE164: "+49228998877" });
    expect(after.updatedAt.toISOString()).toBe(result.updatedAt);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());

    const [entry] = await audits("contact.update");
    expect(entry).toMatchObject({ actorId: staff.id, entityId: id });
    expect(entry?.diff).toEqual({
      changes: {
        city: { from: "Köln", to: "Bonn" },
        phone: { from: "+49221123456", to: "+49228998877" },
      },
    });
  });

  it("does nothing and audits nothing when nothing changed", async () => {
    const { id } = await createContact(owner, valid);
    const before = await rowOf(id);
    const result = await updateContact(owner, id, valid, before.updatedAt.toISOString());
    expect(result.changed).toBe(false);
    expect((await rowOf(id)).updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    expect(await audits("contact.update")).toHaveLength(0);
  });

  it("refuses a stale version (optimistic concurrency) and keeps the newer data", async () => {
    const { id } = await createContact(owner, valid);
    const opened = (await rowOf(id)).updatedAt.toISOString();

    // Someone else saves first (updated_at is bumped explicitly so the test doesn't depend on timing).
    await updateContact(manager, id, { ...valid, city: "Bonn" }, opened);
    await db
      .update(contact)
      .set({ updatedAt: new Date(Date.parse(opened) + 5000) })
      .where(eq(contact.id, id));

    expect(await code(updateContact(staff, id, { ...valid, city: "Düsseldorf" }, opened))).toBe(
      "conflict",
    );
    expect((await rowOf(id)).city).toBe("Bonn");
    expect(await audits("contact.update")).toHaveLength(1);
  });

  it("validates like create and fails for unknown or archived contacts", async () => {
    const { id } = await createContact(owner, valid);
    const version = (await rowOf(id)).updatedAt.toISOString();
    expect(await code(updateContact(owner, id, { ...valid, email: "x" }, version))).toBe(
      "invalid_email",
    );
    expect(
      await code(updateContact(owner, "00000000-0000-0000-0000-000000000000", valid, version)),
    ).toBe("not_found");
    expect(await code(updateContact(owner, "nope", valid, version))).toBe("not_found");

    await archiveContact(owner, id);
    expect(await code(updateContact(owner, id, valid, version))).toBe("not_found");
  });

  it("is forbidden for a role without contact:write", async () => {
    const { id } = await createContact(owner, valid);
    const version = (await rowOf(id)).updatedAt.toISOString();
    await expect(updateContact(field, id, { ...valid, city: "Bonn" }, version)).rejects.toSatisfy(
      isForbidden,
    );
    expect((await rowOf(id)).city).toBe("Köln");
  });
});

describe("archiveContact / unarchiveContact", () => {
  it("hides the contact from list, Vorschau and pickers, and brings it back on undo", async () => {
    const { id } = await createContact(owner, valid);
    expect((await listContacts()).total).toBe(1);
    expect(await listContactOptions()).toHaveLength(1);

    const archived = await archiveContact(manager, id);
    expect(archived).toMatchObject({ name: "Ordnungsamt Köln" });
    expect((await rowOf(id)).archivedAt).not.toBeNull();
    expect((await listContacts()).total).toBe(0);
    expect(await listContactOptions()).toHaveLength(0);
    expect(await getContact(id)).toBeNull();

    const [entry] = await audits("contact.archive");
    expect(entry).toMatchObject({ actorId: manager.id, entityType: "contact", entityId: id });

    await unarchiveContact(manager, id);
    expect((await rowOf(id)).archivedAt).toBeNull();
    expect((await listContacts()).total).toBe(1);
    expect(await audits("contact.unarchive")).toHaveLength(1);
    // Undoing twice is harmless.
    await unarchiveContact(manager, id);
    expect(await audits("contact.unarchive")).toHaveLength(1);
  });

  it("keeps references from venues and agreements and reports them", async () => {
    const { id } = await createContact(owner, { ...valid, kind: "landowner" });
    const [place] = await db
      .insert(venue)
      .values({ name: "Messeplatz", kind: "outdoor_public", city: "Köln", landownerContactId: id })
      .returning();
    const [other] = await db
      .insert(venue)
      .values({ name: "Hafenhalle", kind: "indoor", city: "Köln" })
      .returning();
    if (!place || !other) throw new Error("seed failed");
    await db.insert(locationAgreement).values({
      venueId: other.id,
      counterpartyContactId: id,
      validFrom: "2026-01-01",
      validUntil: "2028-12-31",
    });

    const before = await getContact(id);
    expect(before?.venues.map((v) => v.name)).toEqual(["Messeplatz"]);
    expect(before?.agreements.map((a) => a.venueName)).toEqual(["Hafenhalle"]);

    const { references } = await archiveContact(owner, id);
    expect(references.venues.map((v) => v.name)).toEqual(["Messeplatz"]);
    expect(references.agreements.map((a) => a.venueName)).toEqual(["Hafenhalle"]);

    // References are untouched.
    const [still] = await db.select().from(venue).where(eq(venue.id, place.id));
    expect(still?.landownerContactId).toBe(id);
    const agreements = await db.select().from(locationAgreement);
    expect(agreements[0]?.counterpartyContactId).toBe(id);

    const [entry] = await audits("contact.archive");
    expect(entry?.diff).toMatchObject({ venues: ["Messeplatz"], agreements: 1 });
  });

  it("needs contact:delete: staff may write but not archive", async () => {
    const { id } = await createContact(staff, valid);
    await expect(archiveContact(staff, id)).rejects.toSatisfy(isForbidden);
    await expect(archiveContact(field, id)).rejects.toSatisfy(isForbidden);
    expect((await rowOf(id)).archivedAt).toBeNull();
    expect(await audits("contact.archive")).toHaveLength(0);

    await archiveContact(owner, id);
    await expect(unarchiveContact(staff, id)).rejects.toSatisfy(isForbidden);
  });

  it("fails for unknown or already archived contacts", async () => {
    const { id } = await createContact(owner, valid);
    await archiveContact(owner, id);
    expect(await code(archiveContact(owner, id))).toBe("not_found");
    expect(await code(archiveContact(owner, "nope"))).toBe("not_found");
    expect(await code(unarchiveContact(owner, "00000000-0000-0000-0000-000000000000"))).toBe(
      "not_found",
    );
  });
});
