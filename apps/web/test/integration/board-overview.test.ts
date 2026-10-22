import { event, eventPermit, permit } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { getKeyTaskMatrix, getReadinessList } from "@/server/queries/board-overview";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { dueOn, insertEvent, insertTask, TODAY } from "../helpers/tasks";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

async function addPermit(eventId: string, status: "not_started" | "granted", required = true) {
  const [p] = await db
    .insert(permit)
    .values({ category: "city", permitType: "market_permit", title: "Marktgenehmigung", status })
    .returning();
  if (!p) throw new Error("permit failed");
  await db.insert(eventPermit).values({ eventId, permitId: p.id, required });
}

describe("getReadinessList", () => {
  it("lists upcoming events by date with progress, overdue, key tasks, permits and the next deadline", async () => {
    const later = await insertEvent(cat, "Später", "2026-12-05");
    const soon = await insertEvent(cat, "Bald", "2026-11-07");
    await insertEvent(cat, "Vorbei", "2026-10-01");
    await insertTask({
      title: "erledigt",
      eventId: soon.id,
      status: "done",
      completedAt: new Date(),
    });
    await insertTask({ title: "alt", eventId: soon.id, dueAt: dueOn("2026-10-15") });
    await insertTask({ title: "Kern", eventId: soon.id, dueAt: dueOn("2026-10-30"), isKey: true });
    await insertTask({ title: "abgesagt", eventId: soon.id, status: "cancelled" });
    await insertTask({ title: "irgendwann", eventId: later.id });
    await addPermit(soon.id, "not_started");
    await addPermit(soon.id, "granted");
    await addPermit(soon.id, "not_started", false);

    const { rows } = await getReadinessList(owner, { horizonDays: null }, TODAY);
    expect(rows.map((r) => r.name)).toEqual(["Bald", "Später"]);
    expect(rows[0]).toMatchObject({
      total: 3,
      done: 1,
      overdue: 1,
      openKey: 1,
      missingPermits: 1,
      daysUntil: 17,
      next: { title: "alt", dueOn: "2026-10-15" },
    });
    expect(rows[1]).toMatchObject({ total: 1, done: 0, overdue: 0, next: null });
  });

  it("does not count waiting tasks as overdue, nor as the next deadline, and counts a one-day permit as held", async () => {
    const soon = await insertEvent(cat, "Bald", "2026-11-07");
    await insertTask({
      title: "beim Amt",
      eventId: soon.id,
      dueAt: dueOn("2026-09-01"),
      status: "waiting_external",
    });
    await insertTask({ title: "morgen", eventId: soon.id, dueAt: dueOn("2026-10-22") });
    const [p] = await db
      .insert(permit)
      .values({
        category: "city",
        permitType: "market_permit",
        title: "Tag",
        status: "granted",
        validUntil: "2026-11-07",
      })
      .returning();
    if (!p) throw new Error("permit failed");
    await db.insert(eventPermit).values({ eventId: soon.id, permitId: p.id });

    const { rows } = await getReadinessList(owner, { horizonDays: null }, TODAY);
    expect(rows[0]).toMatchObject({
      overdue: 0,
      missingPermits: 0,
      next: { title: "morgen", dueOn: "2026-10-22" },
    });
  });

  it("limits by the first day, keeps running markets, and drops cancelled or finished events", async () => {
    await insertEvent(cat, "In 5 Tagen", "2026-10-26");
    await insertEvent(cat, "In 14 Tagen", "2026-11-04");
    await insertEvent(cat, "In 15 Tagen", "2026-11-05");
    const running = await insertEvent(cat, "Läuft", "2026-10-20");
    await db.update(event).set({ endsOn: "2026-10-22" }).where(eq(event.id, running.id));
    const cancelled = await insertEvent(cat, "Abgesagt", "2026-10-28");
    await db.update(event).set({ status: "cancelled" }).where(eq(event.id, cancelled.id));

    const names = async (horizonDays: number | null) =>
      (await getReadinessList(owner, { horizonDays }, TODAY)).rows.map((r) => r.name);
    expect(await names(14)).toEqual(["Läuft", "In 5 Tagen", "In 14 Tagen"]);
    expect(await names(null)).toEqual(["Läuft", "In 5 Tagen", "In 14 Tagen", "In 15 Tagen"]);
  });

  it("narrows task counts by category, and reports category counts of all open tasks", async () => {
    const e = await insertEvent(cat, "Markt", "2026-11-07");
    await insertTask({
      title: "a",
      eventId: e.id,
      category: "general",
      dueAt: dueOn("2026-10-01"),
    });
    await insertTask({ title: "b", eventId: e.id, category: "logistics" });
    const all = await getReadinessList(owner, { horizonDays: null }, TODAY);
    expect(all.categoryCounts).toMatchObject({ general: 1, logistics: 1 });
    const only = await getReadinessList(owner, { horizonDays: null, category: "logistics" }, TODAY);
    expect(only.rows[0]).toMatchObject({ total: 1, overdue: 0 });
    expect(only.categoryCounts).toMatchObject({ general: 1, logistics: 1 });
  });

  it("returns nothing without upcoming events", async () => {
    expect(await getReadinessList(owner, { horizonDays: null }, TODAY)).toEqual({
      rows: [],
      categoryCounts: {},
    });
  });
});

