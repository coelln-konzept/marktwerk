import { berlinDay } from "@marktwerk/core";
import { auditLog, eventSeason, eventSeasonAnchor, task } from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getMarketSeasons } from "@/server/queries/seasons";
import { createEventsFromPreset } from "@/server/services/events";
import {
  ensureEventSeason,
  setSeasonExpectedStart,
  setSeasonStatus,
} from "@/server/services/seasons";
import { setTaskStatus } from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;

/** Season work on season_start (−240 days, market lead = Anna) and season_end (+14 days), plus an event item. */
beforeEach(async () => {
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
        dutyRoleId: cat.roles.lead.id,
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

afterAll(async () => {
  await db.$client.end();
});

/** The panel as the market page shows it at `now` (its year is the current season, the year after the next). */
const panel = (now: string) =>
  getMarketSeasons(owner, cat.presets.flea.id, now.slice(0, 10), new Date(now));

async function tasksOf(seasonId: string) {
  const rows = await db.select().from(task).where(eq(task.seasonId, seasonId));
  const byTitle = (title: string) => {
    const row = rows.find((r) => r.title === title);
    if (!row) throw new Error(`no task ${title}`);
    return row;
  };
  return { rows, byTitle };
}

const dueDay = (row: { dueAt: Date | null }) => (row.dueAt ? berlinDay(row.dueAt) : null);

describe("getMarketSeasons (market page Saison panel)", () => {
  it("offers the current year only while the market has no record", async () => {
    const result = await panel("2027-06-01T10:00:00Z");
    expect(result).toEqual({ current: { season: 2027, record: null }, next: null });
  });

  it("shows a season without dates: expected start, editable, planning, tasks open first", async () => {
    const created = await ensureEventSeason(owner, cat.presets.flea.id, 2027);
    const { current, next } = await panel("2027-06-01T10:00:00Z");
    expect(next).toBeNull();
    expect(current.record).toMatchObject({
      id: created.id,
      season: 2027,
      status: "planning",
      expectedStart: "2027-01-01",
      start: { kind: "expected", expectedStart: "2027-01-01" },
      canEditExpectedStart: true,
      suggestedStatus: null,
    });
    // 01.01.2027 − 240 days = 06.05.2026; the close-out item has no date without season_end, so it comes last.
    expect(
      current.record?.tasks?.open.map((t) => [t.title, t.dueOn, t.assigneeName, t.status]),
    ).toEqual([
      ["Termine planen", "2026-05-06", "Anna Test", "todo"],
      ["Saisonabschluss", null, null, "todo"],
    ]);
    expect(current.record?.tasks?.finished).toEqual([]);
  });

  it("shows the next season underneath once it exists, with its dates; finished tasks after the open ones", async () => {
    await ensureEventSeason(owner, cat.presets.flea.id, 2027);
    await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2028-03-05",
      "2028-10-01",
      "2028-06-04",
    ]);
    const before = await panel("2027-06-01T10:00:00Z");
    const next = before.next;
    if (!next) throw new Error("no next season");
    expect(next).toMatchObject({
      season: 2028,
      status: "dates_set",
      start: { kind: "dates", firstDate: "2028-03-05", lastDate: "2028-10-01", events: 3 },
      canEditExpectedStart: false,
      suggestedStatus: null,
    });

    const { byTitle } = await tasksOf(next.id);
    await setTaskStatus(owner, byTitle("Termine planen").id, "done");
    const after = (await panel("2027-06-01T10:00:00Z")).next;
    expect(after?.tasks?.open.map((t) => t.title)).toEqual(["Saisonabschluss"]);
    expect(after?.tasks?.finished.map((t) => [t.title, t.status])).toEqual([
      ["Termine planen", "done"],
    ]);
    // The current season's tasks stay with the current season.
    expect(before.current.record?.tasks?.open.map((t) => t.title)).toEqual([
      "Termine planen",
      "Saisonabschluss",
    ]);
  });

  it("suggests the next status: dates_set once a planning season has dates, closed once all is over", async () => {
    const created = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2028-03-05"]);
    expect((await panel("2027-06-01T10:00:00Z")).next).toMatchObject({
      id: created.id,
      status: "planning",
      suggestedStatus: "dates_set",
    });

    await setSeasonStatus(owner, created.id, "dates_set");
    // After the last day, with every season task done.
    const { rows } = await tasksOf(created.id);
    for (const row of rows) await setTaskStatus(owner, row.id, "done");
    expect((await panel("2028-04-01T10:00:00Z")).current.record).toMatchObject({
      status: "dates_set",
      suggestedStatus: "closed",
    });
  });

  it("leaves out archived seasons and cancelled tasks", async () => {
    const created = await ensureEventSeason(owner, cat.presets.flea.id, 2027);
    const { byTitle } = await tasksOf(created.id);
    await db
      .update(task)
      .set({ status: "cancelled" })
      .where(eq(task.id, byTitle("Saisonabschluss").id));
    expect(
      (await panel("2027-06-01T10:00:00Z")).current.record?.tasks?.open.map((t) => t.title),
    ).toEqual(["Termine planen"]);

    await db
      .update(eventSeason)
      .set({ archivedAt: new Date() })
      .where(eq(eventSeason.id, created.id));
    expect((await panel("2027-06-01T10:00:00Z")).current.record).toBeNull();
  });
});

