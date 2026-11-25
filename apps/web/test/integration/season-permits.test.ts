import {
  auditLog,
  dutyRole,
  event,
  eventPermit,
  eventPreset,
  eventSeason,
  permit,
  permitRequirement,
  task,
} from "@marktwerk/db/schema";
import { and, asc, eq, ne } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { previewGeneration } from "@/server/queries/generation-preview";
import { getPermit } from "@/server/queries/permits";
import { createEventsFromPreset } from "@/server/services/events";
import { applyRequirementsToUpcomingEvents } from "@/server/services/permit-requirements";
import { setPermitStatus } from "@/server/services/permits";
import { ensureEventSeason } from "@/server/services/seasons";
import { PERMIT_SHARED_REASON } from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

/*
 * Season permits and the Saison record (research 13 §6.1, Fahrplan R11) and one permit per market at places with
 * several markets (Fahrplan R27). The test catalogue has two markets at one place: the flea market
 * ("Testflohmarkt") and the Stadtfest ("Teststadtfest"), like Rodenkirchen, Kerpen or Stadion + P6.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;

const TODAY = "2026-11-13";
const GENEHMIGUNG = "Genehmigung beantragen";
const SEVEN = [
  "2027-04-04",
  "2027-05-02",
  "2027-06-06",
  "2027-07-04",
  "2027-08-01",
  "2027-09-05",
  "2027-10-03",
];

/** The flea market's template: the season item "Genehmigung beantragen" next to an event item. */
async function seasonTemplate(extra: Parameters<typeof baseItem>[0][] = []) {
  return seedPublishedTemplate(
    owner,
    [
      baseItem({
        title: GENEHMIGUNG,
        category: "permits",
        scope: "season",
        anchorKey: "season_start",
        offsetDays: -180,
        permitType: "market_permit",
        isKey: true,
      }),
      baseItem({ title: "Aufbau", phase: "live", anchorKey: "setup_day", offsetDays: 0 }),
      ...extra.map((patch) => baseItem(patch)),
    ],
    { presetIds: [cat.presets.flea.id] },
  );
}

async function requirement(patch: Partial<typeof permitRequirement.$inferInsert> = {}) {
  const [row] = await db
    .insert(permitRequirement)
    .values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "market_permit",
      title: "Marktgenehmigung",
      cadence: "per_season",
      leadTimeDays: 120,
      ...patch,
    })
    .returning();
  if (!row) throw new Error("no requirement");
  return row;
}

const seasonOf = async (presetId: string, season: number) => {
  const [row] = await db
    .select()
    .from(eventSeason)
    .where(and(eq(eventSeason.presetId, presetId), eq(eventSeason.season, season)));
  if (!row) throw new Error(`no season ${season}`);
  return row;
};

/** Apply tasks of a permit that are not deleted. */
const applyTasks = (permitId: string) =>
  db
    .select()
    .from(task)
    .where(and(eq(task.permitId, permitId), ne(task.status, "cancelled")));

const permitsOf = (presetId: string) =>
  db
    .selectDistinct({ id: permit.id, title: permit.title, seasonId: permit.seasonId })
    .from(permit)
    .innerJoin(eventPermit, eq(eventPermit.permitId, permit.id))
    .innerJoin(event, eq(event.id, eventPermit.eventId))
    .where(eq(event.presetId, presetId));

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  await db.insert(dutyRole).values({ key: "permits", nameDe: "Genehmigungen", nameEn: "Permits" });
  await db
    .update(eventPreset)
    .set({ defaultDuties: { permits: cat.staff.anna.id } })
    .where(eq(eventPreset.id, cat.presets.flea.id));
});

afterAll(async () => {
  await db.$client.end();
});

