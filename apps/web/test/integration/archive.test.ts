import { auditLog, contact, document, event, permit } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  archiveDocumentFacets,
  listActivity,
  listArchiveDocuments,
  listOldPermits,
} from "@/server/queries/archive";
import { createEventsFromPreset } from "@/server/services/events";
import { createPermit, setPermitStatus } from "@/server/services/permits";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

const newPermit = (title: string) =>
  createPermit(owner, {
    venueId: cat.venue.id,
    category: "city",
    permitType: "other",
    title,
    season: 2026,
    applyBy: null,
  });

describe("Archiv: Dokumente", () => {
  it("lists live documents with what they belong to, paged, searchable; finance ones stay out while hidden", async () => {
    const [held] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-05-02"]);
    const file = (n: number, link: Partial<typeof document.$inferInsert>) => ({
      fileName: `datei-${n}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: String(n).padStart(64, "0"),
      storageKey: `test/${n}`,
      ...link,
    });
    await db
      .insert(document)
      .values([
        ...Array.from({ length: 3 }, (_, i) => file(i, { eventId: held?.id })),
        file(9, { eventId: held?.id, archivedAt: new Date() }),
      ]);
    const page1 = await listArchiveDocuments(owner, { page: 1, size: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows).toHaveLength(2);
    expect(page1.rows[0]).toMatchObject({ eventId: held?.id, eventName: "Testflohmarkt" });
    const page2 = await listArchiveDocuments(owner, { page: 2, size: 2 });
    expect(page2.rows).toHaveLength(1);
    const found = await listArchiveDocuments(owner, { q: "datei-1", page: 1, size: 50 });
    expect(found.rows.map((r) => r.fileName)).toEqual(["datei-1.pdf"]);
  });
});

describe("Archiv: Dokumente finden", () => {
  it("searches what a file belongs to (umlauts folded), filters by Markt and year, and lists removed ones", async () => {
    const [nippes] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2025-06-07"]);
    const [fest] = await createEventsFromPreset(owner, cat.presets.festival.id, ["2026-05-02"]);
    if (!nippes || !fest) throw new Error("events");
    await db.update(event).set({ name: "Trödelmarkt Nippes" }).where(eq(event.id, nippes.id));
    const season = await newPermit("Sondernutzung Rhein");
    const file = (n: number, link: Partial<typeof document.$inferInsert>) => ({
      fileName: `scan-${n}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: String(n).padStart(64, "0"),
      storageKey: `test/find/${n}`,
      ...link,
    });
    await db
      .insert(document)
      .values([
        file(1, { eventId: nippes.id, createdAt: new Date("2026-01-10T10:00:00Z") }),
        file(2, { eventId: fest.id, caption: "Lageplan" }),
        file(3, { permitId: season.id }),
        file(4, { venueId: cat.venue.id, createdAt: new Date("2024-03-01T10:00:00Z") }),
        file(5, { eventId: nippes.id, archivedAt: new Date() }),
      ]);
    const names = async (filters: Parameters<typeof listArchiveDocuments>[1]) =>
      (await listArchiveDocuments(owner, filters)).rows.map((r) => r.fileName).sort();
    const base = { page: 1, size: 50 };

    // Owner names, word by word, without umlauts: the event, the Markt, the permit, the Ort.
    expect(await names({ ...base, q: "trodel nippes" })).toEqual(["scan-1.pdf"]);
    expect(await names({ ...base, q: "Teststadtfest" })).toEqual(["scan-2.pdf"]);
    expect(await names({ ...base, q: "lageplan" })).toEqual(["scan-2.pdf"]);
    expect(await names({ ...base, q: "Rhein" })).toEqual(["scan-3.pdf"]);
    expect(await names({ ...base, q: "messeplatz" })).toEqual(["scan-4.pdf"]);
    expect(await names({ ...base, q: "nippes rhein" })).toEqual([]);

    // Markt and year: the event's season, else the permit's, else the upload year.
    expect(await names({ ...base, presetId: cat.presets.flea.id })).toEqual(["scan-1.pdf"]);
    expect(await names({ ...base, year: 2025 })).toEqual(["scan-1.pdf"]);
    expect(await names({ ...base, year: 2026 })).toEqual(["scan-2.pdf", "scan-3.pdf"]);
    expect(await names({ ...base, year: 2024 })).toEqual(["scan-4.pdf"]);

    const facets = await archiveDocumentFacets(owner);
    expect(facets.years).toEqual([2026, 2025, 2024]);
    expect(facets.presets.map((p) => p.name)).toEqual(["Testflohmarkt", "Teststadtfest"]);

    const [nippesRow] = (await listArchiveDocuments(owner, { ...base, q: "scan-1" })).rows;
    expect(nippesRow).toMatchObject({
      eventName: "Trödelmarkt Nippes",
      eventStartsOn: "2025-06-07",
      eventEndsOn: "2025-06-07",
      presetName: "Testflohmarkt",
    });

    const removed = await listArchiveDocuments(owner, { ...base, removed: true });
    expect(removed.rows.map((r) => [r.fileName, r.canWrite])).toEqual([["scan-5.pdf", true]]);
    expect(removed.rows[0]?.archivedAt).not.toBeNull();
  });
});

