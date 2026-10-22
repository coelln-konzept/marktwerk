import { type event, eventPermit, permit } from "@marktwerk/db/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { getEventOverview } from "@/server/queries/event-overview";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { dueOn, insertEvent, insertTask, TODAY } from "../helpers/tasks";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let ev: typeof event.$inferSelect;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  ev = await insertEvent(cat, "Testmarkt", "2026-11-14");
});

afterAll(async () => {
  await db.$client.end();
});

async function requirePermit(
  patch: Partial<typeof permit.$inferInsert> = {},
  required = true,
  eventId = ev.id,
) {
  const [row] = await db
    .insert(permit)
    .values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "water",
      title: "Wasser",
      season: 2026,
      ...patch,
    })
    .returning();
  if (!row) throw new Error("no permit");
  await db.insert(eventPermit).values({ eventId, permitId: row.id, required });
  return row;
}

describe("getEventOverview: tasks", () => {
  it("selects overdue, blocked / waiting and next-7-days tasks, key tasks first", async () => {
    await insertTask({ title: "überfällig", eventId: ev.id, dueAt: dueOn("2026-10-15") });
    await insertTask({
      title: "Kern bald",
      eventId: ev.id,
      isKey: true,
      dueAt: dueOn("2026-10-27"),
    });
    await insertTask({ title: "heute", eventId: ev.id, dueAt: dueOn(TODAY) });
    await insertTask({ title: "in 7 Tagen", eventId: ev.id, dueAt: dueOn("2026-10-28") });
    await insertTask({ title: "in 8 Tagen", eventId: ev.id, dueAt: dueOn("2026-10-29") });
    await insertTask({ title: "ohne Datum", eventId: ev.id });
    await insertTask({
      title: "blockiert",
      eventId: ev.id,
      status: "blocked",
      dueAt: dueOn("2026-12-01"),
    });
    await insertTask({
      title: "wartet",
      eventId: ev.id,
      status: "waiting_external",
      waitingReason: "Amt",
    });

    const { tasks } = await getEventOverview(owner, ev, TODAY);
    expect(tasks?.missing.map((t) => [t.title, t.reason])).toEqual([
      ["Kern bald", "soon"],
      ["überfällig", "overdue"],
      ["heute", "today"],
      ["in 7 Tagen", "soon"],
      ["blockiert", "blocked"],
      ["wartet", "waiting"],
    ]);
  });

  it("ignores finished and cancelled tasks, other events and snoozed tasks until their date", async () => {
    const other = await insertEvent(cat, "Anderer Markt", "2026-11-21");
    await insertTask({
      title: "fertig",
      eventId: ev.id,
      status: "done",
      completedAt: new Date("2026-10-20T10:00:00Z"),
      dueAt: dueOn("2026-10-10"),
    });
    await insertTask({
      title: "übersprungen",
      eventId: ev.id,
      status: "skipped",
      dueAt: dueOn("2026-10-10"),
    });
    await insertTask({
      title: "abgebrochen",
      eventId: ev.id,
      status: "cancelled",
      dueAt: dueOn("2026-10-10"),
    });
    await insertTask({ title: "fremd", eventId: other.id, dueAt: dueOn("2026-10-10") });
    await insertTask({
      title: "zurückgestellt",
      eventId: ev.id,
      dueAt: dueOn("2026-10-10"),
      snoozedUntil: "2026-10-22",
    });

    const first = await getEventOverview(owner, ev, TODAY);
    expect(first.tasks?.missing).toEqual([]);
    // the snooze date has come: the task is back
    const back = await getEventOverview(owner, ev, "2026-10-22");
    expect(back.tasks?.missing.map((t) => t.title)).toEqual(["zurückgestellt"]);
  });

  it("counts progress: finished of all, cancelled out, snoozed still open", async () => {
    await insertTask({
      title: "a",
      eventId: ev.id,
      status: "done",
      completedAt: new Date("2026-10-20T10:00:00Z"),
    });
    await insertTask({ title: "b", eventId: ev.id, status: "skipped" });
    await insertTask({ title: "c", eventId: ev.id, status: "cancelled" });
    await insertTask({ title: "d", eventId: ev.id, snoozedUntil: "2026-11-01" });
    await insertTask({ title: "e", eventId: ev.id, status: "blocked" });
    const { tasks } = await getEventOverview(owner, ev, TODAY);
    expect(tasks?.progress).toMatchObject({ done: 2, total: 4, open: 2 });
  });

  it("builds the Kernaufgaben checklist with states", async () => {
    await insertTask({ title: "normal", eventId: ev.id, dueAt: dueOn("2026-10-01") });
    await insertTask({
      title: "K erledigt",
      eventId: ev.id,
      isKey: true,
      status: "done",
      completedAt: new Date("2026-10-20T10:00:00Z"),
      dueAt: dueOn("2026-10-01"),
    });
    await insertTask({
      title: "K überfällig",
      eventId: ev.id,
      isKey: true,
      dueAt: dueOn("2026-10-20"),
    });
    await insertTask({
      title: "K später",
      eventId: ev.id,
      isKey: true,
      dueAt: dueOn("2026-11-10"),
    });
    await insertTask({
      title: "K zurückgestellt",
      eventId: ev.id,
      isKey: true,
      dueAt: dueOn("2026-10-20"),
      snoozedUntil: "2026-10-30",
    });
    await insertTask({ title: "K abgebrochen", eventId: ev.id, isKey: true, status: "cancelled" });

    const { tasks } = await getEventOverview(owner, ev, TODAY);
    expect(tasks?.key.map((t) => [t.title, t.state])).toEqual([
      ["K überfällig", "overdue"],
      ["K zurückgestellt", "snoozed"],
      ["K später", "open"],
      ["K erledigt", "done"],
    ]);
  });

  it("uses the Berlin day of the due instant (late evening before midnight is still that day)", async () => {
    // 23:30 Berlin on the 21st = 21:30Z in summer time: due today, not overdue
    await insertTask({
      title: "spät",
      eventId: ev.id,
      dueAt: new Date("2026-10-21T21:30:00Z"),
    });
    // 00:30 Berlin on the 22nd = 22:30Z on the 21st: due tomorrow, "soon"
    await insertTask({
      title: "früh",
      eventId: ev.id,
      dueAt: new Date("2026-10-21T22:30:00Z"),
    });
    const { tasks } = await getEventOverview(owner, ev, TODAY);
    expect(tasks?.missing.map((t) => [t.title, t.dueOn, t.reason])).toEqual([
      ["spät", "2026-10-21", "today"],
      ["früh", "2026-10-22", "soon"],
    ]);
  });

  it("gives a field login without a staff record no tasks at all", async () => {
    await insertTask({ title: "x", eventId: ev.id, dueAt: dueOn("2026-10-10") });
    const field: Actor = { ...(await createActor("field")), staffMemberId: null };
    const { tasks } = await getEventOverview(field, ev, TODAY);
    expect(tasks?.missing).toEqual([]);
    expect(tasks?.progress.total).toBe(0);
  });
});