describe("season permits link to their Saison record (Fahrplan R11)", () => {
  it("a season permit for a market with 7 dates has exactly one apply task, the season task", async () => {
    await seasonTemplate();
    await requirement();
    await createEventsFromPreset(owner, cat.presets.flea.id, SEVEN.slice().reverse());

    const season = await seasonOf(cat.presets.flea.id, 2027);
    const permits = await db.select().from(permit);
    expect(permits).toHaveLength(1);
    const p = permits[0] as typeof permit.$inferSelect;
    expect(p).toMatchObject({ seasonId: season.id, season: 2027, venueId: cat.venue.id });
    expect(await db.select().from(eventPermit)).toHaveLength(7);

    const tasks = await applyTasks(p.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: GENEHMIGUNG,
      source: "template",
      seasonId: season.id,
      eventId: null,
      status: "todo",
    });
    // No own "beantragen" task and nothing to clean up: the events never had an apply task.
    expect(await db.select().from(task).where(eq(task.source, "permit"))).toHaveLength(0);
    expect(await db.select().from(task).where(eq(task.status, "cancelled"))).toHaveLength(0);

    // The permit drawer lists it, labelled with the market and season.
    const drawer = await getPermit(owner, p.id, TODAY);
    expect(drawer?.tasks).toHaveLength(1);
    expect(drawer?.tasks[0]).toMatchObject({
      id: tasks[0]?.id,
      title: GENEHMIGUNG,
      eventId: null,
      seasonMarketName: "Testflohmarkt",
      seasonYear: 2027,
    });

    // Applying for the permit closes the season task.
    const applied = await setPermitStatus(owner, p.id, "applied");
    expect(applied.closedTaskIds).toEqual([tasks[0]?.id]);
  });

  it("works the same when the Saison record (nightly job) came before the dates, added in two runs", async () => {
    await seasonTemplate();
    await requirement();
    const record = await ensureEventSeason(owner, cat.presets.flea.id, 2027);
    await createEventsFromPreset(owner, cat.presets.flea.id, SEVEN.slice(0, 3));
    await createEventsFromPreset(owner, cat.presets.flea.id, SEVEN.slice(3));

    const [p] = await db.select().from(permit);
    expect(p?.seasonId).toBe(record.id);
    expect((await applyTasks(p?.id as string)).map((t) => t.seasonId)).toEqual([record.id]);
    expect(await db.select().from(eventPermit)).toHaveLength(7);
  });

  it("replaces the first-event rule: event apply tasks of the same permit are removed, worked-on ones stay", async () => {
    // A market's own copy still holds the old event item next to the new season item.
    await seasonTemplate([
      {
        title: "Marktgenehmigung bei der Stadt beantragen",
        category: "permits",
        offsetDays: -120,
        permitType: "market_permit",
      },
    ]);
    await requirement();
    await createEventsFromPreset(owner, cat.presets.flea.id, SEVEN.slice(0, 3));

    const season = await seasonOf(cat.presets.flea.id, 2027);
    const [p] = await db.select().from(permit);
    expect((await applyTasks(p?.id as string)).map((t) => t.seasonId)).toEqual([season.id]);
    const removed = await db
      .select()
      .from(task)
      .where(and(eq(task.permitId, p?.id as string), eq(task.status, "cancelled")));
    expect(removed).toHaveLength(3);
    expect(removed.every((t) => t.eventId !== null)).toBe(true);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, removed[0]?.id as string), eq(auditLog.action, "task.delete")),
      );
    expect(entry?.diff).toMatchObject({ auto: true, reason: PERMIT_SHARED_REASON });
  });

  it("keeps the interim rule for a market without season items (the first event carries it)", async () => {
    await seedPublishedTemplate(
      owner,
      [
        baseItem({
          title: "Marktgenehmigung bei der Stadt beantragen",
          category: "permits",
          offsetDays: -120,
          permitType: "market_permit",
        }),
      ],
      { presetIds: [cat.presets.flea.id] },
    );
    await requirement();
    await createEventsFromPreset(owner, cat.presets.flea.id, SEVEN.slice(0, 3));
    const [p] = await db.select().from(permit);
    // The permit still belongs to the market's season (R27), but the first event carries the apply task.
    expect(p?.seasonId).toBe((await seasonOf(cat.presets.flea.id, 2027)).id);
    const tasks = await applyTasks(p?.id as string);
    const [first] = await db
      .select()
      .from(event)
      .where(eq(event.startsOn, SEVEN[0] as string));
    expect(tasks.map((t) => [t.eventId, t.seasonId])).toEqual([[first?.id, null]]);
  });

  it("a multi-year permit keeps its one apply task when the market's next season joins it", async () => {
    await seasonTemplate();
    await requirement({ cadence: "multi_year" });
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02"]);
    const [p] = await db.select().from(permit);
    const s27 = await seasonOf(cat.presets.flea.id, 2027);
    expect(p).toMatchObject({ seasonId: s27.id, season: null });

    await createEventsFromPreset(owner, cat.presets.flea.id, ["2028-05-07"]);
    expect(await db.select().from(permit)).toHaveLength(1);
    expect(await db.select().from(eventPermit)).toHaveLength(2);
    // 2028's season task linked to the permit that covers it, and removed as a second apply task.
    const s28 = await seasonOf(cat.presets.flea.id, 2028);
    const [later] = await db
      .select()
      .from(task)
      .where(and(eq(task.seasonId, s28.id), eq(task.title, GENEHMIGUNG)));
    expect(later).toMatchObject({ permitId: p?.id, status: "cancelled" });
    expect((await applyTasks(p?.id as string)).map((t) => t.seasonId)).toEqual([s27.id]);

    // The Stadtfest at the same place is another market: it gets its own permit.
    await createEventsFromPreset(owner, cat.presets.festival.id, ["2028-08-04"]);
    expect(await db.select().from(permit)).toHaveLength(2);
  });
});

