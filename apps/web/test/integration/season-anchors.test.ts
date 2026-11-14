import { auditLog, eventSeason, eventSeasonAnchor, task } from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { moveEvent, previewEventMove } from "@/server/services/event-details";
import {
  changeEventStatus,
  deleteEvent,
  revertEventStatus,
} from "@/server/services/event-lifecycle";
import { createEventsFromPreset, undoGeneratedEvents } from "@/server/services/events";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;

/**
 * Season work on season_start (−240 days) and season_end (+14 days), next to one event item. Today is early in
 * 2026, before every due date here: a record created later would set past ones to today (UX-009).
 */
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-02T10:00:00+01:00"));
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  await seedPublishedTemplate(
    owner,
    [
      baseItem({
        title: "Termine planen",
        scope: "season",
        anchorKey: "season_start",
        offsetDays: -240,
      }),
      baseItem({
        title: "Saisonabschluss",
        phase: "post",
        scope: "season",
        anchorKey: "season_end",
        offsetDays: 14,
      }),
      baseItem({ title: "Aufbau", phase: "live", anchorKey: "setup_day", offsetDays: 0 }),
    ],
    { presetIds: [cat.presets.flea.id] },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db.$client.end();
});

async function season(year: number) {
  const [row] = await db
    .select()
    .from(eventSeason)
    .where(and(eq(eventSeason.presetId, cat.presets.flea.id), eq(eventSeason.season, year)));
  if (!row) throw new Error(`no season ${year}`);
  const anchors = await db
    .select({ key: eventSeasonAnchor.key, date: eventSeasonAnchor.date })
    .from(eventSeasonAnchor)
    .where(eq(eventSeasonAnchor.seasonId, row.id));
  const tasks = await db.select().from(task).where(eq(task.seasonId, row.id));
  const due = (key: string) =>
    tasks.find((t) => t.templateStableKey === key)?.dueAt?.toISOString() ?? null;
  return {
    row,
    anchors: Object.fromEntries(anchors.map((a) => [a.key, a.date])),
    tasks,
    termine: due("termine_planen"),
    abschluss: due("saisonabschluss"),
  };
}

const plan = async (...dates: string[]) => {
  const created = await createEventsFromPreset(owner, cat.presets.flea.id, dates);
  return Object.fromEntries(created.map((c) => [c.startsOn, c.id]));
};

const anchorEntries = () => db.select().from(auditLog).where(eq(auditLog.action, "season.anchors"));

