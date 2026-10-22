import { employmentContract, event, eventPreset } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import {
  calendarItems,
  dueItems,
  eventTaskSummary,
  getPeopleRail,
  getTaskDetail,
  getWorkload,
  listBoardTasks,
  listStaffOptions,
  listTaskEventOptions,
  openTaskCounts,
  seasonWorkload,
} from "@/server/queries/tasks";
import {
  addCheckItem,
  assignTask,
  moveTask,
  setCheckItemDone,
  setTaskStatus,
  snoozeTask,
  unsnoozeTask,
} from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, dueOn, insertEvent, insertStaff, insertTask, TODAY } from "../helpers/tasks";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let eventId: string;
const clock = { today: TODAY, now: new Date("2026-10-21T10:00:00Z") };

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  eventId = (await insertEvent(cat, "Testmarkt", "2026-11-14")).id;
});

afterAll(async () => {
  await db.$client.end();
});

describe("listBoardTasks", () => {
  it("derives the column of every card, in display order", async () => {
    await insertTask({ title: "heute", eventId, dueAt: dueOn("2026-10-21") });
    await insertTask({ title: "überfällig", eventId, dueAt: dueOn("2026-10-15") });
    await insertTask({ title: "Do", eventId, dueAt: dueOn("2026-10-22") });
    await insertTask({ title: "später", eventId, dueAt: dueOn("2026-11-10") });
    await insertTask({ title: "ohne Datum", eventId });
    await insertTask({
      title: "verschoben",
      eventId,
      dueAt: dueOn("2026-11-10"),
      boardColumn: "today",
    });

    const { tasks, truncated } = await listBoardTasks(owner, { eventId }, TODAY);
    expect(truncated).toBe(false);
    const byColumn = (column: string) =>
      tasks.filter((t) => t.column === column).map((t) => t.title);
    expect(byColumn("today")).toEqual(["überfällig", "heute", "verschoben"]);
    expect(byColumn("this_week")).toEqual(["Do"]);
    expect(byColumn("preparation")).toEqual(["später", "ohne Datum"]);
    expect(tasks.find((t) => t.title === "heute")).toMatchObject({
      dueOn: "2026-10-21",
      eventName: "Testmarkt",
    });
  });

  it("lists finished tasks of the last 14 days only, and never cancelled ones", async () => {
    const recent = new Date("2026-10-15T10:00:00Z");
    await insertTask({ title: "neu erledigt", eventId, status: "done", completedAt: recent });
    await insertTask({
      title: "alt erledigt",
      eventId,
      status: "done",
      completedAt: new Date("2026-09-01T10:00:00Z"),
    });
    await insertTask({
      title: "übersprungen",
      eventId,
      status: "skipped",
      skippedReason: "x",
      updatedAt: recent,
    });
    await insertTask({ title: "abgebrochen", eventId, status: "cancelled" });
    const { tasks } = await listBoardTasks(owner, { eventId }, TODAY);
    expect(tasks.map((t) => t.title).sort()).toEqual(["neu erledigt", "übersprungen"]);
    expect(tasks.every((t) => t.column === "done")).toBe(true);
    expect(tasks.find((t) => t.title === "neu erledigt")?.completedOn).toBe("2026-10-15");
  });

  it("limits the cross-event view by horizon, keeps undated tasks, and filters by event", async () => {
    const other = (await insertEvent(cat, "Anderer", "2026-12-05")).id;
    await insertTask({ title: "nah", eventId, dueAt: dueOn("2026-10-30") });
    await insertTask({ title: "fern", eventId: other, dueAt: dueOn("2026-12-01") });
    await insertTask({ title: "undatiert" });
    const near = await listBoardTasks(owner, { horizonDays: 14 }, TODAY);
    expect(near.tasks.map((t) => t.title).sort()).toEqual(["nah", "undatiert"]);
    const all = await listBoardTasks(owner, {}, TODAY);
    expect(all.tasks).toHaveLength(3);
    const one = await listBoardTasks(owner, { eventId: other }, TODAY);
    expect(one.tasks.map((t) => t.title)).toEqual(["fern"]);
    expect((await listBoardTasks(owner, { eventId: "nope" }, TODAY)).tasks).toEqual([]);
  });

  it("carries assignee, carry-over, check item counts and evidence flags", async () => {
    const t = await insertTask({
      title: "A",
      eventId,
      assigneeId: cat.staff.ben.id,
      rolloverCount: 2,
      requiresNote: true,
      estimateMinutes: 90,
    });
    const item = await addCheckItem(owner, t.id, "eins");
    await addCheckItem(owner, t.id, "zwei");
    await setCheckItemDone(owner, t.id, item.id, true);
    const [card] = (await listBoardTasks(owner, { eventId }, TODAY)).tasks;
    expect(card).toMatchObject({
      assigneeName: "Ben Test",
      rolloverCount: 2,
      checkTotal: 2,
      checkDone: 1,
      requiresNote: true,
      estimateMinutes: 90,
    });
  });

  it("reflects a move: the manual column and order", async () => {
    const a = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-11-10") });
    await insertTask({ title: "B", eventId, dueAt: dueOn("2026-11-11") });
    await moveTask(owner, a.id, "today", { index: 0 }, { eventId }, clock);
    const { tasks } = await listBoardTasks(owner, { eventId }, TODAY);
    expect(tasks.find((t) => t.id === a.id)).toMatchObject({
      column: "today",
      boardColumn: "today",
    });
  });
});

