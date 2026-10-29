import { eventPermit, obligation, permit, shift } from "@marktwerk/db/schema";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { getOverview, listDueItems } from "@/server/queries/overview";
import { createPayable } from "@/server/services/payables";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, dueOn, insertEvent, insertTask, TODAY } from "../helpers/tasks";

/**
 * Übersicht aggregation ("Zwei Fragen"): the due items of all modules in one ranked list, the top of it for
 * "Heute & überfällig", and the weekend card with verdict and blockers per market, for the roles that see
 * different parts of it.
 *
 * Business "today" is Wednesday 21 Oct 2026, so the coming weekend is 24/25 Oct.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let manager: Actor;
let staffActor: Actor;
let fieldActor: Actor;
let weekendEvent: string;
let laterEvent: string;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00+02:00"));
  await resetDatabase();
  cat = await seedCatalogue();
  const { anna } = cat.staff;
  owner = await createActor("owner");
  manager = await createActor("manager");
  staffActor = asStaff(await createActor("staff"), anna);
  fieldActor = asStaff(await createActor("field"), anna);

  // A weekend event where Anna has a duty (so the field user sees it) and one in November without a team.
  weekendEvent = (
    await insertEvent(cat, "Wochenendmarkt", "2026-10-24", [
      { roleId: cat.roles.lead.id, staffId: anna.id },
    ])
  ).id;
  laterEvent = (await insertEvent(cat, "Novembermarkt", "2026-11-14")).id;

  // Tasks: overdue, today, soon (all of Anna's, on the weekend event), plus ones that must not show up.
  await insertTask({
    title: "Überfällige Aufgabe",
    eventId: weekendEvent,
    assigneeId: anna.id,
    dueAt: dueOn("2026-10-19"),
    estimateMinutes: 90,
  });
  await insertTask({
    title: "Heutige Aufgabe",
    eventId: weekendEvent,
    assigneeId: anna.id,
    dueAt: dueOn("2026-10-21"),
    estimateMinutes: 30,
  });
  await insertTask({
    title: "Bald fällige Aufgabe",
    eventId: weekendEvent,
    assigneeId: cat.staff.ben.id,
    dueAt: dueOn("2026-10-25"),
  });
  await insertTask({
    title: "Erledigt",
    eventId: weekendEvent,
    dueAt: dueOn("2026-10-19"),
    status: "done",
    completedAt: dueOn("2026-10-18"),
  });
  await insertTask({ title: "Ohne Datum", eventId: laterEvent });
  await insertTask({ title: "Später", eventId: laterEvent, dueAt: dueOn("2026-11-30") });

  // A permit whose application deadline has passed.
  await db.insert(permit).values({
    venueId: cat.venue.id,
    category: "city",
    permitType: "water",
    title: "Wassergenehmigung",
    season: 2026,
    status: "not_started",
    applyBy: "2026-10-19",
  });

  // Two payables on the weekend event: one rate overdue, one due today.
  await createPayable(
    owner,
    {
      title: "Toiletten",
      scope: "event",
      eventId: weekendEvent,
      category: "toilets",
      totalGrossCents: 80_000,
    },
    [{ dueOn: "2026-10-18", amountCents: 80_000 }],
  );
  await createPayable(
    owner,
    {
      title: "Sicherheitsdienst",
      scope: "event",
      eventId: weekendEvent,
      category: "security",
      totalGrossCents: 50_000,
    },
    [{ dueOn: "2026-10-21", amountCents: 50_000 }],
  );

  // Hours: a shift a week ago without recorded times (deadline: day 7 after the work = today).
  await db.insert(shift).values({
    eventId: null,
    staffMemberId: anna.id,
    workDate: "2026-10-14",
    status: "confirmed",
  });

  // An obligation due in three days.
  await db.insert(obligation).values({
    kind: "other",
    title: "Brandschutzprüfung",
    scope: "company",
    nextDueOn: "2026-10-24",
    responsibleStaffMemberId: anna.id,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db.$client.end();
});

describe("Heute fällig", () => {
  it("merges every module and ranks: overdue, today, soon; overdue by market (none last), then permits > instalments > tasks > hours > obligations", async () => {
    const items = await listDueItems(owner, TODAY);
    expect(items.map((i) => `${i.urgency}:${i.kind}:${i.title}`)).toEqual([
      // The weekend market first; the permit no market needs comes after it.
      "overdue:installment:Toiletten",
      "overdue:task:Überfällige Aufgabe",
      "overdue:permit:Wassergenehmigung",
      "today:installment:Sicherheitsdienst",
      "today:task:Heutige Aufgabe",
      expect.stringMatching(/^today:hours:/),
      "soon:task:Bald fällige Aufgabe",
      "soon:obligation:Brandschutzprüfung",
    ]);
  });

  it("leaves out finished, undated and far-away tasks", async () => {
    const titles = (await listDueItems(owner, TODAY)).map((i) => i.title);
    for (const hidden of ["Erledigt", "Ohne Datum", "Später"]) expect(titles).not.toContain(hidden);
  });

  it('"Heute & überfällig" is the top five of the overdue and due-today items, in ranking order', async () => {
    const { due } = await getOverview(owner, TODAY);
    expect(due.total).toBe(6);
    expect(due.items.map((i) => i.title)).toEqual([
      "Toiletten",
      "Überfällige Aufgabe",
      "Wassergenehmigung",
      "Sicherheitsdienst",
      "Heutige Aufgabe",
    ]);
    // Nothing due later this week is in the card.
    expect(due.items.every((i) => i.urgency === "overdue" || i.urgency === "today")).toBe(true);
  });

  it("every item links somewhere (drawer or page)", async () => {
    for (const item of (await getOverview(owner, TODAY)).due.items) {
      expect(item.href).toMatch(/^\//);
    }
  });

  it("a manager sees everything an owner sees", async () => {
    expect((await listDueItems(manager, TODAY)).map((i) => i.id)).toEqual(
      (await listDueItems(owner, TODAY)).map((i) => i.id),
    );
  });

  it("staff see no money and no hours, and only the tasks assigned to them", async () => {
    const items = await listDueItems(staffActor, TODAY);
    expect(items.map((i) => `${i.kind}:${i.title}`)).toEqual([
      "task:Überfällige Aufgabe",
      "permit:Wassergenehmigung",
      "task:Heutige Aufgabe",
      "obligation:Brandschutzprüfung",
    ]);
    const overview = await getOverview(staffActor, TODAY);
    expect(overview.due.items.some((i) => i.kind === "installment" || i.kind === "hours")).toBe(
      false,
    );
  });

  it("a staff login without a staff record sees no tasks", async () => {
    const items = await listDueItems(await createActor("staff", "nobody@test.local"), TODAY);
    expect(items.some((i) => i.kind === "task")).toBe(false);
  });

  it("field users get only their own tasks: no permits, money, hours or obligations", async () => {
    const items = await listDueItems(fieldActor, TODAY);
    expect(items.map((i) => `${i.kind}:${i.title}`)).toEqual([
      "task:Überfällige Aufgabe",
      "task:Heutige Aufgabe",
    ]);
  });
});

describe("Heute & überfällig counts", () => {
  it("counts what is overdue and what is due today, from the same list", async () => {
    const { due } = await getOverview(owner, TODAY);
    expect(due.overdue).toBe(3);
    // Today: the rate "Sicherheitsdienst", the task "Heutige Aufgabe" and the shift without times.
    expect(due.dueToday).toBe(3);
  });

  it("staff count only their own items", async () => {
    const { due } = await getOverview(staffActor, TODAY);
    expect(due.overdue).toBe(2); // the permit and Anna's overdue task
    expect(due.dueToday).toBe(1);
  });
});

describe("Dieses Wochenende", () => {
  it("lists the weekend's markets with a verdict and the items that hold them up", async () => {
    const { weekend } = await getOverview(owner, TODAY);
    expect(weekend.saturday).toBe("2026-10-24");
    expect(weekend.markets.map((m) => m.row.name)).toEqual(["Wochenendmarkt"]);
    const [market] = weekend.markets;
    // Tasks: one overdue → Achtung (health), but the verdict is critical, like Board > Bereitschaft.
    expect(market?.row.health.tasks).toBe("warn");
    expect(market?.verdict.level).toBe("critical");
    expect(market?.verdict.reasons).toContainEqual({ key: "tasksOverdue", count: 1 });
    expect(market?.verdict.reasons).toContainEqual({ key: "tasksToday", count: 1 });
    // Overdue and due today only: no instalments, nothing dated later this week.
    expect(market?.blockers.map((b) => b.title)).toEqual([
      "Überfällige Aufgabe",
      "Heutige Aufgabe",
    ]);
  });

  it("a permit whose deadline has passed holds the market up, a later one does not", async () => {
    const [late, later] = await db
      .insert(permit)
      .values([
        {
          category: "city",
          permitType: "water",
          title: "Wasser Wochenende",
          season: 2026,
          status: "not_started",
          applyBy: "2026-10-20",
        },
        {
          category: "city",
          permitType: "other",
          title: "Lärm Wochenende",
          season: 2026,
          status: "not_started",
          applyBy: "2026-11-10",
        },
      ])
      .returning();
    await db.insert(eventPermit).values([
      { eventId: weekendEvent, permitId: late?.id as string },
      { eventId: weekendEvent, permitId: later?.id as string },
    ]);
    const { weekend } = await getOverview(owner, TODAY);
    const blockers = weekend.markets[0]?.blockers ?? [];
    const blocker = blockers.find((b) => b.title === "Wasser Wochenende");
    expect(blocker).toMatchObject({ kind: "permit", urgency: "overdue" });
    expect(blocker?.href).toBe(`/genehmigungen?genehmigung=${late?.id}`);
    expect(blockers.map((b) => b.title)).not.toContain("Lärm Wochenende");
  });

  it("is the Saturday and Sunday of the current week from Monday to Sunday, also on Sunday evening", async () => {
    const at = async (instant: string, today: string) => {
      vi.setSystemTime(new Date(instant));
      return (await getOverview(owner, today)).weekend;
    };
    // Monday morning after the weekend: the weekend that just ended is gone, the next one counts.
    const monday = await at("2026-10-26T07:00:00+01:00", "2026-10-26");
    expect([monday.saturday, monday.sunday]).toEqual(["2026-10-31", "2026-11-01"]);
    expect(monday.markets).toEqual([]);
    // Sunday evening: the running weekend still counts.
    const sunday = await at("2026-10-25T22:30:00+01:00", "2026-10-25");
    expect([sunday.saturday, sunday.sunday]).toEqual(["2026-10-24", "2026-10-25"]);
    expect(sunday.markets.map((m) => m.row.name)).toEqual(["Wochenendmarkt"]);
    // Monday of the same week: the coming Saturday and Sunday.
    const week = await at("2026-10-19T08:00:00+02:00", "2026-10-19");
    expect([week.saturday, week.sunday]).toEqual(["2026-10-24", "2026-10-25"]);
  });

  it('also gives the weekend after that, for the compact row "Nächstes Wochenende"', async () => {
    const { nextWeekend } = await getOverview(owner, TODAY);
    expect([nextWeekend.saturday, nextWeekend.sunday]).toEqual(["2026-10-31", "2026-11-01"]);
    expect(nextWeekend.markets).toEqual([]);
    vi.setSystemTime(new Date("2026-11-04T08:00:00+01:00"));
    const later = await getOverview(owner, "2026-11-04");
    expect(later.nextWeekend.saturday).toBe("2026-11-14");
    expect(later.nextWeekend.markets.map((m) => m.row.name)).toEqual(["Novembermarkt"]);
  });

  it("field users see their own weekend event only, without money", async () => {
    const { weekend } = await getOverview(fieldActor, TODAY);
    expect(weekend.markets.map((m) => m.row.name)).toEqual(["Wochenendmarkt"]);
    expect(weekend.markets[0]?.row.health.money).toBeNull();
    expect(weekend.markets[0]?.blockers.every((b) => b.kind === "task")).toBe(true);
  });
});
