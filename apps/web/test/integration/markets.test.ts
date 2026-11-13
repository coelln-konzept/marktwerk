import { defaultSchedule, MARKET_COLORS, type ScheduleRow } from "@marktwerk/core";
import {
  auditLog,
  checklistTemplate,
  eventPreset,
  eventPresetTemplate,
  event as eventTable,
  task,
  templateItem,
  templateVersion,
} from "@marktwerk/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getMarketColorChoices, listMarketColorUsage } from "@/server/queries/market-colors";
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
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

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
  it("starts a market with the default Zeitplan; its events get a copy", async () => {
    const created = await createMarket(owner, market());
    const [row] = await db.select().from(eventPreset).where(eq(eventPreset.id, created.id));
    expect(row?.schedule).toEqual(defaultSchedule());

    const own = [
      ...defaultSchedule(),
      { audience: "team", kind: "setup", day: "first", from: "05:00", to: "06:00" } as const,
    ];
    const withOwn = await createMarket(owner, market({ name: "Nachtmarkt", schedule: own }));
    const [event] = await createEventsFromPreset(owner, withOwn.id, ["2026-12-05"]);
    const [stored] = await db
      .select({ schedule: eventTable.schedule })
      .from(eventTable)
      .where(eq(eventTable.id, event?.id as string));
    expect(stored?.schedule).toEqual(own);
  });

  it("rejects a Zeitplan with issues", async () => {
    await expect(
      createMarket(owner, market({ schedule: [defaultSchedule()[0] as ScheduleRow] })),
    ).rejects.toMatchObject({ code: "invalid_schedule", field: "schedule" });
  });

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
      colors.push(created.color as string);
      const [row] = await db.select().from(eventPreset).where(eq(eventPreset.id, created.id));
      expect(row?.color).toBe(created.color);
    }
    expect(new Set(colors.slice(0, MARKET_COLORS.length)).size).toBe(MARKET_COLORS.length);
    expect(colors.at(-1)).toBe(colors[0]);
  });

  it("stores an explicit colour, or none for null; omitted keeps the least used one", async () => {
    const chosen = await createMarket(owner, market({ name: "Blau", color: "slate" }));
    expect(chosen.color).toBe("slate");
    const none = await createMarket(owner, market({ name: "Ohne", color: null }));
    expect(none.color).toBeNull();
    const rows = await db.select().from(eventPreset);
    expect(rows.find((r) => r.id === chosen.id)?.color).toBe("slate");
    expect(rows.find((r) => r.id === none.id)?.color).toBeNull();
    // Omitted: the least used one (slate is taken once, so plum, the first, is still free).
    const auto = await createMarket(owner, market({ name: "Auto" }));
    expect(auto.color).toBe("plum");
    await expect(
      createMarket(owner, market({ name: "Falsch", color: "red" })),
    ).rejects.toMatchObject({ code: "invalid_color" });
  });

  it("lists the active markets per colour, without archived or inactive ones", async () => {
    await createMarket(owner, market({ name: "B Markt", color: "petrol" }));
    await createMarket(owner, market({ name: "A Markt", color: "petrol" }));
    const gone = await createMarket(owner, market({ name: "Archiviert", color: "petrol" }));
    const off = await createMarket(owner, market({ name: "Pausiert", color: "rose" }));
    await createMarket(owner, market({ name: "Farblos", color: null }));
    await db.update(eventPreset).set({ archivedAt: new Date() }).where(eq(eventPreset.id, gone.id));
    await db.update(eventPreset).set({ active: false }).where(eq(eventPreset.id, off.id));
    expect(await listMarketColorUsage()).toEqual({ petrol: ["A Markt", "B Markt"] });
    // A market's own edit form leaves its own colour out of the legend usage.
    const [own] = await db.select().from(eventPreset).where(eq(eventPreset.name, "A Markt"));
    expect(await listMarketColorUsage(own?.id)).toEqual({ petrol: ["B Markt"] });
  });

  it("suggests the colour a following createMarket without colour assigns", async () => {
    expect((await getMarketColorChoices()).suggested).toBe("plum");
    for (let i = 0; i < 4; i += 1) {
      const { suggested, usage } = await getMarketColorChoices();
      expect(Object.keys(usage)).toHaveLength(i);
      const created = await createMarket(owner, market({ name: `Markt ${i}` }));
      expect(created.color).toBe(suggested);
    }
    // An archived market stops counting; an inactive one still does (like createMarket).
    const [row] = await db.select().from(eventPreset).where(eq(eventPreset.color, "plum"));
    await db
      .update(eventPreset)
      .set({ archivedAt: new Date() })
      .where(eq(eventPreset.id, row?.id as string));
    const { suggested } = await getMarketColorChoices();
    expect(suggested).toBe("plum");
    expect((await createMarket(owner, market({ name: "Nach Archiv" }))).color).toBe(suggested);
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

describe("createMarket from a past event (Archiv: Als Vorlage speichern)", () => {
  it("copies the tasks of the event's market instead of the master; the source stays untouched", async () => {
    await seedMaster();
    const source = await seedPublishedTemplate(
      owner,
      [
        baseItem({ title: "Plakate aufhängen", offsetDays: -14 }),
        baseItem({ title: "Stromkasten prüfen", phase: "live", offsetDays: 0 }),
        baseItem({ title: "Abrechnen", phase: "post", offsetDays: 2 }),
      ],
      { name: "Flohmarkt Test – Aufgaben", presetIds: [cat.presets.flea.id] },
    );
    const [held] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-05-02"]);
    if (!held) throw new Error("no event");

    const created = await createMarket(owner, market({ name: "Flohmarkt Neu" }), {
      fromEventId: held.id,
    });
    expect(created.template?.items).toBe(3);
    const [version] = await db
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.templateId, created.template?.templateId ?? ""));
    expect(version?.changeNote).toContain("Flohmarkt Test – Aufgaben");
    expect((await itemsOf(version?.id ?? "")).map((i) => i.title)).toEqual([
      "Plakate aufhängen",
      "Stromkasten prüfen",
      "Abrechnen",
    ]);
    // The source template keeps its items and its link to the old market.
    expect(await itemsOf(source.versionId)).toHaveLength(3);
    const [entry] = await audits("preset.create");
    expect(entry?.diff).toMatchObject({ fromEventId: held.id });
  });

  it("falls back to the master when the event has no market tasks", async () => {
    await seedMaster();
    const [held] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-05-02"]);
    const created = await createMarket(owner, market(), { fromEventId: held?.id ?? "" });
    expect(created.template?.items).toBe(2);
    await expect(
      createMarket(owner, market(), { fromEventId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toMatchObject({ code: "event_not_found" });
  });
});
