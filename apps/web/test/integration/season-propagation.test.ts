import { auditLog, checklist, eventSeason, task } from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset } from "@/server/services/events";
import { ensureEventSeason } from "@/server/services/seasons";
import {
  applyTemplateVersion,
  previewTemplateApplication,
  TemplateApplyError,
} from "@/server/services/template-propagation";
import {
  addTemplateItem,
  createDraft,
  deleteTemplateItem,
  publishDraft,
  updateTemplateItem,
} from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

/**
 * Fahrplan R14 (research 13 §6.2): season items propagate like event items, through the one propagation path
 * ("Auf Veranstaltungen anwenden…"), with a preview and nothing pre-selected; the target list shows Saison records
 * next to events. Existing seasons only get a new version this way.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let templateId: string;
let eventId: string; // 07.03.2027
let season2027: string;
let season2028: string;

const termine = baseItem({
  title: "Termine planen",
  scope: "season",
  anchorKey: "season_start",
  offsetDays: -240,
});
const genehmigung = baseItem({
  title: "Saisongenehmigung",
  scope: "season",
  category: "permits",
  anchorKey: "season_start",
  offsetDays: -180,
});
const abschluss = baseItem({
  title: "Saisonabschluss",
  phase: "post",
  scope: "season",
  anchorKey: "season_end",
  offsetDays: 14,
});
const aufbau = baseItem({ title: "Aufbau", phase: "live", anchorKey: "setup_day", offsetDays: 0 });

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  ({ templateId } = await seedPublishedTemplate(owner, [termine, genehmigung, abschluss, aufbau], {
    presetIds: [cat.presets.flea.id],
  }));
  const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-03-07"]);
  if (!created) throw new Error("no event");
  eventId = created.id;
  season2027 = (await seasonOf(2027)).id;
  season2028 = (await ensureEventSeason(owner, cat.presets.flea.id, 2028)).id;
});

afterAll(async () => {
  await db.$client.end();
});

async function seasonOf(season: number) {
  const [row] = await db
    .select()
    .from(eventSeason)
    .where(and(eq(eventSeason.presetId, cat.presets.flea.id), eq(eventSeason.season, season)));
  if (!row) throw new Error(`no season ${season}`);
  return row;
}

const taskOf = async (seasonId: string, key: string) => {
  const [row] = await db
    .select()
    .from(task)
    .where(and(eq(task.seasonId, seasonId), eq(task.templateStableKey, key)));
  return row;
};

const keysOf = async (where: ReturnType<typeof eq>) =>
  (await db.select().from(task).where(where)).map((t) => t.templateStableKey).sort();

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof TemplateApplyError ? error.code : error;
  }
};

/**
 * Version 2: "Termine planen" is due earlier, "Saisongenehmigung" is gone, a season item "Plakatflächen
 * buchen" with a child item is new, and an event item "Plakate" is new.
 */
async function publishVersion2() {
  const draft = await createDraft(owner, templateId);
  await updateTemplateItem(owner, draft.versionId, "termine_planen", {
    ...termine,
    title: "Termine für die Saison planen",
    offsetDays: -250,
  });
  await deleteTemplateItem(owner, draft.versionId, "saisongenehmigung");
  await addTemplateItem(
    owner,
    draft.versionId,
    baseItem({
      title: "Plakatflächen buchen",
      scope: "season",
      anchorKey: "season_start",
      offsetDays: -60,
    }),
  );
  // A child item: no scope given, it takes its parent's (season).
  await addTemplateItem(
    owner,
    draft.versionId,
    baseItem({ title: "Angebote vergleichen", parentKey: "plakatflaechen_buchen" }),
  );
  await addTemplateItem(owner, draft.versionId, baseItem({ title: "Plakate", offsetDays: -14 }));
  await publishDraft(owner, draft.versionId, "Version 2");
  return draft;
}

