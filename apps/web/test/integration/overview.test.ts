import { eventPermit, obligation, permit, shift, vehicle } from "@marktwerk/db/schema";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import type { DueItem } from "@/server/queries/due";
import { getEventOverview } from "@/server/queries/event-overview";
import type { EventRow } from "@/server/queries/events";
import { getOverview, listDueItems } from "@/server/queries/overview";
import { createPayable } from "@/server/services/payables";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, dueOn, insertEvent, insertTask, TODAY } from "../helpers/tasks";

/**
 * Übersicht aggregation ("Zwei Fragen"): the due items of all modules in one ranked list, the top of it for
 * "Heute & überfällig", and the weekend box with the Checkliste progress per event, for the roles that see
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

  // An obligation due in three days whose reminder has not started (no lead): "Nächste Tage".
  await db.insert(obligation).values({
    kind: "other",
    title: "Brandschutzprüfung",
    scope: "company",
    nextDueOn: "2026-10-24",
    leadDays: 0,
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

  it('"Heute & überfällig" holds every overdue and due-today item, "Nächste Tage" the rest, in ranking order', async () => {
    const { due } = await getOverview(owner, TODAY);
    expect(due.total).toBe(6);
    expect(due.items.map((i) => i.title)).toEqual([
      "Toiletten",
      "Überfällige Aufgabe",
      "Wassergenehmigung",
      "Sicherheitsdienst",
      "Heutige Aufgabe",
      expect.any(String), // the hours deadline
    ]);
    expect(due.items.every((i) => i.urgency === "overdue" || i.urgency === "today")).toBe(true);
    expect(due.later.map((i) => i.title)).toEqual(["Bald fällige Aufgabe", "Brandschutzprüfung"]);
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

describe("Pflichten reminders (research 10)", () => {
  let sprinter: string;
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    const [van] = await db
      .insert(vehicle)
      .values({ name: "Sprinter", plate: "K-MW 123", odometerKm: 99_400 })
      .returning();
    sprinter = van?.id as string;
    const rows = await db
      .insert(obligation)
      .values([
        // "Erinnerung ab" 30 days before 20 Nov: the reminder runs since 21 Oct (today).
        {
          kind: "hu",
          title: "HU",
          scope: "vehicle",
          vehicleId: sprinter,
          nextDueOn: "2026-11-20",
          leadDays: 30,
          responsibleStaffMemberId: cat.staff.anna.id,
        },
        // Due in 3 weeks, but reminded only 14 days before: not yet.
        {
          kind: "insurance",
          title: "Betriebshaftpflicht",
          scope: "company",
          nextDueOn: "2026-11-11",
          leadDays: 14,
          responsibleStaffMemberId: cat.staff.anna.id,
        },
        {
          kind: "report",
          title: "KSK-Meldung",
          scope: "company",
          nextDueOn: "2026-10-01",
          responsibleStaffMemberId: cat.staff.ben.id,
        },
        // 600 km before the km target (inside DEFAULT_KM_LEAD), no date.
        {
          kind: "service",
          title: "Inspektion",
          scope: "vehicle",
          vehicleId: sprinter,
          nextDueKm: 100_000,
          responsibleStaffMemberId: cat.staff.anna.id,
        },
        // In its window, but archived.
        {
          kind: "other",
          title: "Archiviert",
          scope: "company",
          nextDueOn: "2026-10-25",
          responsibleStaffMemberId: cat.staff.anna.id,
          archivedAt: new Date("2026-10-01T10:00:00+02:00"),
        },
      ])
      .returning({ id: obligation.id, title: obligation.title });
    for (const r of rows) ids[r.title] = r.id;
  });

  const obligations = (items: DueItem[]) => items.filter((i) => i.kind === "obligation");

  it('from "Erinnerung ab" on a Pflicht is in "Heute & überfällig" with its due date and a link to it', async () => {
    const { due } = await getOverview(owner, TODAY);
    const hu = due.items.find((i) => i.id === ids.HU);
    expect(hu).toMatchObject({
      kind: "obligation",
      title: "HU · K-MW 123",
      dueOn: "2026-11-20",
      urgency: "today",
      href: `/firma/pflichten/${ids.HU}`,
      meta: "Sprinter",
      assigneeName: "Anna Test",
    });
    expect(due.later.some((i) => i.id === ids.HU)).toBe(false);
  });

  it("overdue Pflichten are under Überfällig, km targets count from today, the rest stays out", async () => {
    const { due } = await getOverview(owner, TODAY);
    expect(obligations(due.items).map((i) => `${i.urgency}:${i.title}:${i.dueOn}`)).toEqual([
      "overdue:KSK-Meldung:2026-10-01",
      "today:Inspektion · K-MW 123:2026-10-21",
      "today:HU · K-MW 123:2026-11-20",
    ]);
    // Before its window (and the lead-less one due this week stays in "Nächste Tage").
    expect(obligations(due.later).map((i) => i.title)).toEqual(["Brandschutzprüfung"]);
    const all = [...due.items, ...due.later].map((i) => i.title);
    expect(all).not.toContain("Betriebshaftpflicht");
    expect(all).not.toContain("Archiviert");
  });

  it("they rank after the other items of their group", async () => {
    const { due } = await getOverview(owner, TODAY);
    const kinds = due.items.filter((i) => i.urgency === "today").map((i) => i.kind);
    expect(kinds.slice(-2)).toEqual(["obligation", "obligation"]);
    expect(due.items.filter((i) => i.urgency === "overdue").at(-1)?.title).toBe("KSK-Meldung");
  });

  it('the reminder starts on the day of "Erinnerung ab", not the day before', async () => {
    vi.setSystemTime(new Date("2026-10-27T10:00:00+01:00"));
    const before = await getOverview(owner, "2026-10-27");
    expect(before.due.items.map((i) => i.title)).not.toContain("Betriebshaftpflicht");
    vi.setSystemTime(new Date("2026-10-28T10:00:00+01:00"));
    const from = await getOverview(owner, "2026-10-28");
    expect(from.due.items.find((i) => i.title === "Betriebshaftpflicht")).toMatchObject({
      urgency: "today",
      dueOn: "2026-11-11",
    });
  });

  it("only roles with company:read see them; an archived vehicle's Pflichten stay out", async () => {
    expect(obligations((await getOverview(staffActor, TODAY)).due.items)).toHaveLength(3);
    expect(obligations((await getOverview(fieldActor, TODAY)).due.items)).toEqual([]);
    await db.update(vehicle).set({ archivedAt: new Date() });
    expect(obligations((await getOverview(owner, TODAY)).due.items).map((i) => i.title)).toEqual([
      "KSK-Meldung",
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
  it("lists the weekend's events with their Checkliste progress and the overdue count", async () => {
    const { weekend, nextEvents } = await getOverview(owner, TODAY);
    expect(weekend.saturday).toBe("2026-10-24");
    expect(weekend.markets.map((m) => m.row.name)).toEqual(["Wochenendmarkt"]);
    // Four tasks, one of them done; one open task is overdue.
    expect(weekend.markets[0]?.checklist).toEqual({ done: 1, total: 4, overdue: 1 });
    // The weekend has an event, so the box does not look further ahead.
    expect(nextEvents).toEqual([]);
  });

  it("counts a skipped task as finished and leaves cancelled tasks and subtasks out", async () => {
    const parent = await insertTask({
      title: "Übersprungen",
      eventId: weekendEvent,
      status: "skipped",
    });
    await insertTask({ title: "Abgesagt", eventId: weekendEvent, status: "cancelled" });
    await insertTask({ title: "Unteraufgabe", eventId: weekendEvent, parentTaskId: parent.id });
    const { weekend } = await getOverview(owner, TODAY);
    expect(weekend.markets[0]?.checklist).toMatchObject({ done: 2, total: 5 });
  });

  it('counts missing permits by the rule of "Was fehlt"', async () => {
    // No permit yet: nothing is missing.
    expect((await getOverview(owner, TODAY)).weekend.markets[0]?.permitsMissing).toBe(0);
    const link = async (patch: Partial<typeof permit.$inferInsert>, required = true) => {
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
      await db
        .insert(eventPermit)
        .values({ eventId: weekendEvent, permitId: row?.id as string, required });
    };
    // Missing: not filed; granted but ending before the market; filed but not granted three days before
    // the market (within 14 days of it, a filed permit counts too).
    await link({ title: "Offen", status: "not_started" });
    await link({ title: "Zu kurz", status: "granted", validUntil: "2026-10-23" });
    await link({ title: "Beantragt", status: "applied", applyBy: "2026-10-30" });
    // Not missing: granted, optional, not required, superseded, archived.
    await link({ title: "Erteilt", status: "granted" });
    await link({ title: "Optional", status: "not_started" }, false);
    await link({ title: "Nicht nötig", status: "not_required" });
    await link({ title: "Abgelöst", status: "superseded" });
    await link({ title: "Archiviert", status: "not_started", archivedAt: new Date() });

    const [market] = (await getOverview(owner, TODAY)).weekend.markets;
    expect(market?.permitsMissing).toBe(3);
    // The same permits the event's Zusammenfassung lists under "Was fehlt".
    const { permits } = await getEventOverview(owner, market?.row as EventRow, TODAY);
    expect(permits?.missing.map((p) => p.title).sort()).toEqual(["Beantragt", "Offen", "Zu kurz"]);
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

  it("an empty weekend shows the next events instead: the first one and the rest of its weekend", async () => {
    // A Wednesday event before the November weekend, and one a week later that stays out.
    await insertEvent(cat, "Mittwochsmarkt", "2026-11-11");
    await insertEvent(cat, "Spätmarkt", "2026-11-21");
    vi.setSystemTime(new Date("2026-11-04T08:00:00+01:00"));
    const { weekend, nextEvents } = await getOverview(owner, "2026-11-04");
    expect(weekend.markets).toEqual([]);
    expect(nextEvents.map((m) => m.row.name)).toEqual(["Mittwochsmarkt", "Novembermarkt"]);
    // "Ohne Datum" and "Später": nothing done yet.
    expect(nextEvents[1]?.checklist).toEqual({ done: 0, total: 2, overdue: 0 });
  });

  it("field users see their own weekend event only, without money", async () => {
    const { weekend } = await getOverview(fieldActor, TODAY);
    expect(weekend.markets.map((m) => m.row.name)).toEqual(["Wochenendmarkt"]);
    expect(weekend.markets[0]?.row.health.money).toBeNull();
    expect(weekend.markets[0]?.checklist).toMatchObject({ done: 1, total: 4 });
  });
});