describe("setSeasonStatus", () => {
  it("switches the status by hand with an audit entry; the undo is the same call back", async () => {
    const { id } = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    expect(await setSeasonStatus(owner, id, "dates_set", "planning")).toEqual({
      from: "planning",
      to: "dates_set",
    });
    expect(await setSeasonStatus(owner, id, "closed", "dates_set")).toEqual({
      from: "dates_set",
      to: "closed",
    });
    // Undo of the last step.
    await setSeasonStatus(owner, id, "dates_set", "closed");
    const [row] = await db.select().from(eventSeason).where(eq(eventSeason.id, id));
    expect(row?.status).toBe("dates_set");

    const entries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "season.status"), eq(auditLog.entityId, id)));
    expect(entries.map((e) => e.diff)).toEqual([
      { presetId: cat.presets.flea.id, season: 2028, from: "planning", to: "dates_set" },
      { presetId: cat.presets.flea.id, season: 2028, from: "dates_set", to: "closed" },
      { presetId: cat.presets.flea.id, season: 2028, from: "closed", to: "dates_set" },
    ]);
    expect(entries[0]).toMatchObject({ actorId: owner.id, entityType: "event_season" });
  });

  it("refuses a stale page, the same status, an unknown status, a missing season and staff", async () => {
    const { id } = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    await expect(setSeasonStatus(owner, id, "closed", "dates_set")).rejects.toThrow("conflict");
    await expect(setSeasonStatus(owner, id, "planning")).rejects.toThrow("invalid_transition");
    await expect(setSeasonStatus(owner, id, "done")).rejects.toThrow("invalid_status");
    await expect(
      setSeasonStatus(owner, "00000000-0000-7000-8000-000000000000", "closed"),
    ).rejects.toThrow("season_not_found");
    await expect(setSeasonStatus(owner, "nope", "closed")).rejects.toThrow("season_not_found");
    const staff = await createActor("staff", "staff@test.local");
    await expect(setSeasonStatus(staff, id, "closed")).rejects.toThrow();

    await db.update(eventSeason).set({ archivedAt: new Date() }).where(eq(eventSeason.id, id));
    await expect(setSeasonStatus(owner, id, "closed")).rejects.toThrow("season_not_found");

    const [row] = await db.select().from(eventSeason).where(eq(eventSeason.id, id));
    expect(row?.status).toBe("planning");
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "season.status"))).toEqual(
      [],
    );
  });
});

describe("setSeasonExpectedStart", () => {
  it("moves season_start and the open season tasks with it; the undo moves them back", async () => {
    const { id } = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    // 01.01.2028 − 240 days = 06.05.2027.
    expect(dueDay((await tasksOf(id)).byTitle("Termine planen"))).toBe("2027-05-06");

    expect(await setSeasonExpectedStart(owner, id, "2028-03-05", "2028-01-01")).toEqual({
      from: "2028-01-01",
      to: "2028-03-05",
      changed: true,
      tasksShifted: 1,
    });
    const [row] = await db.select().from(eventSeason).where(eq(eventSeason.id, id));
    expect(row?.expectedStart).toBe("2028-03-05");
    const anchors = await db
      .select({ key: eventSeasonAnchor.key, date: eventSeasonAnchor.date })
      .from(eventSeasonAnchor)
      .where(eq(eventSeasonAnchor.seasonId, id));
    expect(anchors).toEqual([{ key: "season_start", date: "2028-03-05" }]);
    // 05.03.2028 − 240 days (2028 is a leap year) = 09.07.2027.
    expect(dueDay((await tasksOf(id)).byTitle("Termine planen"))).toBe("2027-07-09");

    const own = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "season.expected_start"), eq(auditLog.entityId, id)));
    expect(own.map((e) => e.diff)).toEqual([
      { presetId: cat.presets.flea.id, season: 2028, from: "2028-01-01", to: "2028-03-05" },
    ]);
    const [anchorEntry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "season.anchors"), eq(auditLog.entityId, id)));
    expect(anchorEntry?.diff).toMatchObject({ cause: "expected_start", tasksShifted: 1 });

    // Undo: the same call back.
    await setSeasonExpectedStart(owner, id, "2028-01-01", "2028-03-05");
    expect(dueDay((await tasksOf(id)).byTitle("Termine planen"))).toBe("2027-05-06");
  });

  it("leaves done tasks where they are and does nothing for the same date", async () => {
    const { id } = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    await setTaskStatus(owner, (await tasksOf(id)).byTitle("Termine planen").id, "done");
    expect(await setSeasonExpectedStart(owner, id, "2028-03-05")).toMatchObject({
      changed: true,
      tasksShifted: 0,
    });
    expect(dueDay((await tasksOf(id)).byTitle("Termine planen"))).toBe("2027-05-06");
    expect(await setSeasonExpectedStart(owner, id, "2028-03-05")).toMatchObject({
      changed: false,
    });
    expect(
      await db.select().from(auditLog).where(eq(auditLog.action, "season.expected_start")),
    ).toHaveLength(1);
  });

  it("refuses dates outside the season, malformed dates, a stale page, seasons with dates and staff", async () => {
    const { id } = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    await expect(setSeasonExpectedStart(owner, id, "2027-12-31")).rejects.toThrow("outside_season");
    await expect(setSeasonExpectedStart(owner, id, "2028-02-30")).rejects.toThrow("invalid_date");
    await expect(setSeasonExpectedStart(owner, id, "2028-03-05", "2028-02-01")).rejects.toThrow(
      "conflict",
    );
    const staff = await createActor("staff", "staff@test.local");
    await expect(setSeasonExpectedStart(staff, id, "2028-03-05")).rejects.toThrow();

    await createEventsFromPreset(owner, cat.presets.flea.id, ["2028-04-02"]);
    await expect(setSeasonExpectedStart(owner, id, "2028-03-05")).rejects.toThrow("has_dates");
    const [row] = await db.select().from(eventSeason).where(eq(eventSeason.id, id));
    expect(row?.expectedStart).toBe("2028-01-01");
  });
});