describe("preview with seasons", () => {
  it("lists nothing while the seasons are at the published version", async () => {
    const preview = await previewTemplateApplication(owner, templateId);
    expect(preview.seasons).toEqual([]);
    expect(preview.events).toEqual([]);
  });

  it("lists the open seasons next to the events, each with its season items' changes", async () => {
    await publishVersion2();
    const preview = await previewTemplateApplication(owner, templateId);
    expect(preview.events.map((e) => e.eventId)).toEqual([eventId]);
    // The event only sees the event item.
    expect(preview.events[0]?.add.map((a) => a.key)).toEqual(["plakate"]);

    expect(preview.seasons.map((s) => s.seasonId)).toEqual([season2027, season2028]);
    const s27 = preview.seasons[0];
    expect(s27).toMatchObject({
      name: "Testflohmarkt",
      season: 2027,
      status: "dates_set",
      seasonStart: "2027-03-07",
      fromVersion: 1,
      size: 4,
    });
    expect(s27?.add.map((a) => a.key)).toEqual(["plakatflaechen_buchen", "angebote_vergleichen"]);
    expect(s27?.update).toEqual([
      expect.objectContaining({ key: "termine_planen", changes: ["title", "due"] }),
    ]);
    expect(s27?.remove.map((r) => r.title)).toEqual(["Saisongenehmigung"]);
    // 07.03.2027 − 60 days = 06.01.2027, 09:00 CET.
    expect(new Date(s27?.add[0]?.dueAt ?? 0).toISOString()).toBe("2027-01-06T08:00:00.000Z");

    // Nothing was written by the preview.
    expect(await taskOf(season2027, "plakatflaechen_buchen")).toBeUndefined();
  });

  it("leaves out closed, archived and past seasons", async () => {
    await publishVersion2();
    await db.update(eventSeason).set({ status: "closed" }).where(eq(eventSeason.id, season2027));
    await db
      .update(eventSeason)
      .set({ archivedAt: new Date() })
      .where(eq(eventSeason.id, season2028));
    const past = await ensureEventSeason(owner, cat.presets.flea.id, 2020);
    const preview = await previewTemplateApplication(owner, templateId);
    expect(preview.seasons.map((s) => s.seasonId)).not.toContain(past.id);
    expect(preview.seasons).toEqual([]);
    expect(await codeOf(applyTemplateVersion(owner, templateId, [], [season2027]))).toBe(
      "not_applicable",
    );
  });

  it("offers a season without a checklist once the version has season items for it", async () => {
    // The festival market has no template yet: its season has no checklist.
    const festival = await ensureEventSeason(owner, cat.presets.festival.id, 2027);
    const { templateId: other } = await seedPublishedTemplate(owner, [aufbau], {
      name: "Nur Termine",
      presetIds: [cat.presets.festival.id],
    });
    // Event items only: the season is not a target (it would get an empty checklist).
    expect((await previewTemplateApplication(owner, other)).seasons).toEqual([]);

    const draft = await createDraft(owner, other);
    await addTemplateItem(owner, draft.versionId, termine);
    await publishDraft(owner, draft.versionId, "Saison");
    const preview = await previewTemplateApplication(owner, other);
    expect(preview.seasons).toEqual([
      expect.objectContaining({ seasonId: festival.id, checklistId: null, fromVersion: null }),
    ]);
    const result = await applyTemplateVersion(owner, other, [], [festival.id]);
    expect(result).toMatchObject({ events: 0, seasons: 1, added: 1 });
    const lists = await db.select().from(checklist).where(eq(checklist.seasonId, festival.id));
    expect(lists).toEqual([
      expect.objectContaining({ templateId: other, templateVersionId: draft.versionId }),
    ]);
    expect(await taskOf(festival.id, "termine_planen")).toMatchObject({
      checklistId: lists[0]?.id,
      eventId: null,
    });
  });
});