describe("market colour and Kernaufgabe on cards", () => {
  it("exposes the preset colour of the event and the key flag on board cards and due items", async () => {
    await db
      .update(eventPreset)
      .set({ color: "petrol" })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    await db.update(event).set({ presetId: cat.presets.flea.id }).where(eq(event.id, eventId));
    const other = (await insertEvent(cat, "Ohne Vorlage", "2026-11-21")).id;
    await insertTask({ title: "Kern", eventId, dueAt: dueOn("2026-10-21"), isKey: true });
    await insertTask({ title: "Gewöhnlich", eventId: other, dueAt: dueOn("2026-10-21") });

    const { tasks } = await listBoardTasks(owner, {}, TODAY);
    expect(tasks.find((t) => t.title === "Kern")).toMatchObject({
      eventColor: "petrol",
      isKey: true,
    });
    expect(tasks.find((t) => t.title === "Gewöhnlich")).toMatchObject({
      eventColor: null,
      isKey: false,
    });

    const due = await dueItems(owner, TODAY);
    expect(due.find((d) => d.title === "Kern")).toMatchObject({
      eventColor: "petrol",
      isKey: true,
    });
    expect(due.find((d) => d.title === "Gewöhnlich")).toMatchObject({
      eventColor: null,
      isKey: false,
    });
  });
});

