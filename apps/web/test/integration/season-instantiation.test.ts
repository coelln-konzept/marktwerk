import { checklist, eventSeason, task, templateItem } from "@marktwerk/db/schema";
import { eventSeasons } from "@marktwerk/jobs";
import { and, asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset } from "@/server/services/events";
import { ensureEventSeason } from "@/server/services/seasons";
import { applyTemplateVersion } from "@/server/services/template-propagation";
import {
  addTemplateItem,
  createDraft,
  moveTemplateItem,
  publishDraft,
  updateTemplateItem,
} from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let templateId: string;
let versionId: string;

/**
 * One template that describes the whole market (research 13 §6.1): season work (Termine planen with two
 * subtasks, one on its own date; a close-out item on season_end) next to an event item (Aufbau).
 */
beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  ({ templateId, versionId } = await seedPublishedTemplate(
    owner,
    [
      baseItem({
        title: "Termine planen",
        scope: "season",
        anchorKey: "season_start",
        offsetDays: -240,
        dutyRoleId: cat.roles.lead.id,
        isKey: true,
      }),
      baseItem({ title: "Aufbau", phase: "live", anchorKey: "setup_day", offsetDays: 0 }),
      baseItem({
        title: "Saisonabschluss",
        phase: "post",
        scope: "season",
        anchorKey: "season_end",
        offsetDays: 14,
      }),
    ],
    { presetIds: [cat.presets.flea.id] },
  ));
  // Children (ADR 0021) of the season item: no scope given, they take the parent's.
  const draft = await createDraft(owner, templateId);
  await addTemplateItem(
    owner,
    draft.versionId,
    baseItem({ title: "Rhythmus", parentKey: "termine_planen" }),
  );
  await addTemplateItem(
    owner,
    draft.versionId,
    baseItem({
      title: "Notiz",
      parentKey: "termine_planen",
      ownDue: true,
      anchorKey: "season_start",
      offsetDays: -230,
    }),
  );
  await publishDraft(owner, draft.versionId, "Unteraufgaben");
  versionId = draft.versionId;
});

afterAll(async () => {
  await db.$client.end();
});

const seasonOf = async (season: number) => {
  const [row] = await db
    .select()
    .from(eventSeason)
    .where(and(eq(eventSeason.presetId, cat.presets.flea.id), eq(eventSeason.season, season)));
  if (!row) throw new Error(`no season ${season}`);
  return row;
};

const seasonTasks = (seasonId: string) =>
  db.select().from(task).where(eq(task.seasonId, seasonId)).orderBy(asc(task.boardSort));

const byKey = async (seasonId: string) =>
  new Map((await seasonTasks(seasonId)).map((t) => [t.templateStableKey, t]));

describe("season instantiation", () => {
  it("puts season items on the Saison record only, with subtasks, due from the season anchors", async () => {
    const created = await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2027-03-07",
      "2027-10-03",
    ]);
    // Events get the event items only.
    for (const c of created) {
      const tasks = await db.select().from(task).where(eq(task.eventId, c.id));
      expect(tasks.map((t) => t.templateStableKey)).toEqual(["aufbau"]);
    }

    const season = await seasonOf(2027);
    const lists = await db.select().from(checklist).where(eq(checklist.seasonId, season.id));
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({
      templateId,
      templateVersionId: versionId,
      eventId: null,
      permitId: null,
    });

    const tasks = await byKey(season.id);
    expect([...tasks.keys()].sort()).toEqual([
      "notiz",
      "rhythmus",
      "saisonabschluss",
      "termine_planen",
    ]);
    const termine = tasks.get("termine_planen");
    expect(termine).toMatchObject({
      eventId: null,
      seasonId: season.id,
      checklistId: lists[0]?.id,
      source: "template",
      anchorKey: "season_start",
      offsetDays: -240,
      isKey: true,
      // The market's default duties: market_lead → Anna.
      assigneeId: cat.staff.anna.id,
      parentTaskId: null,
    });
    // 07.03.2027 − 240 days = 10.07.2026, 09:00 summer time.
    expect(termine?.dueAt?.toISOString()).toBe("2026-07-10T07:00:00.000Z");
    // Child without own date: the parent's; with own date: its own (−230). Both subtasks of Termine planen.
    expect(tasks.get("rhythmus")).toMatchObject({ parentTaskId: termine?.id, seasonId: season.id });
    expect(tasks.get("rhythmus")?.dueAt?.toISOString()).toBe("2026-07-10T07:00:00.000Z");
    expect(tasks.get("notiz")).toMatchObject({ parentTaskId: termine?.id, offsetDays: -230 });
    expect(tasks.get("notiz")?.dueAt?.toISOString()).toBe("2026-07-20T07:00:00.000Z");
    // season_end = 03.10.2027 → +14 = 17.10.2027 (still summer time).
    expect(tasks.get("saisonabschluss")?.dueAt?.toISOString()).toBe("2027-10-17T07:00:00.000Z");
  });

  it("dates season work from the expected start while there are no dates (job, next year)", async () => {
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-03-07"]);
    const result = await eventSeasons(db, new Date("2027-06-01T10:00:00Z"));
    // 2027 exists (Markt planen); 2028 is new for the flea market, both are new for the festival (no template).
    expect(result).toMatchObject({ created: 3, tasks: 4 });
    const season = await seasonOf(2028);
    expect(season.expectedStart).toBe("2028-03-05");
    const tasks = await byKey(season.id);
    // 05.03.2028 − 240 = 09.07.2027.
    expect(tasks.get("termine_planen")?.dueAt?.toISOString()).toBe("2027-07-09T07:00:00.000Z");
    // No dates yet → no season_end → no due date (like a missing event anchor).
    expect(tasks.get("saisonabschluss")?.dueAt).toBeNull();
    // A market without season items keeps no empty season checklist.
    const [festival] = await db
      .select()
      .from(eventSeason)
      .where(eq(eventSeason.presetId, cat.presets.festival.id))
      .limit(1);
    expect(
      await db
        .select()
        .from(checklist)
        .where(eq(checklist.seasonId, festival?.id ?? "")),
    ).toHaveLength(0);
  });

  it("does not bring later template versions to existing seasons (no automatic propagation)", async () => {
    const first = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    expect(first.tasks).toBe(4);
    const draft = await createDraft(owner, templateId);
    await addTemplateItem(
      owner,
      draft.versionId,
      baseItem({
        title: "Genehmigung",
        scope: "season",
        anchorKey: "season_start",
        offsetDays: -180,
      }),
    );
    await publishDraft(owner, draft.versionId, "Genehmigung");

    await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    expect((await seasonTasks(first.id)).map((t) => t.templateStableKey)).not.toContain(
      "genehmigung",
    );
    // A season made afterwards gets the current version.
    const later = await ensureEventSeason(owner, cat.presets.flea.id, 2029);
    expect((await byKey(later.id)).has("genehmigung")).toBe(true);
    expect(later.tasks).toBe(5);
  });

  it("keeps season items off events, also when a version is propagated to them", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02"]);
    if (!created) throw new Error("no event");
    const draft = await createDraft(owner, templateId);
    await addTemplateItem(
      owner,
      draft.versionId,
      baseItem({
        title: "Genehmigung",
        scope: "season",
        anchorKey: "season_start",
        offsetDays: -180,
      }),
    );
    await addTemplateItem(owner, draft.versionId, baseItem({ title: "Plakate", offsetDays: -14 }));
    await publishDraft(owner, draft.versionId, "Neu");
    const result = await applyTemplateVersion(owner, templateId, [created.id]);
    expect(result.added).toBe(1);
    const keys = (await db.select().from(task).where(eq(task.eventId, created.id))).map(
      (t) => t.templateStableKey,
    );
    expect(keys.sort()).toEqual(["aufbau", "plakate"]);
  });
});

