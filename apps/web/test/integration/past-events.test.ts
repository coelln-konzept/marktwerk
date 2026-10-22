import {
  auditLog,
  event,
  notification,
  outboundMessage,
  settings,
  staffMember,
  task,
} from "@marktwerk/db/schema";
import { dailyDigest, deadlineSweep } from "@marktwerk/jobs";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import {
  calendarItems,
  dueItems,
  getPeopleRail,
  listBoardTasks,
  openTaskCounts,
  pastEventCleanup,
} from "@/server/queries/tasks";
import {
  setTaskStatus,
  skipPastEventTasks,
  undoTaskChange,
  undoTaskChanges,
} from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, dueOn, getTask, insertEvent, insertTask, TODAY } from "../helpers/tasks";

/**
 * Tasks of past markets (last day more than 7 days ago): out of every cross-market list and KPI, still on the
 * event's own board, and skippable in bulk with undo. TODAY is Wed 21 Oct 2026, so 7 days ago is 14 Oct:
 * a market that ended on the 14th is still current, one that ended on the 13th is past.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let edgeCurrent: string; // ended 14 Oct: exactly 7 days ago, still current
let edgePast: string; // ended 13 Oct: 8 days ago, past
let longPast: string; // ended in August
const clock = { today: TODAY, now: new Date("2026-10-21T10:00:00Z") };

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  edgeCurrent = (await insertEvent(cat, "Grenzmarkt aktuell", "2026-10-14")).id;
  edgePast = (await insertEvent(cat, "Grenzmarkt vorbei", "2026-10-13")).id;
  longPast = (await insertEvent(cat, "Sommermarkt", "2026-08-15")).id;
  await insertTask({ title: "Aktuell A", eventId: edgeCurrent, dueAt: dueOn("2026-10-10") });
  await insertTask({ title: "Vorbei A", eventId: edgePast, dueAt: dueOn("2026-10-10") });
  await insertTask({ title: "Vorbei B", eventId: edgePast, dueAt: dueOn("2026-10-12") });
  await insertTask({ title: "Sommer A", eventId: longPast, dueAt: dueOn("2026-08-01") });
  await insertTask({ title: "Ohne Markt", dueAt: dueOn("2026-10-09") });
  await insertTask({
    title: "Sommer erledigt",
    eventId: longPast,
    status: "done",
    completedAt: new Date("2026-08-14T10:00:00Z"),
  });
});

afterAll(async () => {
  await db.$client.end();
});

const titles = (items: { title: string }[]) => items.map((i) => i.title).sort();

describe("the 7-day boundary", () => {
  it("keeps a market that ended exactly 7 days ago and drops one that ended 8 days ago", async () => {
    expect(titles(await dueItems(owner, TODAY))).toEqual(["Aktuell A", "Ohne Markt"]);
    expect(await openTaskCounts(owner, TODAY)).toEqual({ open: 2, overdue: 2 });
  });

  it("moves with the day: tomorrow the market of the 14th is past too", async () => {
    expect(titles(await dueItems(owner, "2026-10-22"))).toEqual(["Ohne Markt"]);
  });

  it("applies to the cross-event board, not to the event's own board", async () => {
    const cross = await listBoardTasks(owner, {}, TODAY);
    expect(titles(cross.tasks)).toEqual(["Aktuell A", "Ohne Markt"]);
    const own = await listBoardTasks(owner, { eventId: edgePast }, TODAY);
    expect(titles(own.tasks)).toEqual(["Vorbei A", "Vorbei B"]);
  });

  it("applies to the Kalender task layer", async () => {
    const items = await calendarItems(owner, "2026-08-01", "2026-10-31", TODAY);
    expect(titles(items)).toEqual(["Aktuell A", "Ohne Markt"]);
  });

  it("applies to the people rail across events", async () => {
    const rail = await getPeopleRail(owner, {}, TODAY);
    expect(rail.unassigned.tasks).toBe(2);
    const own = await getPeopleRail(owner, { eventId: longPast }, TODAY);
    expect(own.unassigned.tasks).toBe(1);
  });
});

describe("reminders and digest", () => {
  const NOW = new Date("2026-10-21T10:00:00Z");

  it("do not remind, escalate or list open tasks of past markets", async () => {
    await db.insert(settings).values({
      id: 1,
      companyName: "Test GmbH",
      emailEnabled: true,
      dailyDigestEnabled: true,
    });
    await createActor("staff");
    await createActor("manager");
    const { anna, ben } = cat.staff;
    await db
      .update(staffMember)
      .set({ userId: "user-staff", email: "anna@test.local" })
      .where(eq(staffMember.id, anna.id));
    await db
      .update(staffMember)
      .set({ userId: "user-manager", email: "ben@test.local" })
      .where(eq(staffMember.id, ben.id));
    const current = await insertTask({
      title: "Plakat aktuell",
      eventId: edgeCurrent,
      assigneeId: anna.id,
      priority: "high",
      dueAt: new Date("2026-10-19T08:00:00Z"),
    });
    const past = await insertTask({
      title: "Plakat vorbei",
      eventId: edgePast,
      assigneeId: anna.id,
      priority: "high",
      dueAt: new Date("2026-10-19T08:00:00Z"),
    });
    await deadlineSweep(db, NOW);
    const subjects = (await db.select().from(notification)).map((n) => n.subjectId);
    expect(subjects).toContain(current.id);
    expect(subjects).not.toContain(past.id);

    await dailyDigest(db, NOW);
    const text = (await db.select().from(outboundMessage))
      .map((m) => m.renderedText ?? "")
      .join("\n");
    expect(text).toContain("Plakat aktuell");
    expect(text).not.toContain("Plakat vorbei");
  });
});

describe("Aufräumen", () => {
  it("lists past markets with their open task counts, newest first", async () => {
    const { events, total } = await pastEventCleanup(owner, TODAY);
    expect(events.map((e) => [e.name, e.openTasks])).toEqual([
      ["Grenzmarkt vorbei", 2],
      ["Sommermarkt", 1],
    ]);
    expect(total).toBe(3);
  });

  it("skips only the open tasks of the chosen market, audited, in one go", async () => {
    const result = await skipPastEventTasks(owner, [edgePast], clock);
    expect(result.skipped).toBe(2);
    for (const t of await listBoardTasks(owner, { eventId: edgePast }, TODAY).then(
      (b) => b.tasks,
    )) {
      expect(t.status).toBe("skipped");
    }
    // the other past market, the current one and the event-less task are untouched
    const open = await db.query.task.findMany({ where: (t, { eq }) => eq(t.status, "todo") });
    expect(titles(open)).toEqual(["Aktuell A", "Ohne Markt", "Sommer A"]);
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, "task.status"));
    expect(entries).toHaveLength(2);
    expect(entries[0]?.diff).toMatchObject({ from: "todo", to: "skipped", cleanup: "past_event" });
    expect((await pastEventCleanup(owner, TODAY)).total).toBe(1);
  });

  it("skips every past market with no ids, and never touches a market that is not past", async () => {
    const result = await skipPastEventTasks(owner, undefined, clock);
    expect(result.skipped).toBe(3);
    expect((await pastEventCleanup(owner, TODAY)).total).toBe(0);
    // asking for the current market by id changes nothing
    expect((await skipPastEventTasks(owner, [edgeCurrent], clock)).skipped).toBe(0);
    expect(await openTaskCounts(owner, TODAY)).toEqual({ open: 2, overdue: 2 });
  });

  it("is undone with one toast: all previous statuses come back", async () => {
    const before = await db.select().from(task);
    const { auditIds } = await skipPastEventTasks(owner, undefined, clock);
    expect(auditIds).toHaveLength(3);
    expect(await undoTaskChanges(owner, auditIds)).toEqual({ undone: 3 });
    const after = await db.select().from(task);
    const byId = new Map(after.map((t) => [t.id, t]));
    for (const t of before) {
      expect(byId.get(t.id)?.status).toBe(t.status);
      expect(byId.get(t.id)?.skippedReason).toBe(t.skippedReason);
    }
    expect((await pastEventCleanup(owner, TODAY)).total).toBe(3);
  });

  it("refuses to undo when a task was changed since, and then changes nothing", async () => {
    const { auditIds } = await skipPastEventTasks(owner, [edgePast], clock);
    const someTask = await db.query.task.findFirst({
      where: (t, { eq }) => eq(t.title, "Vorbei A"),
    });
    await setTaskStatus(owner, someTask?.id as string, "todo", {}, clock);
    await expect(undoTaskChanges(owner, auditIds)).rejects.toMatchObject({ code: "conflict" });
    // the other task stayed skipped, because the whole undo rolled back
    const other = await db.query.task.findFirst({ where: (t, { eq }) => eq(t.title, "Vorbei B") });
    expect((await getTask(other?.id as string)).status).toBe("skipped");
  });

  it("a single entry can still be undone alone", async () => {
    const { auditIds } = await skipPastEventTasks(owner, [longPast], clock);
    await undoTaskChange(owner, auditIds[0] as string);
    expect((await pastEventCleanup(owner, TODAY)).total).toBe(3);
  });

  it("does not show other people's tasks to staff, and leaves them alone", async () => {
    const staff = asStaff(await createActor("staff"), cat.staff.anna);
    expect((await pastEventCleanup(staff, TODAY)).total).toBe(0);
    expect((await skipPastEventTasks(staff, undefined, clock)).skipped).toBe(0);
  });

  it("is not blocked by the event status", async () => {
    await db.update(event).set({ status: "cancelled" }).where(eq(event.id, longPast));
    expect((await pastEventCleanup(owner, TODAY)).total).toBe(3);
  });
});