describe("scoping", () => {
  it("shows a field user only the tasks of their events", async () => {
    const frieda = await insertStaff("Frieda Platz", {
      userId: "user-field-frieda",
      role: "field",
    });
    const field: Actor = asStaff(
      { ...(await createActor("field")), id: "user-field-frieda" },
      frieda,
    );
    const mine = await insertEvent(cat, "Mein Markt", "2026-11-21", [
      { roleId: cat.roles.setup.id, staffId: frieda.id },
    ]);
    const t1 = await insertTask({ title: "meins", eventId: mine.id, dueAt: dueOn("2026-10-22") });
    const t2 = await insertTask({ title: "fremd", eventId, dueAt: dueOn("2026-10-22") });
    const t3 = await insertTask({
      title: "büro für mich",
      assigneeId: frieda.id,
      dueAt: dueOn("2026-10-22"),
    });
    await insertTask({ title: "büro", dueAt: dueOn("2026-10-22") });

    const visible = (await listBoardTasks(field, {}, TODAY)).tasks.map((t) => t.title).sort();
    expect(visible).toEqual(["büro für mich", "meins"]);
    expect(await getTaskDetail(field, t1.id)).not.toBeNull();
    expect(await getTaskDetail(field, t3.id)).not.toBeNull();
    expect(await getTaskDetail(field, t2.id)).toBeNull();
    // the Übersicht only lists what is assigned to a field user
    expect((await dueItems(field, TODAY)).map((i) => i.title)).toEqual(["büro für mich"]);
    expect((await eventTaskSummary(field, eventId, TODAY)).open).toBe(0);
    expect((await eventTaskSummary(field, mine.id, TODAY)).open).toBe(1);
    expect(await listTaskEventOptions(field, TODAY)).toEqual([
      expect.objectContaining({ id: mine.id }),
    ]);
    expect((await listBoardTasks(owner, {}, TODAY)).tasks).toHaveLength(4);
  });

  it("hides the tasks of archived events", async () => {
    await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-22") });
    await db.update(event).set({ archivedAt: new Date() }).where(eq(event.id, eventId));
    expect((await listBoardTasks(owner, {}, TODAY)).tasks).toEqual([]);
  });
});

describe("people rail and workload", () => {
  it("measures open hours this ISO week against contract hours (default 20 h)", async () => {
    await db.insert(employmentContract).values({
      staffMemberId: cat.staff.anna.id,
      type: "part_time",
      validFrom: "2026-01-01",
      contractedHoursPerWeek: 10,
    });
    await db.insert((await import("@marktwerk/db/schema")).eventDuty).values({
      eventId,
      dutyRoleId: cat.roles.lead.id,
      staffMemberId: cat.staff.anna.id,
    });
    // Anna: 6 h overdue + 4 h Friday = 10 h this week; 3 h next week (not counted); done ones don't count
    await insertTask({
      title: "a",
      eventId,
      assigneeId: cat.staff.anna.id,
      dueAt: dueOn("2026-10-14"),
      estimateMinutes: 360,
    });
    await insertTask({
      title: "b",
      eventId,
      assigneeId: cat.staff.anna.id,
      dueAt: dueOn("2026-10-23"),
      estimateMinutes: 240,
    });
    await insertTask({
      title: "c",
      eventId,
      assigneeId: cat.staff.anna.id,
      dueAt: dueOn("2026-10-26"),
      estimateMinutes: 180,
    });
    await insertTask({
      title: "d",
      eventId,
      assigneeId: cat.staff.anna.id,
      dueAt: dueOn("2026-10-22"),
      estimateMinutes: 600,
      status: "done",
      completedAt: new Date(),
    });
    // Ben: 2 h this week, no contract → capacity 20 h
    await insertTask({
      title: "e",
      eventId,
      assigneeId: cat.staff.ben.id,
      dueAt: dueOn("2026-10-22"),
      estimateMinutes: 120,
    });
    await insertTask({ title: "f", eventId, dueAt: dueOn("2026-10-22"), estimateMinutes: 30 });

    const rail = await getPeopleRail(owner, { eventId }, TODAY);
    const anna = rail.people.find((p) => p.id === cat.staff.anna.id);
    const ben = rail.people.find((p) => p.id === cat.staff.ben.id);
    expect(anna).toMatchObject({
      hoursThisWeek: 10,
      capacityHours: 10,
      level: "warn",
      openTasks: 3,
    });
    expect(anna?.roles).toEqual([{ de: "Marktleitung", en: "Market lead" }]);
    expect(ben).toMatchObject({ hoursThisWeek: 2, capacityHours: 20, level: "ok", openTasks: 1 });
    expect(rail.unassigned).toEqual({ tasks: 1, hours: 0.5 });
    // most loaded first
    expect(rail.people[0]?.name).toBe("Anna Test");
  });

  it("builds the 8-week table with overdue work in the current week", async () => {
    await insertTask({
      title: "überfällig",
      eventId,
      assigneeId: cat.staff.ben.id,
      dueAt: dueOn("2026-10-05"),
      estimateMinutes: 60,
    });
    await insertTask({
      title: "KW 43",
      eventId,
      assigneeId: cat.staff.ben.id,
      dueAt: dueOn("2026-10-25"),
      estimateMinutes: 120,
    });
    await insertTask({
      title: "KW 44",
      eventId,
      assigneeId: cat.staff.ben.id,
      dueAt: dueOn("2026-10-26"),
      estimateMinutes: 600,
    });
    await insertTask({
      title: "KW 50",
      eventId,
      assigneeId: cat.staff.ben.id,
      dueAt: dueOn("2026-12-10"),
      estimateMinutes: 60,
    });
    await insertTask({
      title: "KW 52 (außerhalb)",
      eventId,
      assigneeId: cat.staff.ben.id,
      dueAt: dueOn("2026-12-23"),
      estimateMinutes: 6000,
    });
    await insertTask({ title: "ohne Datum", eventId, assigneeId: cat.staff.ben.id });
    await insertTask({ title: "offen", eventId, dueAt: dueOn("2026-10-27"), estimateMinutes: 90 });

    const w = await getWorkload(owner, TODAY, 8);
    expect(w.weeks[0]).toBe("2026-10-19");
    expect(w.weeks).toHaveLength(8);
    expect(w.weeks[7]).toBe("2026-12-07");
    expect(w.undated).toBe(1);
    const ben = w.rows.find((r) => r.name === "Ben Test");
    expect(ben?.hours).toEqual([3, 10, 0, 0, 0, 0, 0, 1]);
    expect(ben?.capacity[0]).toBe(20);
    expect(ben?.levels[1]).toBe("ok"); // 10 h of 20 h
    const open = w.rows.at(-1);
    expect(open).toMatchObject({ staffMemberId: null, name: null });
    expect(open?.hours[1]).toBe(1.5);
    // every active person is listed, even without tasks
    expect(w.rows.map((r) => r.name)).toEqual(["Anna Test", "Ben Test", null]);
  });
});

