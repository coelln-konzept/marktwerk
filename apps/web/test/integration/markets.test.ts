import { MARKET_COLORS } from "@marktwerk/core";
import {
  auditLog,
  checklistTemplate,
  eventPreset,
  eventPresetTemplate,
  task,
  templateItem,
  templateVersion,
} from "@marktwerk/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset } from "@/server/services/events";
import { createMarket, type MarketInput } from "@/server/services/presets";
import {
  addTemplateItem,
  createDraft,
  createMasterTemplate,
  publishDraft,
  setTemplateArchived,
  TemplateInputError,
} from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem } from "../helpers/templates";

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

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const market = (patch: Partial<MarketInput> = {}): MarketInput => ({
  name: "Flohmarkt Nippes",
  eventTypeId: cat.type.id,
  venueId: cat.venue.id,
  times: { setup: "06:00", open: "08:00", close: "16:00", teardown: "18:00" },
  pricePerMCents: 1500,
  bookingFeeCents: 500,
  rrule: null,
  ...patch,
});

/** The master with two published items, made through the real service path. */
async function seedMaster() {
  const { id, versionId } = await createMasterTemplate(owner);
  await addTemplateItem(
    owner,
    versionId,
    baseItem({ title: "Genehmigung beantragen", offsetDays: -60 }),
  );
  await addTemplateItem(
    owner,
    versionId,
    baseItem({ title: "Aufbau", phase: "live", offsetDays: 0, dueTime: "06:00" }),
  );
  await publishDraft(owner, versionId, "Erste Fassung");
  return { id, versionId };
}

const itemsOf = (versionId: string) =>
  db
    .select()
    .from(templateItem)
    .where(eq(templateItem.versionId, versionId))
    .orderBy(asc(templateItem.sort));

const audits = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action));

describe("createMarket", () => {
  it("gives the market its own copy of the master, published and linked", async () => {
    const master = await seedMaster();
    const created = await createMarket(owner, market());

    expect(created.template?.items).toBe(2);
    const [template] = await db
      .select()
      .from(checklistTemplate)
      .where(eq(checklistTemplate.id, created.template?.templateId as string));
    expect(template).toMatchObject({
      name: "Flohmarkt Nippes – Aufgaben",
      ownerPresetId: created.id,
      isMaster: false,
      kind: "event",
    });
    const [version] = await db
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.templateId, template?.id as string));
    expect(version).toMatchObject({ version: 1, status: "published" });
    expect(version?.publishedAt).toBeInstanceOf(Date);

    const copy = await itemsOf(version?.id as string);
    const original = await itemsOf(master.versionId);
    const fields = (rows: typeof copy) =>
      rows.map(({ id: _i, versionId: _v, createdAt: _c, updatedAt: _u, ...rest }) => rest);
    expect(fields(copy)).toEqual(fields(original));
    expect(copy.map((i) => i.id)).not.toEqual(original.map((i) => i.id));

    const links = await db.select().from(eventPresetTemplate);
    expect(links).toEqual([
      expect.objectContaining({ presetId: created.id, templateId: template?.id }),
    ]);
  });

  it("stays independent of the master afterwards", async () => {
    const master = await seedMaster();
    const created = await createMarket(owner, market());
    const [copyVersion] = await db
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.templateId, created.template?.templateId as string));

    const draft = await createDraft(owner, master.id);
    await addTemplateItem(owner, draft.versionId, baseItem({ title: "Neue Grundaufgabe" }));
    await publishDraft(owner, draft.versionId);

    expect(await itemsOf(copyVersion?.id as string)).toHaveLength(2);
    expect(await itemsOf(draft.versionId)).toHaveLength(3);
    // Another market made now starts from the new master version.
    const second = await createMarket(owner, market({ name: "Trödelmarkt Ehrenfeld" }));
    expect(second.template?.items).toBe(3);
  });

  it("assigns colours from the palette, the least used first", async () => {
    const colors: string[] = [];
    for (let i = 0; i < MARKET_COLORS.length + 1; i += 1) {
      const created = await createMarket(owner, market({ name: `Markt ${i}` }));
      colors.push(created.color);
      const [row] = await db.select().from(eventPreset).where(eq(eventPreset.id, created.id));
      expect(row?.color).toBe(created.color);
    }
    expect(new Set(colors.slice(0, MARKET_COLORS.length)).size).toBe(MARKET_COLORS.length);
    expect(colors.at(-1)).toBe(colors[0]);
  });

  it("audits the preset, the template copy and the link", async () => {
    await seedMaster();
    const created = await createMarket(owner, market());
    const [preset] = await audits("preset.create").then((rows) =>
      rows.filter((r) => r.entityId === created.id),
    );
    expect(preset?.diff).toMatchObject({
      changes: { name: { to: "Flohmarkt Nippes" }, color: { from: null, to: created.color } },
    });
    const templateCreates = (await audits("template.create")).filter(
      (r) => (r.diff as { ownerPresetId?: string }).ownerPresetId === created.id,
    );
    expect(templateCreates).toHaveLength(1);
    expect(templateCreates[0]?.diff).toMatchObject({ copiedFromVersion: 1 });
    const publishes = (await audits("template.publish")).filter(
      (r) => (r.diff as { templateName?: string }).templateName === "Flohmarkt Nippes – Aufgaben",
    );
    expect(publishes).toHaveLength(1);
    const links = (await audits("template.presets")).filter(
      (r) => r.entityId === created.template?.templateId,
    );
    expect(links[0]?.diff).toEqual({ added: [created.id], removed: [] });
  });

  it("plans events from the new market with the tasks of its own copy", async () => {
    await seedMaster();
    const created = await createMarket(owner, market());
    const [event] = await createEventsFromPreset(owner, created.id, ["2027-05-01"]);
    const tasks = await db
      .select()
      .from(task)
      .where(eq(task.eventId, event?.id as string));
    expect(tasks.map((t) => t.title).sort()).toEqual(["Aufbau", "Genehmigung beantragen"]);
  });

  it("works without a master: the market has a colour but no tasks", async () => {
    const created = await createMarket(owner, market());
    expect(created.template).toBeNull();
    expect(MARKET_COLORS).toContain(created.color);
    expect(await db.select().from(checklistTemplate)).toHaveLength(0);
    expect(await db.select().from(eventPresetTemplate)).toHaveLength(0);
  });

  it("creates the market without tasks while the master has no published version yet", async () => {
    await createMasterTemplate(owner);
    const created = await createMarket(owner, market());
    expect(created.template).toBeNull();
  });

  it("rolls everything back when the input is invalid, and needs template:write", async () => {
    await seedMaster();
    await expect(createMarket(owner, market({ name: "  " }))).rejects.toMatchObject({
      code: "invalid_name",
    });
    expect(await db.select().from(eventPreset)).toHaveLength(2); // the two catalogue presets
    const staff = await createActor("staff");
    const error = await createMarket(staff, market()).catch((e: unknown) => e);
    expect(isForbidden(error)).toBe(true);
  });
});

describe("master template", () => {
  it("exists only once and cannot be archived", async () => {
    const master = await seedMaster();
    await expect(createMasterTemplate(owner)).rejects.toMatchObject({ code: "master_exists" });
    const error = await setTemplateArchived(owner, master.id, true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TemplateInputError);
    expect((error as TemplateInputError).code).toBe("master_protected");
  });
});