describe("permit per market at places with several markets (Fahrplan R27)", () => {
  it("a new date of one market never attaches to another market's season permit", async () => {
    await requirement();
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02", "2027-06-06"]);
    await createEventsFromPreset(owner, cat.presets.festival.id, ["2027-08-06"]);
    // A later date of the flea market joins its own permit again.
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-09-05"]);

    const flea = await seasonOf(cat.presets.flea.id, 2027);
    const festival = await seasonOf(cat.presets.festival.id, 2027);
    const permits = await db.select().from(permit).orderBy(asc(permit.title));
    expect(permits.map((p) => [p.title, p.seasonId, p.season])).toEqual([
      ["Marktgenehmigung – Testflohmarkt", flea.id, 2027],
      ["Marktgenehmigung – Teststadtfest", festival.id, 2027],
    ]);
    const fleaPermits = await permitsOf(cat.presets.flea.id);
    const festivalPermits = await permitsOf(cat.presets.festival.id);
    expect(fleaPermits.map((p) => p.seasonId)).toEqual([flea.id]);
    expect(festivalPermits.map((p) => p.seasonId)).toEqual([festival.id]);
    expect(await db.select().from(eventPermit)).toHaveLength(4);
    // Each permit has its own one apply task (no season items here: its own "beantragen" task).
    for (const p of permits) expect(await applyTasks(p.id)).toHaveLength(1);

    // Running the fill again over the place (a requirement applied later) links nothing across markets.
    const again = await applyRequirementsToUpcomingEvents(owner, cat.venue.id);
    expect(again).toMatchObject({ permits: 0, linked: 0 });
    expect(await db.select().from(eventPermit)).toHaveLength(4);

    // The drawer offers only the permit's own market's dates for linking (not the flea market's three).
    const drawer = await getPermit(owner, permits[1]?.id as string, TODAY);
    expect(drawer?.linkableEvents).toEqual([]);
    const fleaDrawer = await getPermit(owner, permits[0]?.id as string, TODAY);
    expect(fleaDrawer?.events).toHaveLength(3);
  });

  it("the Markt planen preview counts another market's permit as missing, its own as covered", async () => {
    await requirement();
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02"]);
    const festival = await previewGeneration(cat.presets.festival.id, ["2027-08-06"]);
    expect(festival.dates[0]).toMatchObject({ permitsCovered: 0, permitsNew: 1 });
    const flea = await previewGeneration(cat.presets.flea.id, ["2027-09-05"]);
    expect(flea.dates[0]).toMatchObject({ permitsCovered: 1, permitsNew: 0 });
  });

  it("a permit without a Saison record keeps the place + season rule for every market", async () => {
    const req = await requirement();
    const [held] = await db
      .insert(permit)
      .values({
        requirementId: req.id,
        venueId: cat.venue.id,
        season: 2027,
        category: "city",
        permitType: "market_permit",
        title: "Marktgenehmigung (alt)",
        status: "granted",
      })
      .returning();
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02"]);
    await createEventsFromPreset(owner, cat.presets.festival.id, ["2027-08-06"]);
    expect(await db.select().from(permit)).toHaveLength(1);
    const links = await db.select().from(eventPermit);
    expect(links.map((l) => l.permitId)).toEqual([held?.id, held?.id]);
  });

  it("the fill makes a missing Saison record through the one creation path", async () => {
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02"]);
    // A record lost (e.g. data from before the Saison record): the next fill brings it back for the permit.
    await db.delete(eventSeason).where(eq(eventSeason.presetId, cat.presets.flea.id));
    await requirement();
    await applyRequirementsToUpcomingEvents(owner, cat.venue.id);
    const record = await seasonOf(cat.presets.flea.id, 2027);
    const [p] = await db.select().from(permit);
    expect(p?.seasonId).toBe(record.id);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "season.create"), eq(auditLog.entityId, record.id)));
    expect(entry?.diff).toMatchObject({ source: "logbook_fill", season: 2027 });
  });
});