describe("applying to seasons", () => {
  it("adds and updates season tasks of the chosen seasons only, through the one path", async () => {
    const v2 = await publishVersion2();
    const result = await applyTemplateVersion(owner, templateId, [], [season2027]);
    expect(result).toMatchObject({
      events: 0,
      seasons: 1,
      added: 2,
      updated: 1,
      removed: 1,
      perSeason: [{ seasonId: season2027, added: 2, updated: 1, removed: 1, cancelled: 0 }],
    });

    const planen = await taskOf(season2027, "termine_planen");
    expect(planen).toMatchObject({ title: "Termine für die Saison planen", offsetDays: -250 });
    // 07.03.2027 − 250 days = 30.06.2026, 09:00 summer time.
    expect(planen?.dueAt?.toISOString()).toBe("2026-06-30T07:00:00.000Z");
    const plakat = await taskOf(season2027, "plakatflaechen_buchen");
    expect(plakat).toMatchObject({ seasonId: season2027, eventId: null, source: "template" });
    // The child item became a subtask of the new season task.
    expect(await taskOf(season2027, "angebote_vergleichen")).toMatchObject({
      parentTaskId: plakat?.id,
      seasonId: season2027,
    });
    // Removed from the template: marked, not deleted.
    expect(await taskOf(season2027, "saisongenehmigung")).toMatchObject({
      removedFromTemplate: true,
      status: "todo",
    });

    // The checklist knows its version; the other season and the event stay as they were.
    const [list] = await db.select().from(checklist).where(eq(checklist.seasonId, season2027));
    expect(list?.templateVersionId).toBe(v2.versionId);
    expect(await taskOf(season2028, "plakatflaechen_buchen")).toBeUndefined();
    expect(await keysOf(eq(task.eventId, eventId))).toEqual(["aufbau"]);

    // Audited on the Saison record.
    const entries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "template.apply"), eq(auditLog.entityId, season2027)));
    expect(entries).toEqual([
      expect.objectContaining({
        entityType: "event_season",
        diff: expect.objectContaining({ fromVersion: 1, toVersion: 2, added: 2, removed: 1 }),
      }),
    ]);

    // Applied seasons drop out of the preview; the rest stays.
    const preview = await previewTemplateApplication(owner, templateId);
    expect(preview.seasons.map((s) => s.seasonId)).toEqual([season2028]);
    expect(await codeOf(applyTemplateVersion(owner, templateId, [], [season2027]))).toBe(
      "not_applicable",
    );
  });

  it("applies to events and seasons in one go, season items never reach events", async () => {
    await publishVersion2();
    const result = await applyTemplateVersion(
      owner,
      templateId,
      [eventId],
      [season2027, season2028],
    );
    expect(result).toMatchObject({ events: 1, seasons: 2, added: 5, updated: 2, removed: 2 });
    expect(await keysOf(eq(task.eventId, eventId))).toEqual(["aufbau", "plakate"]);
    expect(await keysOf(eq(task.seasonId, season2028))).toEqual([
      "angebote_vergleichen",
      "plakatflaechen_buchen",
      "saisonabschluss",
      "saisongenehmigung",
      "termine_planen",
    ]);
    expect((await previewTemplateApplication(owner, templateId)).seasons).toEqual([]);
  });

  it("never touches done or customised season tasks, nor hand-set dates", async () => {
    await db
      .update(task)
      .set({ status: "done", completedAt: new Date() })
      .where(and(eq(task.seasonId, season2027), eq(task.templateStableKey, "termine_planen")));
    await db
      .update(task)
      .set({ customized: true })
      .where(and(eq(task.seasonId, season2027), eq(task.templateStableKey, "saisongenehmigung")));
    const handSet = new Date("2027-01-15T08:00:00.000Z");
    await db
      .update(task)
      .set({ dueAt: handSet, dueOverridden: true })
      .where(and(eq(task.seasonId, season2028), eq(task.templateStableKey, "termine_planen")));
    const doneBefore = await taskOf(season2027, "termine_planen");

    await publishVersion2();
    const preview = await previewTemplateApplication(owner, templateId);
    const s27 = preview.seasons.find((s) => s.seasonId === season2027);
    expect(s27?.keep.map((k) => [k.title, k.reason])).toEqual([
      ["Termine planen", "closed"],
      ["Saisongenehmigung", "customized"],
    ]);
    expect(s27?.update).toEqual([]);
    expect(s27?.remove).toEqual([]);

    await applyTemplateVersion(owner, templateId, [], [season2027, season2028]);
    expect(await taskOf(season2027, "termine_planen")).toEqual(doneBefore);
    expect(await taskOf(season2027, "saisongenehmigung")).toMatchObject({
      removedFromTemplate: false,
      customized: true,
      title: "Saisongenehmigung",
    });
    // The title follows, the date set by hand stays.
    const planen28 = await taskOf(season2028, "termine_planen");
    expect(planen28).toMatchObject({ title: "Termine für die Saison planen", offsetDays: -250 });
    expect(planen28?.dueAt?.toISOString()).toBe(handSet.toISOString());
  });

  it("checks the chosen seasons", async () => {
    await publishVersion2();
    expect(await codeOf(applyTemplateVersion(owner, templateId, [], []))).toBe("no_events");
    expect(await codeOf(applyTemplateVersion(owner, templateId, [], ["nope"]))).toBe(
      "not_applicable",
    );
    // A season id passed as an event (or the other way round) is not a target of that kind.
    expect(await codeOf(applyTemplateVersion(owner, templateId, [season2027]))).toBe(
      "not_applicable",
    );
    expect(await codeOf(applyTemplateVersion(owner, templateId, [], [eventId]))).toBe(
      "not_applicable",
    );
    // Nothing was written.
    expect(await taskOf(season2027, "plakatflaechen_buchen")).toBeUndefined();
  });
});