describe("getKeyTaskMatrix", () => {
  it("builds one column per key task (by stable key), cells per market, none for tasks that are not key", async () => {
    const a = await insertEvent(cat, "A", "2026-11-14");
    const b = await insertEvent(cat, "B", "2026-12-12");
    await insertTask({
      title: "Genehmigung",
      eventId: a.id,
      isKey: true,
      templateStableKey: "permit",
      dueAt: dueOn("2026-10-10"),
    });
    await insertTask({
      title: "Genehmigung beantragen",
      eventId: b.id,
      isKey: true,
      templateStableKey: "permit",
      status: "done",
      completedAt: new Date(),
    });
    await insertTask({
      title: "Plakate",
      eventId: a.id,
      isKey: true,
      templateStableKey: "poster",
      dueAt: dueOn("2026-10-24"),
    });
    await insertTask({ title: "Nebensache", eventId: a.id, templateStableKey: "minor" });

    const m = await getKeyTaskMatrix(owner, { horizonDays: null }, TODAY);
    expect(m.events.map((e) => e.name)).toEqual(["A", "B"]);
    expect(m.columns.map((c) => c.key)).toEqual(["k:permit", "k:poster"]);
    expect(m.truncatedColumns).toBe(false);
    expect(m.cells[a.id]?.["k:permit"]?.state).toBe("overdue");
    expect(m.cells[a.id]?.["k:poster"]?.state).toBe("soon");
    expect(m.cells[b.id]?.["k:permit"]?.state).toBe("done");
    expect(m.cells[b.id]?.["k:poster"]).toBeUndefined();
  });

  it("marks a snoozed task, treats the Berlin day edge correctly, and caps the columns", async () => {
    const a = await insertEvent(cat, "A", "2026-11-14");
    // 22:30 UTC on the 20th is 00:30 Berlin (CEST) on the 21st = today: soon, not overdue.
    await insertTask({
      title: "Kante",
      eventId: a.id,
      isKey: true,
      templateStableKey: "edge",
      dueAt: new Date("2026-10-20T22:30:00Z"),
    });
    await insertTask({
      title: "Zurückgestellt",
      eventId: a.id,
      isKey: true,
      templateStableKey: "snz",
      dueAt: dueOn("2026-10-01"),
      snoozedUntil: "2026-10-23",
    });
    for (let i = 0; i < 12; i++)
      await insertTask({
        title: `Extra ${i}`,
        eventId: a.id,
        isKey: true,
        templateStableKey: `x${i}`,
        dueAt: dueOn("2026-11-01"),
      });
    const m = await getKeyTaskMatrix(owner, { horizonDays: null }, TODAY);
    expect(m.columns).toHaveLength(10);
    expect(m.truncatedColumns).toBe(true);
    expect(m.cells[a.id]?.["k:edge"]?.state).toBe("soon");
    expect(m.cells[a.id]?.["k:snz"]?.state).toBe("snoozed");
  });

  it("returns nothing without upcoming events", async () => {
    expect(await getKeyTaskMatrix(owner, { horizonDays: null }, TODAY)).toMatchObject({
      events: [],
      columns: [],
    });
  });
});
