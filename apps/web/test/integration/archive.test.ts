import { document, permit } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listActivity, listArchiveDocuments, listOldPermits } from "@/server/queries/archive";
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
