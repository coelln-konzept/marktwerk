import {
  auditLog,
  contact,
  eventType,
  permit,
  permitRequirement,
  task,
  templateItem,
  venue,
} from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { getTaskDetail } from "@/server/queries/tasks";
import { createEventsFromPreset } from "@/server/services/events";
import { TaskInputError, updateTask } from "@/server/services/tasks";
import {
  addTemplateItem,
  createTemplate,
  publishDraft,
  setTemplatePresets,
  updateTemplateItem,
} from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { getTask, insertEvent, insertTask } from "../helpers/tasks";
import { baseItem } from "../helpers/templates";

/** The contact a task is about (Fahrplan R24, gap G7): link, suggestion, template default role. */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;

async function insertContact(
  name: string,
  kind: (typeof contact.$inferInsert)["kind"],
  extra: Partial<typeof contact.$inferInsert> = {},
) {
  const [row] = await db
    .insert(contact)
    .values({ name, kind, ...extra })
    .returning();
  if (!row) throw new Error("contact failed");
  return row;
}

async function insertRequirement(patch: Partial<typeof permitRequirement.$inferInsert> = {}) {
  const [row] = await db
    .insert(permitRequirement)
    .values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "market_permit",
      title: "Marktgenehmigung",
      cadence: "per_season",
      ...patch,
    })
    .returning();
  if (!row) throw new Error("requirement failed");
  return row;
}

/** A field user who is Anna (the catalogue's market lead), so the events she has a duty at are hers. */
async function fieldActor(): Promise<Actor> {
  const base = await createActor("field");
  return { ...base, staffMemberId: cat.staff.anna.id, firstName: "Anna", displayName: "Anna Test" };
}

const setOwner = (contactId: string | null) =>
  db.update(venue).set({ landownerContactId: contactId }).where(eq(venue.id, cat.venue.id));

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

describe("updateTask with a contact", () => {
  it("links, changes and removes the contact, audited with the names, without marking the task customized", async () => {
    const amt = await insertContact("Ordnungsamt Köln", "authority", {
      phoneE164: "+49221123456",
      email: "amt@koeln.test",
      contactPerson: "Frau Weber",
    });
    const stadt = await insertContact("Stadt Köln", "authority");
    const ev = await insertEvent(cat, "Flohmarkt", "2027-03-13");
    const t = await insertTask({ title: "Ordnungsamt anrufen", eventId: ev.id });

    expect(await updateTask(owner, t.id, { contactId: amt.id })).toEqual({
      changed: true,
      fields: ["contactId"],
    });
    let row = await getTask(t.id);
    expect(row.contactId).toBe(amt.id);
    expect(row.customized).toBe(false);

    await updateTask(owner, t.id, { contactId: stadt.id });
    expect((await getTask(t.id)).contactId).toBe(stadt.id);
    // The same value again changes nothing.
    expect((await updateTask(owner, t.id, { contactId: stadt.id })).changed).toBe(false);

    await updateTask(owner, t.id, { contactId: null });
    row = await getTask(t.id);
    expect(row.contactId).toBeNull();
    expect(row.customized).toBe(false);

    const entries = await db
      .select({ diff: auditLog.diff })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, t.id), eq(auditLog.action, "task.update")))
      .orderBy(auditLog.at, auditLog.id);
    expect(entries.map((e) => e.diff)).toEqual([
      {
        before: { contactId: null, contactName: null },
        after: { contactId: amt.id, contactName: "Ordnungsamt Köln" },
      },
      {
        before: { contactId: amt.id, contactName: "Ordnungsamt Köln" },
        after: { contactId: stadt.id, contactName: "Stadt Köln" },
      },
      {
        before: { contactId: stadt.id, contactName: "Stadt Köln" },
        after: { contactId: null, contactName: null },
      },
    ]);
  });

  it("refuses an archived or unknown contact", async () => {
    const old = await insertContact("Altes Amt", "authority", { archivedAt: new Date() });
    const t = await insertTask({ title: "Anrufen" });
    for (const id of [old.id, "00000000-0000-4000-8000-000000000000", "kein-uuid"]) {
      const error = await updateTask(owner, t.id, { contactId: id }).catch((e) => e);
      expect(error).toBeInstanceOf(TaskInputError);
      expect((error as TaskInputError).code).toBe("invalid_contact");
    }
    expect((await getTask(t.id)).contactId).toBeNull();
  });

  it("keeps a contact archived after it was linked (still shown), and undo can put it back", async () => {
    const amt = await insertContact("Ordnungsamt", "authority");
    const t = await insertTask({ title: "Anrufen", contactId: amt.id });
    await db.update(contact).set({ archivedAt: new Date() }).where(eq(contact.id, amt.id));
    const detail = await getTaskDetail(owner, t.id);
    expect(detail?.contact.contact).toMatchObject({ id: amt.id, archived: true });
    // Removing works; putting the archived one back (the undo) is refused like any archived contact.
    await updateTask(owner, t.id, { contactId: null });
    await expect(updateTask(owner, t.id, { contactId: amt.id })).rejects.toThrow(TaskInputError);
  });

  it("is not for people without contact read (field users), even on a task they may edit", async () => {
    const field = await fieldActor();
    const amt = await insertContact("Ordnungsamt", "authority");
    const ev = await insertEvent(cat, "Flohmarkt", "2027-03-13", [
      { roleId: cat.roles.lead.id, staffId: cat.staff.anna.id },
    ]);
    const t = await insertTask({ title: "Anrufen", eventId: ev.id });
    // The field user may edit the task itself …
    expect((await updateTask(field, t.id, { title: "Amt anrufen" })).changed).toBe(true);
    // … but not link a contact (forbidden, 403).
    await expect(updateTask(field, t.id, { contactId: amt.id })).rejects.toThrow(/403|forbidden/i);
    expect((await getTask(t.id)).contactId).toBeNull();
  });

  it("a contact edit together with a content edit marks the task customized as before", async () => {
    const amt = await insertContact("Ordnungsamt", "authority");
    const t = await insertTask({ title: "Anrufen" });
    await updateTask(owner, t.id, { contactId: amt.id, title: "Amt anrufen" });
    expect((await getTask(t.id)).customized).toBe(true);
  });
});