describe("Archiv: Aktivität", () => {
  it("shows every audit entry newest first for owner and manager, nothing for staff", async () => {
    const created = await newPermit("Sonderfall");
    await setPermitStatus(owner, created.id, "preparing");
    const all = await listActivity(owner, { page: 1, size: 50 });
    expect(all.rows[0]).toMatchObject({ action: "permit.status", permitTitle: "Sonderfall" });
    expect(all.total).toBeGreaterThanOrEqual(2);
    const permits = await listActivity(owner, { area: "permit", page: 1, size: 50 });
    expect(permits.rows.every((r) => r.entityType.startsWith("permit"))).toBe(true);
    const staff = await createActor("staff");
    expect(await listActivity(staff, { page: 1, size: 50 })).toEqual({ rows: [], total: 0 });
  });
});

describe("Archiv: Aktivität, Betrifft", () => {
  it("names and links the record of every entry, and falls back to the name in the entry", async () => {
    const [person] = await db
      .insert(contact)
      .values({ kind: "authority", name: "Ordnungsamt Köln" })
      .returning();
    if (!person) throw new Error("contact");
    const gone = "00000000-0000-4000-8000-000000000001";
    await db.insert(auditLog).values([
      { actorId: owner.id, action: "contact.create", entityType: "contact", entityId: person.id },
      { actorId: owner.id, action: "venue.update", entityType: "venue", entityId: cat.venue.id },
      {
        actorId: owner.id,
        action: "preset.update",
        entityType: "event_preset",
        entityId: cat.presets.flea.id,
      },
      {
        actorId: owner.id,
        action: "vehicle.archive",
        entityType: "vehicle",
        entityId: gone,
        diff: { name: "Alter Sprinter" },
      },
      { actorId: owner.id, action: "settings.update", entityType: "settings", entityId: null },
    ]);
    const { rows } = await listActivity(owner, { page: 1, size: 50 });
    const byAction = Object.fromEntries(rows.map((r) => [r.action, r.target]));
    expect(byAction["contact.create"]).toEqual({
      label: "Ordnungsamt Köln",
      href: `/kontakte?vorschau=${person.id}`,
    });
    expect(byAction["venue.update"]).toEqual({
      label: "Messeplatz Test",
      href: `/orte/${cat.venue.id}`,
    });
    expect(byAction["preset.update"]).toEqual({
      label: "Testflohmarkt",
      href: `/vorlagen/${cat.presets.flea.id}`,
    });
    expect(byAction["vehicle.archive"]).toEqual({ label: "Alter Sprinter" });
    expect(byAction["settings.update"]).toBeNull();

    const contacts = await listActivity(owner, { area: "contact", page: 1, size: 50 });
    expect(contacts.rows.map((r) => r.action)).toEqual(["contact.create"]);
  });
});

describe("Archiv: Alte Genehmigungen", () => {
  it("lists superseded, not required and run-out permits; current ones stay out", async () => {
    const replaced = await newPermit("Alt ersetzt");
    await setPermitStatus(owner, replaced.id, "granted");
    await setPermitStatus(owner, replaced.id, "superseded");
    const skipped = await newPermit("Nicht nötig");
    await setPermitStatus(owner, skipped.id, "not_required");
    const expired = await newPermit("Abgelaufen");
    await setPermitStatus(owner, expired.id, "granted");
    await db.update(permit).set({ validUntil: "2026-01-31" }).where(eq(permit.id, expired.id));
    const current = await newPermit("Läuft noch");
    await setPermitStatus(owner, current.id, "granted");

    const old = await listOldPermits(owner, "2026-11-03", { page: 1, size: 50 });
    expect(old.rows.map((r) => [r.title, r.state]).sort()).toEqual([
      ["Abgelaufen", "expired"],
      ["Alt ersetzt", "superseded"],
      ["Nicht nötig", "not_required"],
    ]);
    const searched = await listOldPermits(owner, "2026-11-03", { q: "ersetzt", page: 1, size: 50 });
    expect(searched.total).toBe(1);
  });
});
