import { berlinDay } from "@marktwerk/core";
import { auditLog, eventSeason, eventSeasonAnchor, task, templateItem } from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { getMarketSeasons } from "@/server/queries/seasons";
import { createEventsFromPreset } from "@/server/services/events";
import {
  DATES_PLANNED_REASON,
  ensureEventSeason,
  setSeasonExpectedStart,
  setSeasonStatus,
} from "@/server/services/seasons";
import { setTaskStatus, undoTaskChange } from "@/server/services/tasks";
import { addTemplateItem, createDraft, publishDraft } from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let templateId: string;

/** Today in these tests unless one says otherwise: before every due date below, so nothing is set to today. */
const EARLY = new Date("2026-03-02T10:00:00+01:00");

/** Season work on season_start (−240 days, market lead = Anna) and season_end (+14 days), plus an event item. */
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EARLY);
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  ({ templateId } = await seedPublishedTemplate(
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
  ));
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(result).toEqual({
      current: {
        season: 2027,
        record: null,
        // Nothing to suggest without last year's dates: "Saison anlegen" asks (UX-009).
        missing: { hasDates: false, suggestedStart: null },
      },
      next: null,
    });
  });

  it("suggests the expected start from last year's first date, and asks nothing once the year has dates", async () => {
    // Sunday of KW 10 in 2026 (08.03.) → Sunday of KW 10 in 2027 (14.03.).
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-03-08", "2026-09-06"]);
    expect((await panel("2027-06-01T10:00:00Z")).current.missing).toEqual({
      hasDates: false,
      suggestedStart: "2027-03-14",
    });
    // A year with dates but no record (made before records existed): its first date is the start.
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-04-04"]);
    await db.delete(eventSeason).where(eq(eventSeason.season, 2027));
    expect((await panel("2027-06-01T10:00:00Z")).current.missing).toMatchObject({
      hasDates: true,
    });
  });

  it("names the statuses a season cannot take, counting every open season task", async () => {
    const created = await ensureEventSeason(owner, cat.presets.flea.id, 2027);
    const record = (await panel("2027-06-01T10:00:00Z")).current.record;
    expect(record).toMatchObject({
      id: created.id,
      openSeasonTasks: 2,
      statusBlocks: { planning: null, dates_set: "no_dates", closed: "open_tasks" },
    });
  });

  it("counts the open season tasks a field user does not see", async () => {
    await ensureEventSeason(owner, cat.presets.flea.id, 2027);
    // Anna (market lead) sees her Termine planen; Saisonabschluss has nobody and stays hidden from her.
    const field = {
      ...(await createActor("field")),
      staffMemberId: cat.staff.anna.id,
    };
    const record = (
      await getMarketSeasons(
        field,
        cat.presets.flea.id,
        "2027-06-01",
        new Date("2027-06-01T10:00:00Z"),
      )
    ).current.record;
    expect(record?.tasks?.open.map((t) => t.title)).toEqual(["Termine planen"]);
    expect(record).toMatchObject({
      openSeasonTasks: 2,
      statusBlocks: { closed: "open_tasks" },
    });
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

/** Gives "Termine planen" a subtask ("Rhythmus"), in a new published version. */
async function addSubtaskItem() {
  const draft = await createDraft(owner, templateId);
  await addTemplateItem(
    owner,
    draft.versionId,
    baseItem({ title: "Rhythmus", parentKey: "termine_planen" }),
  );
  await publishDraft(owner, draft.versionId, "Unteraufgabe");
}

describe("Saison anlegen (UX-009)", () => {
  it("takes the expected start asked for and sets season tasks already due to today", async () => {
    vi.setSystemTime(new Date("2026-11-14T10:00:00+01:00"));
    const created = await ensureEventSeason(owner, cat.presets.flea.id, 2027, "2027-03-07");
    expect(created).toMatchObject({
      created: true,
      status: "planning",
      tasks: 2,
      topLevelTasks: 2,
      subtasks: 0,
      dueToday: 1,
    });
    const [row] = await db.select().from(eventSeason).where(eq(eventSeason.id, created.id));
    expect(row?.expectedStart).toBe("2027-03-07");
    // 07.03.2027 − 240 days = 10.07.2026, already past: due today instead, at its time of day.
    const termine = (await tasksOf(created.id)).byTitle("Termine planen");
    expect(termine.dueAt?.toISOString()).toBe("2026-11-14T08:00:00.000Z");
    expect(termine.dueOverridden).toBe(false);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "season.create"), eq(auditLog.entityId, created.id)));
    expect(entry?.diff).toMatchObject({ expectedStart: "2027-03-07", tasks: 2, tasksDueToday: 1 });

    // It still follows the season's dates: a later expected start moves it (05.09.2027 − 240 = 08.01.2027).
    await setSeasonExpectedStart(owner, created.id, "2027-09-05", "2027-03-07");
    expect(dueDay((await tasksOf(created.id)).byTitle("Termine planen"))).toBe("2027-01-08");
  });

  it("keeps the dates of a season created in time and refuses an expected start outside its year", async () => {
    await expect(ensureEventSeason(owner, cat.presets.flea.id, 2027, "2026-12-31")).rejects.toThrow(
      "outside_season",
    );
    await expect(ensureEventSeason(owner, cat.presets.flea.id, 2027, "2027-02-30")).rejects.toThrow(
      "invalid_date",
    );
    expect(await db.select().from(eventSeason)).toEqual([]);

    const created = await ensureEventSeason(owner, cat.presets.flea.id, 2027, "2027-03-07");
    expect(created.dueToday).toBe(0);
    expect(dueDay((await tasksOf(created.id)).byTitle("Termine planen"))).toBe("2026-07-10");
  });

  it("counts top-level tasks like the panel, subtasks apart", async () => {
    await addSubtaskItem();
    const created = await ensureEventSeason(owner, cat.presets.flea.id, 2027);
    expect(created).toMatchObject({ tasks: 3, topLevelTasks: 2, subtasks: 1 });
    expect(await setSeasonExpectedStart(owner, created.id, "2027-03-07")).toMatchObject({
      tasksShifted: 1,
      subtasksShifted: 1,
    });
  });

  /** Keys the fixture's "Termine planen" like the Grundvorlage's item, with "Rhythmus" as its subtask. */
  async function useGrundvorlageKey() {
    await addSubtaskItem();
    await db
      .update(templateItem)
      .set({ parentKey: null })
      .where(eq(templateItem.parentKey, "termine_planen"));
    await db
      .update(templateItem)
      .set({ stableKey: "saison_termine_planen" })
      .where(eq(templateItem.stableKey, "termine_planen"));
    await db
      .update(templateItem)
      .set({ parentKey: "saison_termine_planen" })
      .where(eq(templateItem.title, "Rhythmus"));
  }

  const seasonRecord = async (season: number) => {
    const [row] = await db
      .select()
      .from(eventSeason)
      .where(and(eq(eventSeason.presetId, cat.presets.flea.id), eq(eventSeason.season, season)));
    if (!row) throw new Error(`no season ${season}`);
    return row;
  };

  const statusOf = async (seasonId: string) =>
    (await tasksOf(seasonId)).rows
      .map((r) => [r.title, r.status])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  it("completes the Grundvorlage's Termine planen when Markt planen gives a season its first dates", async () => {
    await useGrundvorlageKey();
    // 2028 has its record before Markt planen, as the nightly job makes it: it is completed too.
    const existing = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-03-07", "2028-03-05"]);

    const season2027 = await seasonRecord(2027);
    for (const id of [season2027.id, existing.id])
      expect(await statusOf(id)).toEqual([
        ["Rhythmus", "done"],
        ["Saisonabschluss", "todo"],
        ["Termine planen", "done"],
      ]);
    const planned = await tasksOf(season2027.id);
    expect(planned.byTitle("Termine planen").completedAt).not.toBeNull();
    // The same entry as a tick (undoable), marked as automatic. In the order written (`at`, then the
    // time-ordered id): without an order Postgres may return them in any order.
    const entries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "task.status"), eq(auditLog.entityType, "task")))
      .orderBy(auditLog.at, auditLog.id);
    expect(entries).toHaveLength(4);
    const parentEntry = entries.find((e) => e.entityId === planned.byTitle("Termine planen").id);
    expect(parentEntry?.diff).toMatchObject({
      from: "todo",
      to: "done",
      before: { status: "todo", completedAt: null },
      after: { status: "done" },
      auto: true,
      reason: DATES_PLANNED_REASON,
    });
    expect(parentEntry?.actorId).toBe(owner.id);
    // Subtask before its parent.
    const rhythmus = planned.byTitle("Rhythmus").id;
    expect(entries.findIndex((e) => e.entityId === rhythmus)).toBeLessThan(
      entries.findIndex((e) => e.entityId === parentEntry?.entityId),
    );

    // Undone, it stays open when Markt planen adds dates to a season that has some already.
    const existingTermine = (await tasksOf(existing.id)).byTitle("Termine planen");
    const existingEntry = entries.find((e) => e.entityId === existingTermine.id);
    if (!existingEntry) throw new Error("no audit entry");
    await undoTaskChange(owner, existingEntry.id);
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2028-06-04"]);
    expect((await tasksOf(existing.id)).byTitle("Termine planen").status).toBe("todo");
  });

  it("leaves Termine planen open when it needs a photo", async () => {
    await useGrundvorlageKey();
    await db
      .update(templateItem)
      .set({ requiresPhoto: true })
      .where(eq(templateItem.stableKey, "saison_termine_planen"));
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-03-07"]);
    expect(await statusOf((await seasonRecord(2027)).id)).toEqual([
      ["Rhythmus", "todo"],
      ["Saisonabschluss", "todo"],
      ["Termine planen", "todo"],
    ]);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "task.status"))).toEqual([]);
  });

  it("keeps a task set to today there while only another anchor moves", async () => {
    vi.setSystemTime(new Date("2026-11-14T10:00:00+01:00"));
    // Record made late by Markt planen: Termine planen (07.03.2027 − 240 days = 10.07.2026) is due today.
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-03-07", "2027-05-02"]);
    const { id } = await seasonRecord(2027);
    expect(dueDay((await tasksOf(id)).byTitle("Termine planen"))).toBe("2026-11-14");
    expect(dueDay((await tasksOf(id)).byTitle("Saisonabschluss"))).toBe("2027-05-16");

    // A date at the end moves only season_end: Saisonabschluss follows, Termine planen stays today.
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-09-05"]);
    expect(dueDay((await tasksOf(id)).byTitle("Termine planen"))).toBe("2026-11-14");
    expect(dueDay((await tasksOf(id)).byTitle("Saisonabschluss"))).toBe("2027-09-19");
    const [anchorEntry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "season.anchors"), eq(auditLog.entityId, id)));
    expect(anchorEntry?.diff).toMatchObject({ tasksShifted: 1 });

    // Its own anchor moving recomputes it from the season's dates (21.02.2027 − 240 days = 26.06.2026): the
    // clamp applies when the record is made, not to later changes.
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-02-21"]);
    expect(dueDay((await tasksOf(id)).byTitle("Termine planen"))).toBe("2026-06-26");
  });
});