describe("getTaskDetail: contact and suggestion", () => {
  it("shows the linked contact with phone, e-mail, kind and person", async () => {
    const amt = await insertContact("Ordnungsamt Köln", "authority", {
      phoneE164: "+49221123456",
      email: "amt@koeln.test",
      contactPerson: "Frau Weber",
    });
    const t = await insertTask({ title: "Anrufen", contactId: amt.id });
    const detail = await getTaskDetail(owner, t.id);
    expect(detail?.contact).toEqual({
      visible: true,
      contact: {
        id: amt.id,
        name: "Ordnungsamt Köln",
        kind: "authority",
        person: "Frau Weber",
        phone: "+49221123456",
        email: "amt@koeln.test",
        archived: false,
      },
      suggestion: null,
    });
  });

  it("hides contact data from roles without contact read", async () => {
    const field = await fieldActor();
    const amt = await insertContact("Ordnungsamt", "authority");
    const ev = await insertEvent(cat, "Flohmarkt", "2027-03-13", [
      { roleId: cat.roles.lead.id, staffId: cat.staff.anna.id },
    ]);
    const t = await insertTask({ title: "Anrufen", eventId: ev.id, contactId: amt.id });
    // The field user sees the task (they work at the event), but no contact.
    const detail = await getTaskDetail(field, t.id);
    expect(detail?.id).toBe(t.id);
    expect(detail?.contact).toEqual({ visible: false, contact: null, suggestion: null });
    const staff = await createActor("staff");
    expect((await getTaskDetail(staff, t.id))?.contact.contact?.id).toBe(amt.id);
  });

  it("suggests the Behörde of the task's permit", async () => {
    const amt = await insertContact("Ordnungsamt", "authority");
    const [p] = await db
      .insert(permit)
      .values({
        venueId: cat.venue.id,
        category: "city",
        permitType: "market_permit",
        title: "Marktgenehmigung",
        authorityContactId: amt.id,
      })
      .returning();
    const t = await insertTask({ title: "Beantragen", permitId: p?.id, category: "permits" });
    const detail = await getTaskDetail(owner, t.id);
    expect(detail?.contact.contact).toBeNull();
    expect(detail?.contact.suggestion).toMatchObject({
      id: amt.id,
      name: "Ordnungsamt",
      reason: "permit",
    });
  });

  it("suggests the Ort's Behörde for a permit task of an event, and the owner for a Logistik task", async () => {
    const amt = await insertContact("Ordnungsamt", "authority");
    const eigentuemer = await insertContact("Hof Müller", "landowner", { phoneE164: "+4922155" });
    await insertRequirement({ authorityContactId: amt.id });
    await setOwner(eigentuemer.id);
    const ev = await insertEvent(cat, "Flohmarkt", "2027-03-13");
    const permitTask = await insertTask({
      title: "Genehmigung",
      eventId: ev.id,
      category: "permits",
    });
    const logistik = await insertTask({ title: "Strom", eventId: ev.id, category: "logistics" });
    const office = await insertTask({
      title: "Plakate",
      eventId: ev.id,
      category: "communication",
    });

    expect((await getTaskDetail(owner, permitTask.id))?.contact.suggestion).toMatchObject({
      id: amt.id,
      reason: "authority",
    });
    expect((await getTaskDetail(owner, logistik.id))?.contact.suggestion).toMatchObject({
      id: eigentuemer.id,
      name: "Hof Müller",
      phone: "+4922155",
      reason: "landowner",
    });
    expect((await getTaskDetail(owner, office.id))?.contact.suggestion).toBeNull();
  });

  it("never suggests archived contacts and saves nothing by itself", async () => {
    const eigentuemer = await insertContact("Hof Müller", "landowner", { archivedAt: new Date() });
    await setOwner(eigentuemer.id);
    const ev = await insertEvent(cat, "Flohmarkt", "2027-03-13");
    const t = await insertTask({ title: "Strom", eventId: ev.id, category: "logistics" });
    expect((await getTaskDetail(owner, t.id))?.contact.suggestion).toBeNull();
    expect((await getTask(t.id)).contactId).toBeNull();
  });

  it("uses only requirements for the event's type or for every type", async () => {
    const other = await insertContact("Amt für Stadtfeste", "authority");
    const general = await insertContact("Ordnungsamt", "authority");
    const [otherType] = await db
      .insert(eventType)
      .values({
        key: "street_fair",
        nameDe: "Stadtfest",
        nameEn: "Street fair",
        rules: cat.type.rules,
      })
      .returning();
    await insertRequirement({ eventTypeId: otherType?.id, authorityContactId: other.id });
    await insertRequirement({ authorityContactId: general.id });
    const ev = await insertEvent(cat, "Flohmarkt", "2027-03-13");
    const t = await insertTask({ title: "Genehmigung", eventId: ev.id, category: "permits" });
    expect((await getTaskDetail(owner, t.id))?.contact.suggestion?.id).toBe(general.id);
  });
});