describe("getEventOverview: permits", () => {
  it("lists required permits that are not granted and counts granted of needed", async () => {
    await requirePermit({ title: "Erteilt", status: "granted" });
    await requirePermit({ title: "Beantragt", status: "applied", applyBy: "2026-10-30" });
    await requirePermit({ title: "Offen", status: "not_started" });
    await requirePermit({ title: "Optional", status: "not_started" }, false);
    await requirePermit({ title: "Nicht nötig", status: "not_required" });
    await requirePermit({ title: "Abgelöst", status: "superseded" });
    await requirePermit({ title: "Archiviert", status: "not_started", archivedAt: new Date() });

    const { permits } = await getEventOverview(owner, ev, TODAY);
    expect(permits?.progress).toEqual({ granted: 1, total: 3 });
    expect(permits?.missing.map((p) => p.title)).toEqual(["Beantragt", "Offen"]);
  });

  it("treats a permit that ends before the event as missing", async () => {
    await requirePermit({ title: "Zu kurz", status: "granted", validUntil: "2026-11-13" });
    await requirePermit({ title: "Reicht", status: "granted", validUntil: "2026-11-14" });
    const { permits } = await getEventOverview(owner, ev, TODAY);
    expect(permits?.missing.map((p) => p.title)).toEqual(["Zu kurz"]);
    expect(permits?.progress).toEqual({ granted: 1, total: 2 });
  });

  it("only looks at this event's permits", async () => {
    const other = await insertEvent(cat, "Anderer Markt", "2026-11-21");
    await requirePermit({ title: "Fremd", status: "not_started" }, true, other.id);
    const { permits } = await getEventOverview(owner, ev, TODAY);
    expect(permits).toMatchObject({ missing: [], progress: { granted: 0, total: 0 } });
  });
});

describe("getEventOverview: countdown", () => {
  it("counts days to the event, runs on event days and is over afterwards", async () => {
    expect((await getEventOverview(owner, ev, TODAY)).countdown).toEqual({
      kind: "upcoming",
      days: 24,
    });
    expect((await getEventOverview(owner, ev, "2026-11-14")).countdown.kind).toBe("running");
    expect((await getEventOverview(owner, ev, "2026-11-15")).countdown.kind).toBe("over");
  });
});