describe("seasonWorkload", () => {
  it("compares estimated hours per month with team capacity and derives the hiring signal", async () => {
    const april = await insertEvent(cat, "Aprilmarkt", "2026-04-12");
    const may = await insertEvent(cat, "Maimarkt", "2026-05-10");
    await db.insert(employmentContract).values({
      staffMemberId: cat.staff.anna.id,
      type: "part_time",
      validFrom: "2026-01-01",
      contractedHoursPerWeek: 10,
    });
    // 300 h in April (due in April), 100 h in May, a done task counts as demand too, cancelled ones don't
    await insertTask({
      title: "a",
      eventId: april.id,
      dueAt: dueOn("2026-04-01"),
      estimateMinutes: 12000,
    });
    await insertTask({
      title: "b",
      eventId: april.id,
      dueAt: dueOn("2026-04-20"),
      estimateMinutes: 6000,
      status: "done",
      completedAt: new Date(),
    });
    await insertTask({
      title: "c",
      eventId: may.id,
      dueAt: dueOn("2026-05-05"),
      estimateMinutes: 6000,
    });
    await insertTask({
      title: "x",
      eventId: may.id,
      dueAt: dueOn("2026-05-05"),
      estimateMinutes: 99999,
      status: "cancelled",
    });
    // an event without a due date counts in its first month
    await insertTask({ title: "undated", eventId: may.id, estimateMinutes: 0 });

    const season = await seasonWorkload(owner, 2026);
    expect(season.season).toBe(2026);
    expect(season.staffCount).toBe(2);
    expect(season.months.map((m) => m.month)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    const [apr, mayRow] = season.months;
    // weekly capacity: Anna 10 h (contract) + Ben 20 h (default) = 30 h → April 30/7 weeks, May 31/7
    expect(apr?.capacityHours).toBeCloseTo((30 * 30) / 7, 5);
    expect(apr?.demandHours).toBe(300);
    expect(apr?.gapHours).toBeCloseTo(300 - (30 * 30) / 7, 5);
    expect(apr?.minijobbers).toBeCloseTo((300 - (30 * 30) / 7) / 40, 5);
    expect(mayRow?.demandHours).toBe(100);
    expect(mayRow?.gapHours).toBe(0);
    expect(season.averageMinijobbers).toBeCloseTo((300 - (30 * 30) / 7) / 40 / 2, 5);
    expect(season.peakMinijobbers).toBeCloseTo((300 - (30 * 30) / 7) / 40, 5);
  });

  it("is empty for a season without events", async () => {
    const season = await seasonWorkload(owner, 2031);
    expect(season.months).toEqual([]);
    expect(season.averageMinijobbers).toBe(0);
  });
});

describe("dueItems and calendarItems", () => {
  it("lists open tasks overdue, today and within 7 days, newest urgency first by date", async () => {
    await insertTask({
      title: "alt",
      eventId,
      dueAt: dueOn("2026-10-10"),
      assigneeId: cat.staff.ben.id,
    });
    await insertTask({ title: "heute", eventId, dueAt: dueOn("2026-10-21") });
    await insertTask({ title: "bald", eventId, dueAt: dueOn("2026-10-28") });
    await insertTask({ title: "später", eventId, dueAt: dueOn("2026-10-30") });
    await insertTask({
      title: "erledigt",
      eventId,
      dueAt: dueOn("2026-10-21"),
      status: "done",
      completedAt: new Date(),
    });
    const items = await dueItems(owner, TODAY);
    expect(items.map((i) => [i.title, i.urgency, i.dueOn])).toEqual([
      ["alt", "overdue", "2026-10-10"],
      ["heute", "today", "2026-10-21"],
      ["bald", "soon", "2026-10-28"],
    ]);
    expect(items[0]).toMatchObject({
      kind: "task",
      assigneeName: "Ben Test",
      meta: "Testmarkt",
      eventId,
    });
    expect(items[0]?.href).toBe(`/veranstaltungen/${eventId}/board?aufgabe=${items[0]?.id}`);
  });

  it("shows office staff only their own tasks, owners and managers all", async () => {
    await insertTask({
      title: "Annas",
      eventId,
      dueAt: dueOn("2026-10-21"),
      assigneeId: cat.staff.anna.id,
    });
    await insertTask({
      title: "Bens",
      eventId,
      dueAt: dueOn("2026-10-21"),
      assigneeId: cat.staff.ben.id,
    });
    const anna = asStaff(await createActor("staff"), cat.staff.anna);
    expect((await dueItems(anna, TODAY)).map((i) => i.title)).toEqual(["Annas"]);
    expect((await dueItems(owner, TODAY)).map((i) => i.title).sort()).toEqual(["Annas", "Bens"]);
    expect(await dueItems(await createActor("staff", "nostaff@test.local"), TODAY)).toEqual([]);
  });

  it("returns calendar items with tone by urgency", async () => {
    await insertTask({ title: "alt", eventId, dueAt: dueOn("2026-10-10") });
    await insertTask({ title: "heute", eventId, dueAt: dueOn("2026-10-21") });
    await insertTask({ title: "Nov", eventId, dueAt: dueOn("2026-11-05") });
    await insertTask({ title: "Dez", eventId, dueAt: dueOn("2026-12-05") });
    const items = await calendarItems(owner, "2026-10-01", "2026-11-30", TODAY);
    expect(items.map((i) => [i.title, i.date, i.tone, i.layer])).toEqual([
      ["alt", "2026-10-10", "critical", "tasks"],
      ["heute", "2026-10-21", "warn", "tasks"],
      ["Nov", "2026-11-05", "neutral", "tasks"],
    ]);
  });
});

describe("snoozed tasks", () => {
  it("drop out of the due list, the open-task KPIs and the calendar until their date", async () => {
    const overdue = await insertTask({ title: "alt", eventId, dueAt: dueOn("2026-10-10") });
    const soon = await insertTask({ title: "bald", eventId, dueAt: dueOn("2026-10-23") });
    await insertTask({ title: "normal", eventId, dueAt: dueOn("2026-10-22") });
    const titles = async (today: string) => (await dueItems(owner, today)).map((i) => i.title);
    const calendar = async (today: string) =>
      (await calendarItems(owner, "2026-10-01", "2026-10-31", today)).map((i) => i.title);
    expect(await titles(TODAY)).toEqual(["alt", "normal", "bald"]);
    expect(await openTaskCounts(owner, TODAY)).toEqual({ open: 3, overdue: 1 });

    await snoozeTask(owner, overdue.id, "2026-10-26", clock);
    await snoozeTask(owner, soon.id, "2026-10-22", clock);
    expect(await titles(TODAY)).toEqual(["normal"]);
    expect(await calendar(TODAY)).toEqual(["normal"]);
    expect(await openTaskCounts(owner, TODAY)).toEqual({ open: 1, overdue: 0 });

    // the day before the date it is still hidden, on the date it is back (no job needed)
    expect(await titles("2026-10-21")).toEqual(["normal"]);
    expect(await titles("2026-10-22")).toEqual(["normal", "bald"]);
    expect(await openTaskCounts(owner, "2026-10-22")).toEqual({ open: 2, overdue: 0 });
    expect(await titles("2026-10-25")).toEqual(["normal", "bald"]);
    expect(await titles("2026-10-26")).toEqual(["alt", "normal", "bald"]);
    expect(await calendar("2026-10-26")).toEqual(["alt", "normal", "bald"]);
  });

  it("come back at once when the snooze is ended", async () => {
    const t = await insertTask({ title: "alt", eventId, dueAt: dueOn("2026-10-10") });
    await snoozeTask(owner, t.id, "2026-10-30", clock);
    expect(await dueItems(owner, TODAY)).toEqual([]);
    await unsnoozeTask(owner, t.id);
    expect((await dueItems(owner, TODAY)).map((i) => i.title)).toEqual(["alt"]);
  });

  it("stay on the board and in the drawer, with the date only while it is ahead", async () => {
    const t = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-21") });
    await snoozeTask(owner, t.id, "2026-10-26", clock);
    const card = (await listBoardTasks(owner, { eventId }, TODAY)).tasks.find((c) => c.id === t.id);
    expect(card).toMatchObject({ snoozedUntil: "2026-10-26", dueOn: "2026-10-21" });
    expect((await getTaskDetail(owner, t.id, TODAY))?.snoozedUntil).toBe("2026-10-26");
    const later = (await listBoardTasks(owner, { eventId }, "2026-10-26")).tasks.find(
      (c) => c.id === t.id,
    );
    expect(later?.snoozedUntil).toBeNull();
    expect((await getTaskDetail(owner, t.id, "2026-10-26"))?.snoozedUntil).toBeNull();
  });
});

describe("eventTaskSummary", () => {
  it("counts open, overdue and blocked tasks and rates the health", async () => {
    expect(await eventTaskSummary(owner, eventId, TODAY)).toMatchObject({ open: 0, health: null });
    await insertTask({ title: "a", eventId, dueAt: dueOn("2026-11-01") });
    expect(await eventTaskSummary(owner, eventId, TODAY)).toMatchObject({
      open: 1,
      overdue: 0,
      health: "ok",
    });
    await insertTask({ title: "b", eventId, dueAt: dueOn("2026-10-15"), status: "blocked" });
    await insertTask({ title: "c", eventId, status: "done", completedAt: new Date() });
    expect(await eventTaskSummary(owner, eventId, TODAY)).toMatchObject({
      open: 2,
      overdue: 1,
      blocked: 1,
      health: "warn",
    });
    await insertTask({ title: "d", eventId, dueAt: dueOn("2026-10-15"), rolloverCount: 3 });
    expect((await eventTaskSummary(owner, eventId, TODAY)).health).toBe("critical");
    expect((await eventTaskSummary(owner, "nope", TODAY)).health).toBeNull();
  });
});

describe("tasks that wait for somebody else (Wartet)", () => {
  it("are 'wartet seit …' in the Übersicht feed, not overdue anywhere", async () => {
    await insertTask({ title: "überfällig", eventId, dueAt: dueOn("2026-10-15") });
    await insertTask({
      title: "beim Amt",
      eventId,
      dueAt: dueOn("2026-09-01"),
      status: "waiting_external",
    });
    await insertTask({
      title: "Amt, noch nicht fällig",
      eventId,
      dueAt: dueOn("2026-10-23"),
      status: "waiting_external",
    });

    const items = await dueItems(owner, TODAY);
    const urgency = (title: string) => items.find((i) => i.title === title)?.urgency;
    expect(urgency("überfällig")).toBe("overdue");
    expect(urgency("beim Amt")).toBe("waiting");
    expect(urgency("Amt, noch nicht fällig")).toBe("soon");

    expect(await openTaskCounts(owner, TODAY)).toMatchObject({ open: 3, overdue: 1 });
    expect(await eventTaskSummary(owner, eventId, TODAY)).toMatchObject({ open: 3, overdue: 1 });
    // Calendar chip: neutral, not red.
    const chips = await calendarItems(owner, "2026-09-01", "2026-09-30", TODAY);
    expect(chips.find((c) => c.title === "beim Amt")?.tone).toBe("neutral");
  });

  it("do not make the event health look worse", async () => {
    await insertTask({
      title: "beim Amt",
      eventId,
      dueAt: dueOn("2026-09-01"),
      status: "waiting_external",
    });
    expect((await eventTaskSummary(owner, eventId, TODAY)).health).toBe("ok");
  });
});

describe("getTaskDetail", () => {
  it("collects check items, the completion note and the audit activity", async () => {
    const office = asStaff(await createActor("staff"), cat.staff.anna);
    const t = await insertTask({
      title: "Schilder",
      eventId,
      dueAt: dueOn("2026-10-22"),
      dutyRoleId: cat.roles.setup.id,
    });
    const item = await addCheckItem(office, t.id, "zählen");
    await assignTask(owner, t.id, cat.staff.ben.id);
    await setCheckItemDone(office, t.id, item.id, true, clock);
    await setTaskStatus(office, t.id, "done", { note: "Alles gezählt" }, clock);

    const detail = await getTaskDetail(owner, t.id);
    expect(detail).toMatchObject({
      title: "Schilder",
      status: "done",
      eventName: "Testmarkt",
      assigneeName: "Ben Test",
      dueOn: "2026-10-22",
      completedByName: "Anna Test",
      dutyRoleName: { de: "Aufbau", en: "Setup" },
      link: `/veranstaltungen/${eventId}/board?aufgabe=${t.id}`,
    });
    expect(detail?.checkItems).toEqual([expect.objectContaining({ title: "zählen", done: true })]);
    expect(detail?.completionNote).toBe("Alles gezählt");
    expect(detail?.snoozedUntil).toBeNull();
    // newest first
    expect(detail?.activity.map((a) => a.action)).toEqual([
      "task.status",
      "task.check",
      "task.assign",
      "task.check",
    ]);
    expect(detail?.activity[0]?.actorName).toBe("Test staff");
    expect(await getTaskDetail(owner, "nope")).toBeNull();
    expect(await getTaskDetail(owner, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("option lists", () => {
  it("lists active staff and recent or upcoming events", async () => {
    await insertEvent(cat, "Alt", "2026-08-01");
    const names = (await listStaffOptions()).map((s) => s.displayName);
    expect(names).toEqual(["Anna Test", "Ben Test"]);
    const events = await listTaskEventOptions(owner, TODAY);
    expect(events.map((e) => e.name)).toEqual(["Testmarkt"]);
  });
});