describe("template items with a scope", () => {
  it("keeps season items on season anchors and children in their parent's scope", async () => {
    const draft = await createDraft(owner, templateId);
    await expect(
      addTemplateItem(
        owner,
        draft.versionId,
        baseItem({ title: "Falsch", scope: "season", anchorKey: "event_day" }),
      ),
    ).rejects.toThrow("invalid_anchor");
    await expect(
      addTemplateItem(
        owner,
        draft.versionId,
        baseItem({ title: "Falsch", anchorKey: "season_start" }),
      ),
    ).rejects.toThrow("invalid_anchor");

    const items = await db
      .select({ key: templateItem.stableKey, scope: templateItem.scope })
      .from(templateItem)
      .where(eq(templateItem.versionId, draft.versionId));
    // The draft copied every item with its scope; the children took the parent's.
    expect(Object.fromEntries(items.map((i) => [i.key, i.scope]))).toEqual({
      termine_planen: "season",
      rhythmus: "season",
      notiz: "season",
      aufbau: "event",
      saisonabschluss: "season",
    });

    // An update without a scope keeps the stored one (editors that don't know scopes yet).
    const { scope: _scope, ...withoutScope } = baseItem({
      title: "Saisonabschluss",
      phase: "post",
      anchorKey: "season_end",
      offsetDays: 21,
    });
    await updateTemplateItem(owner, draft.versionId, "saisonabschluss", withoutScope);
    const [row] = await db
      .select()
      .from(templateItem)
      .where(
        and(
          eq(templateItem.versionId, draft.versionId),
          eq(templateItem.stableKey, "saisonabschluss"),
        ),
      );
    expect(row).toMatchObject({ scope: "season", offsetDays: 21 });

    // Turning a parent into an event item takes its children along, unless one has its own season date.
    await expect(
      updateTemplateItem(
        owner,
        draft.versionId,
        "termine_planen",
        baseItem({
          title: "Termine planen",
          scope: "event",
          anchorKey: "event_day",
          offsetDays: -240,
        }),
      ),
    ).rejects.toThrow("invalid_anchor");
    expect(
      await db
        .select()
        .from(templateItem)
        .where(and(eq(templateItem.versionId, draft.versionId), isNull(templateItem.parentKey))),
    ).toHaveLength(3);
  });

  it("moves a season row past the next season row, whatever its phase (the editor's Saison section)", async () => {
    const draft = await createDraft(owner, templateId);
    const order = async () =>
      (
        await db
          .select({ key: templateItem.stableKey, sort: templateItem.sort })
          .from(templateItem)
          .where(and(eq(templateItem.versionId, draft.versionId), isNull(templateItem.parentKey)))
          .orderBy(asc(templateItem.sort))
      ).map((i) => i.key);
    expect(await order()).toEqual(["termine_planen", "aufbau", "saisonabschluss"]);
    // "Saisonabschluss" (post) goes up past "Aufbau" (an event row) to before "Termine planen" (pre).
    await moveTemplateItem(owner, draft.versionId, "saisonabschluss", "up");
    expect(await order()).toEqual(["saisonabschluss", "termine_planen", "aufbau"]);
    // "Aufbau" has no event sibling in its phase: it stays.
    expect(await moveTemplateItem(owner, draft.versionId, "aufbau", "up")).toEqual({
      moved: false,
    });
  });
});