describe("template items with a default contact role", () => {
  async function templateWith(items: Parameters<typeof addTemplateItem>[2][]) {
    const { id, versionId } = await createTemplate(owner, {
      name: "Ablauf",
      description: null,
      eventTypeId: null,
    });
    for (const item of items) await addTemplateItem(owner, versionId, item);
    return { id, versionId };
  }

  it("instantiated tasks get the Ort's Behörde or Eigentümer; items without a role or a match get none", async () => {
    const amt = await insertContact("Ordnungsamt", "authority");
    const eigentuemer = await insertContact("Stadt Köln Liegenschaften", "authority");
    await insertRequirement({ authorityContactId: amt.id });
    await setOwner(eigentuemer.id);
    const { id, versionId } = await templateWith([
      baseItem({
        title: "Ordnungsamt anrufen",
        category: "permits",
        permitType: "market_permit",
        contactRole: "authority",
      }),
      baseItem({ title: "Eigentümer fragen", contactRole: "landowner" }),
      baseItem({ title: "Plakate drucken" }),
    ]);
    await publishDraft(owner, versionId, "Erste Fassung");
    await setTemplatePresets(owner, id, [cat.presets.flea.id]);
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-03-13"]);
    const rows = await db
      .select({ key: task.templateStableKey, contactId: task.contactId })
      .from(task)
      .where(eq(task.eventId, created?.id as string));
    const byKey = new Map(rows.map((r) => [r.key, r.contactId]));
    expect(byKey.get("ordnungsamt_anrufen")).toBe(amt.id);
    expect(byKey.get("eigentuemer_fragen")).toBe(eigentuemer.id);
    expect(byKey.get("plakate_drucken")).toBeNull();
  });

  it("a role that finds no contact leaves the task empty, and the drawer suggests it once the Ort has one", async () => {
    const { id, versionId } = await templateWith([
      baseItem({ title: "Eigentümer fragen", category: "office", contactRole: "landowner" }),
    ]);
    await publishDraft(owner, versionId, "Erste Fassung");
    await setTemplatePresets(owner, id, [cat.presets.flea.id]);
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-03-13"]);
    const [t] = await db
      .select()
      .from(task)
      .where(eq(task.eventId, created?.id as string));
    expect(t?.contactId).toBeNull();
    const eigentuemer = await insertContact("Hof Müller", "landowner");
    await setOwner(eigentuemer.id);
    expect((await getTaskDetail(owner, t?.id as string))?.contact.suggestion).toMatchObject({
      id: eigentuemer.id,
      reason: "landowner",
    });
  });

  it("the template service keeps the role, refuses unknown ones, and leaves it alone when an update omits it", async () => {
    const { versionId } = await templateWith([]);
    const { key } = await addTemplateItem(
      owner,
      versionId,
      baseItem({ title: "Anrufen", contactRole: "authority" }),
    );
    const read = async () =>
      (
        await db
          .select({ contactRole: templateItem.contactRole })
          .from(templateItem)
          .where(and(eq(templateItem.versionId, versionId), eq(templateItem.stableKey, key)))
      )[0] ?? null;
    expect((await read())?.contactRole).toBe("authority");
    await expect(
      addTemplateItem(owner, versionId, baseItem({ contactRole: "supplier" as never })),
    ).rejects.toMatchObject({ code: "invalid_contact_role" });
    // An update without the field (older callers) keeps it; null removes it.
    const { contactRole: _omit, ...withoutRole } = baseItem({ title: "Anrufen!" });
    await updateTemplateItem(owner, versionId, key, withoutRole);
    expect((await read())?.contactRole).toBe("authority");
    await updateTemplateItem(
      owner,
      versionId,
      key,
      baseItem({ title: "Anrufen!", contactRole: null }),
    );
    expect((await read())?.contactRole).toBeNull();
  });
});
