import { event } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { getEvent, listEvents } from "@/server/queries/events";
import { taskHealthByEvent } from "@/server/queries/tasks";
import { createPayable } from "@/server/services/payables";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, dueOn, insertEvent, insertTask } from "../helpers/tasks";

/**
 * Event health with all four dimensions (permits · tasks · team · money): `listEvents` and `getEvent`
 * fill tasks and money the same way, in one query per dimension for all events.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let staff: Actor;
let field: Actor;
let busy: string;
let calm: string;
let empty: string;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00+02:00"));
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  staff = await createActor("staff");
  field = asStaff(await createActor("field"), cat.staff.anna);

  busy = (
    await insertEvent(cat, "Voller Markt", "2026-11-07", [
      { roleId: cat.roles.lead.id, staffId: cat.staff.anna.id },
    ])
  ).id;
  calm = (await insertEvent(cat, "Ruhiger Markt", "2026-11-14")).id;
  empty = (await insertEvent(cat, "Leerer Markt", "2026-11-21")).id;

  // Busy: 5 overdue tasks (→ critical) and an overdue rate (→ critical money).
  for (let i = 1; i <= 5; i++)
    await insertTask({ title: `Überfällig ${i}`, eventId: busy, dueAt: dueOn("2026-10-15") });
  await createPayable(
    owner,
    {
      title: "Platzmiete",
      scope: "event",
      eventId: busy,
      category: "location",
      totalGrossCents: 100_000,
    },
    [{ dueOn: "2026-10-10", amountCents: 100_000 }],
  );
  // Calm: one task that is on time, a rate far in the future.
  await insertTask({ title: "Rechtzeitig", eventId: calm, dueAt: dueOn("2026-11-10") });
  await createPayable(
    owner,
    {
      title: "Strom",
      scope: "event",
      eventId: calm,
      category: "water_power",
      totalGrossCents: 20_000,
    },
    [{ dueOn: "2026-12-20", amountCents: 20_000 }],
  );
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db.$client.end();
});

const healthOf = async (actor: Actor) =>
  Object.fromEntries((await listEvents(actor, {})).map((e) => [e.id, e.health]));

describe("listEvents", () => {
  it("fills the tasks and money dimension per event", async () => {
    const health = await healthOf(owner);
    expect(health[busy]).toMatchObject({ tasks: "critical", money: "critical" });
    expect(health[calm]).toMatchObject({ tasks: "ok", money: "ok" });
    // Nothing tracked yet: both stay open (null), not "ok".
    expect(health[empty]).toMatchObject({ tasks: null, money: null });
  });

  it("carries the numbers behind the levels, so lists can say '5 überfällig' instead of 'Kritisch'", async () => {
    const rows = await listEvents(owner, {});
    const reasons = (id: string) => rows.find((r) => r.id === id)?.reasons;
    expect(reasons(busy)).toEqual({ permitsMissing: 0, tasksOverdue: 5, tasksBlocked: 0 });
    expect(reasons(calm)).toEqual({ permitsMissing: 0, tasksOverdue: 0, tasksBlocked: 0 });
    expect((await getEvent(owner, busy))?.reasons).toEqual(reasons(busy));
  });

  it("agrees with getEvent for the same actor", async () => {
    const listed = await healthOf(owner);
    for (const id of [busy, calm, empty]) {
      expect((await getEvent(owner, id))?.health).toEqual(listed[id]);
    }
  });

  it("leaves money open for roles without finance access, tasks stay", async () => {
    const health = await healthOf(staff);
    expect(health[busy]).toMatchObject({ tasks: "critical", money: null });
    expect(health[calm]).toMatchObject({ tasks: "ok", money: null });
  });

  it("field users only get what they can see: their events, no money", async () => {
    const health = await healthOf(field);
    expect(Object.keys(health)).toEqual([busy]);
    expect(health[busy]).toMatchObject({ tasks: "critical", money: null });
  });

  it("drops permits, tasks and team for finished events but keeps the money, and everything for cancelled ones", async () => {
    const done = await insertEvent(cat, "Vorbei", "2026-10-03");
    await insertTask({ title: "Liegengeblieben", eventId: done.id, dueAt: dueOn("2026-10-01") });
    await createPayable(
      owner,
      {
        title: "Rest",
        scope: "event",
        eventId: done.id,
        category: "other",
        totalGrossCents: 5_000,
      },
      [{ dueOn: "2026-10-05", amountCents: 5_000 }],
    );
    await db.update(event).set({ status: "completed" }).where(eq(event.id, done.id));
    expect((await healthOf(owner))[done.id]).toEqual({
      permits: null,
      tasks: null,
      team: null,
      money: "critical",
    });
    await db.update(event).set({ status: "cancelled" }).where(eq(event.id, done.id));
    expect((await healthOf(owner))[done.id]).toEqual({
      permits: null,
      tasks: null,
      team: null,
      money: null,
    });
  });
});

describe("taskHealthByEvent", () => {
  it("answers for many events at once, null where nothing is open", async () => {
    const map = await taskHealthByEvent(owner, [busy, calm, empty], "2026-10-21");
    expect([...map]).toEqual([
      [busy, "critical"],
      [calm, "ok"],
      [empty, null],
    ]);
  });

  it("counts blocked and carried-over tasks like the Board tab", async () => {
    await insertTask({ title: "Hängt", eventId: empty, status: "blocked" });
    expect((await taskHealthByEvent(owner, [empty], "2026-10-21")).get(empty)).toBe("warn");
    await insertTask({ title: "Immer wieder", eventId: empty, rolloverCount: 3 });
    expect((await taskHealthByEvent(owner, [empty], "2026-10-21")).get(empty)).toBe("critical");
  });

  it("is empty for an empty list", async () => {
    expect((await taskHealthByEvent(owner, [], "2026-10-21")).size).toBe(0);
  });
});