describe("season anchors follow the dates (R10)", () => {
  it("moves season_start and the open season tasks when Markt planen adds an earlier date", async () => {
    await plan("2027-04-04", "2027-10-03");
    const before = await season(2027);
    expect(before.anchors).toEqual({ season_start: "2027-04-04", season_end: "2027-10-03" });
    // 04.04.2027 − 240 = 07.08.2026.
    expect(before.termine).toBe("2026-08-07T07:00:00.000Z");

    await plan("2027-03-07");
    const after = await season(2027);
    expect(after.anchors).toEqual({ season_start: "2027-03-07", season_end: "2027-10-03" });
    expect(after.termine).toBe("2026-07-10T07:00:00.000Z");
    expect(after.abschluss).toBe("2027-10-17T07:00:00.000Z");

    const [entry] = await anchorEntries();
    expect(entry).toMatchObject({ actorId: owner.id, entityId: after.row.id });
    expect(entry?.diff).toEqual({
      presetId: cat.presets.flea.id,
      season: 2027,
      anchors: { season_start: { from: "2027-04-04", to: "2027-03-07" } },
      cause: "event_create",
      tasksShifted: 1,
    });
  });

  it("moves open, not overridden season tasks with Verschieben; done and hand-dated ones stay", async () => {
    const ids = await plan("2027-03-07", "2027-10-03");
    const first = ids["2027-03-07"] as string;
    const s = await season(2027);
    const abschluss = s.tasks.find((t) => t.templateStableKey === "saisonabschluss");
    const termine = s.tasks.find((t) => t.templateStableKey === "termine_planen");
    if (!abschluss || !termine) throw new Error("tasks missing");

    // The preview lists the season task that would move (not the event's own tasks).
    const preview = await previewEventMove(owner, first, "2027-02-28");
    expect(preview.seasonShifting.map((x) => [x.title, x.from, x.to])).toEqual([
      ["Termine planen", "2026-07-10", "2026-07-03"],
    ]);
    expect(await season(2027)).toMatchObject({ termine: "2026-07-10T07:00:00.000Z" });

    await moveEvent(owner, first, "2027-02-28", "2027-03-07");
    const moved = await season(2027);
    expect(moved.anchors.season_start).toBe("2027-02-28");
    expect(moved.termine).toBe("2026-07-03T07:00:00.000Z");
    const [move] = await db.select().from(auditLog).where(eq(auditLog.action, "event.move"));
    expect(move?.diff).toMatchObject({ seasonTasksShifted: 1 });

    // Done → never moves; due date set by hand → stays too.
    await db
      .update(task)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(task.id, termine.id));
    await db.update(task).set({ dueOverridden: true }).where(eq(task.id, abschluss.id));
    const last = ids["2027-10-03"] as string;
    await moveEvent(owner, last, "2027-10-10", "2027-10-03");
    await moveEvent(owner, first, "2027-02-21", "2027-02-28");
    const kept = await season(2027);
    expect(kept.anchors).toEqual({ season_start: "2027-02-21", season_end: "2027-10-10" });
    expect(kept.termine).toBe("2026-07-03T07:00:00.000Z");
    expect(kept.abschluss).toBe("2027-10-17T07:00:00.000Z");
  });

  it("follows cancelling and reopening a date", async () => {
    const ids = await plan("2027-03-07", "2027-04-04");
    const first = ids["2027-03-07"] as string;
    await changeEventStatus(owner, first, "cancelled", "Regen");
    expect((await season(2027)).anchors.season_start).toBe("2027-04-04");
    expect((await season(2027)).termine).toBe("2026-08-07T07:00:00.000Z");

    await revertEventStatus(owner, first, "cancelled", "planned");
    expect((await season(2027)).anchors.season_start).toBe("2027-03-07");
    expect((await season(2027)).termine).toBe("2026-07-10T07:00:00.000Z");
    expect((await anchorEntries()).map((e) => (e.diff as { cause: string }).cause)).toEqual([
      "event_status",
      "event_status",
    ]);
  });

  it("falls back to the expected start and drops season_end when the last date is deleted", async () => {
    const ids = await plan("2027-03-07");
    const s = await season(2027);
    expect(s.row.expectedStart).toBe("2027-01-01");
    expect(s.abschluss).toBe("2027-03-21T08:00:00.000Z");

    await deleteEvent(owner, ids["2027-03-07"] as string, "Testflohmarkt");
    const after = await season(2027);
    expect(after.anchors).toEqual({ season_start: "2027-01-01" });
    // 01.01.2027 − 240 = 06.05.2026; the close-out keeps its date (no anchor to follow).
    expect(after.termine).toBe("2026-05-06T07:00:00.000Z");
    expect(after.abschluss).toBe("2027-03-21T08:00:00.000Z");
    const [entry] = await anchorEntries();
    expect(entry?.diff).toMatchObject({
      cause: "event_delete",
      anchors: {
        season_start: { from: "2027-03-07", to: "2027-01-01" },
        season_end: { from: "2027-03-07", to: null },
      },
    });
  });

  it("follows the undo of a generation run (archived dates do not count)", async () => {
    await plan("2027-04-04");
    const ids = await plan("2027-03-07");
    expect((await season(2027)).anchors.season_start).toBe("2027-03-07");
    await undoGeneratedEvents(owner, [ids["2027-03-07"] as string]);
    expect((await season(2027)).anchors.season_start).toBe("2027-04-04");
    expect((await season(2027)).termine).toBe("2026-08-07T07:00:00.000Z");
  });

  it("moving a date into the next year updates both seasons and makes the new one", async () => {
    const ids = await plan("2027-04-04", "2027-10-03");
    await moveEvent(owner, ids["2027-10-03"] as string, "2028-01-09", "2027-10-03");
    expect((await season(2027)).anchors).toEqual({
      season_start: "2027-04-04",
      season_end: "2027-04-04",
    });
    expect((await season(2027)).abschluss).toBe("2027-04-18T07:00:00.000Z");
    const next = await season(2028);
    expect(next.anchors).toEqual({ season_start: "2028-01-09", season_end: "2028-01-09" });
    // 09.01.2028 − 240 = 14.05.2027.
    expect(next.termine).toBe("2027-05-14T07:00:00.000Z");
    const created = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "season.create"), eq(auditLog.entityId, next.row.id)));
    expect(created[0]?.diff).toMatchObject({ source: "event_move" });
  });
});
