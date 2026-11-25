import {
  auditLog,
  checklist,
  eventPreset,
  eventSeason,
  eventSeasonAnchor,
  task,
} from "@marktwerk/db/schema";
import { eventSeasons } from "@marktwerk/jobs";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset } from "@/server/services/events";
import { ensureEventSeason } from "@/server/services/seasons";
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

const seasonsOf = (presetId: string) =>
  db
    .select()
    .from(eventSeason)
    .where(eq(eventSeason.presetId, presetId))
    .orderBy(asc(eventSeason.season));

async function anchorsOf(seasonId: string) {
  const rows = await db
    .select({ key: eventSeasonAnchor.key, date: eventSeasonAnchor.date })
    .from(eventSeasonAnchor)
    .where(eq(eventSeasonAnchor.seasonId, seasonId));
  return Object.fromEntries(rows.map((r) => [r.key, r.date]));
}

describe("ensureEventSeason", () => {
  it("creates the record with 1 January and planning when the market has no history, once", async () => {
    const first = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    expect(first).toMatchObject({ created: true, status: "planning", tasks: 0 });
    const again = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    expect(again).toMatchObject({ id: first.id, created: false, status: "planning" });

    const rows = await seasonsOf(cat.presets.flea.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ season: 2028, expectedStart: "2028-01-01", archivedAt: null });
    expect(await anchorsOf(first.id)).toEqual({ season_start: "2028-01-01" });

    const entries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "season.create"), eq(auditLog.entityId, first.id)));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorId: owner.id, entityType: "event_season" });
    expect(entries[0]?.diff).toMatchObject({
      presetId: cat.presets.flea.id,
      season: 2028,
      expectedStart: "2028-01-01",
      status: "planning",
      source: "manual",
    });
  });

  it("expects last season's first date moved to the same weekday and week", async () => {
    // Sundays 07.03. and 04.04.2027 (KW 9 is the first) → Sunday of KW 9 2028 = 05.03.2028.
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-04-04", "2027-03-07"]);
    const next = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    const [row] = await db.select().from(eventSeason).where(eq(eventSeason.id, next.id));
    expect(row?.expectedStart).toBe("2028-03-05");
    expect(await anchorsOf(next.id)).toEqual({ season_start: "2028-03-05" });
  });

  it("is refused for field staff and checks its input", async () => {
    const field = await createActor("field", "field@test.local");
    await expect(ensureEventSeason(field, cat.presets.flea.id, 2028)).rejects.toThrow();
    await expect(ensureEventSeason(owner, "nope", 2028)).rejects.toThrow("preset_not_found");
    await expect(
      ensureEventSeason(owner, "00000000-0000-7000-8000-000000000000", 2028),
    ).rejects.toThrow("preset_not_found");
    await expect(ensureEventSeason(owner, cat.presets.flea.id, 20280)).rejects.toThrow(
      "invalid_season",
    );
    expect(await db.select().from(eventSeason)).toHaveLength(0);
  });
});

describe("Markt planen", () => {
  it("creates the season of every year it plans dates in, with anchors from the dates", async () => {
    await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2027-03-07",
      "2027-10-03",
      "2028-03-05",
    ]);
    const rows = await seasonsOf(cat.presets.flea.id);
    expect(rows.map((r) => [r.season, r.status])).toEqual([
      [2027, "dates_set"],
      [2028, "dates_set"],
    ]);
    const [s2027, s2028] = rows;
    if (!s2027 || !s2028) throw new Error("missing seasons");
    expect(await anchorsOf(s2027.id)).toEqual({
      season_start: "2027-03-07",
      season_end: "2027-10-03",
    });
    expect(await anchorsOf(s2028.id)).toEqual({
      season_start: "2028-03-05",
      season_end: "2028-03-05",
    });
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, "season.create"));
    expect(entries.map((e) => (e.diff as { source: string }).source)).toEqual([
      "markt_planen",
      "markt_planen",
    ]);
  });

  it("creates a season that is already over as closed, without season work", async () => {
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2020-05-03"]);
    const [row] = await seasonsOf(cat.presets.flea.id);
    expect(row).toMatchObject({ season: 2020, status: "closed" });
    if (!row) throw new Error("missing season");
    expect(await db.select().from(checklist).where(eq(checklist.seasonId, row.id))).toHaveLength(0);
  });
});

describe("nightly job event-seasons", () => {
  it("keeps a record for the current and the next year of every active market, idempotently", async () => {
    // A third market that is archived and a fourth that is inactive get none.
    const [archived, inactive] = await db
      .insert(eventPreset)
      .values([
        { ...presetValues("archived"), archivedAt: new Date() },
        { ...presetValues("inactive"), active: false },
      ])
      .returning();
    if (!archived || !inactive) throw new Error("insert failed");

    // 31.12.2026 23:30 UTC is already 1 January 2027 in Berlin.
    const now = new Date("2026-12-31T23:30:00Z");
    const first = await eventSeasons(db, now);
    expect(first).toEqual({ markets: 2, created: 4, tasks: 0 });
    for (const preset of [cat.presets.flea, cat.presets.festival])
      expect((await seasonsOf(preset.id)).map((s) => s.season)).toEqual([2027, 2028]);
    expect(await seasonsOf(archived.id)).toHaveLength(0);
    expect(await seasonsOf(inactive.id)).toHaveLength(0);

    const again = await eventSeasons(db, now);
    expect(again).toEqual({ markets: 2, created: 0, tasks: 0 });
    expect(await db.select().from(eventSeason)).toHaveLength(4);

    const entries = await db.select().from(auditLog).where(eq(auditLog.action, "season.create"));
    expect(entries).toHaveLength(4);
    expect(entries.every((e) => e.actorId === null)).toBe(true);
    expect(entries.every((e) => (e.diff as { source: string }).source === "job")).toBe(true);
  });

  it("leaves a record that exists alone (status, expected start, anchors)", async () => {
    const made = await ensureEventSeason(owner, cat.presets.flea.id, 2027);
    await db
      .update(eventSeason)
      .set({ expectedStart: "2027-02-14", status: "dates_set" })
      .where(eq(eventSeason.id, made.id));
    await eventSeasons(db, new Date("2026-11-13T12:00:00Z"));
    const [row] = await db.select().from(eventSeason).where(eq(eventSeason.id, made.id));
    expect(row).toMatchObject({ expectedStart: "2027-02-14", status: "dates_set" });
    expect((await seasonsOf(cat.presets.flea.id)).map((s) => s.season)).toEqual([2026, 2027]);
    expect(await db.select().from(task)).toHaveLength(0);
  });
});

function presetValues(key: string) {
  return {
    key,
    eventTypeId: cat.type.id,
    venueId: cat.venue.id,
    name: key,
    pricePerMCents: 1000,
    bookingFeeCents: 0,
    schedule: cat.schedule,
    rules: cat.type.rules,
  };
}