describe("setSeasonStatus", () => {
  it("switches the status by hand with an audit entry; the undo is the same call back", async () => {
    const { id } = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2028-03-05"]);
    expect(await setSeasonStatus(owner, id, "dates_set", "planning")).toEqual({
      from: "planning",
      to: "dates_set",
    });
    // After the last day, with the season work done.
    vi.setSystemTime(new Date("2028-04-01T10:00:00+02:00"));
    for (const row of (await tasksOf(id)).rows) await setTaskStatus(owner, row.id, "done");
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

  it("refuses statuses that contradict the dates or the tasks (UX-050), with nothing written", async () => {
    const { id } = await ensureEventSeason(owner, cat.presets.flea.id, 2028);
    // "Termine stehen" without a date.
    await expect(setSeasonStatus(owner, id, "dates_set", "planning")).rejects.toThrow("no_dates");
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2028-03-05"]);
    // "Abgeschlossen" before the last date, and with open season work after it.
    await expect(setSeasonStatus(owner, id, "closed", "planning")).rejects.toThrow("not_over");
    vi.setSystemTime(new Date("2028-03-05T18:00:00+01:00"));
    await expect(setSeasonStatus(owner, id, "closed", "planning")).rejects.toThrow("not_over");
    vi.setSystemTime(new Date("2028-03-06T08:00:00+01:00"));
    await expect(setSeasonStatus(owner, id, "closed", "planning")).rejects.toThrow("open_tasks");
    // Done and skipped tasks are finished; back to planning always works.
    const { byTitle } = await tasksOf(id);
    await setTaskStatus(owner, byTitle("Termine planen").id, "done");
    await setTaskStatus(owner, byTitle("Saisonabschluss").id, "skipped", { reason: "entfällt" });
    expect(await setSeasonStatus(owner, id, "closed", "planning")).toEqual({
      from: "planning",
      to: "closed",
    });
    expect(await setSeasonStatus(owner, id, "planning", "closed")).toEqual({
      from: "closed",
      to: "planning",
    });
    const entries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "season.status"), eq(auditLog.entityId, id)));
    expect(entries.map((e) => (e.diff as { to: string }).to)).toEqual(["closed", "planning"]);
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
      subtasksShifted: 0,
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
