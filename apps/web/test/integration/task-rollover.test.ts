import { escalationLog, event, notification } from "@marktwerk/db/schema";
import { JOBS, taskRollover } from "@marktwerk/jobs";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { dueOn, getTask, insertEvent, insertStaff, insertTask } from "../helpers/tasks";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let eventId: string;
let manager: Awaited<ReturnType<typeof insertStaff>>;

/** 00:05 Europe/Berlin on the given day (CEST until 24.10., CET after). */
const nightOf = (date: string) =>
  new Date(`${date}T00:05:00${date >= "2026-10-25" ? "+01:00" : "+02:00"}`);

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  eventId = (await insertEvent(cat, "Testmarkt", "2026-11-14")).id;
  manager = await insertStaff("Marta Chefin", { userId: "user-mgr", role: "manager" });
});

afterAll(async () => {
  await db.$client.end();
});

const mails = (reason: "rolled_over" | "escalated") =>
  db.select().from(notification).where(eq(notification.reason, reason));

describe("taskRollover", () => {
  it("is registered as a nightly job at 00:05", () => {
    expect(JOBS["task-rollover"].cron).toBe("5 0 * * *");
  });

  it("carries over overdue unfinished tasks and tells the assignee", async () => {
    const overdue = await insertTask({
      title: "Schilder abholen",
      eventId,
      dueAt: dueOn("2026-10-20"),
      assigneeId: cat.staff.anna.id,
      boardColumn: "this_week",
    });
    const waiting = await insertTask({
      title: "Antrag",
      eventId,
      dueAt: dueOn("2026-10-19"),
      status: "waiting_external",
      assigneeId: cat.staff.ben.id,
    });
    const unassigned = await insertTask({
      title: "Ohne Person",
      eventId,
      dueAt: dueOn("2026-10-18"),
    });

    const result = await taskRollover(db, nightOf("2026-10-21"));
    expect(result).toEqual({ rolled: 3, notified: 2, escalated: 0 });

    const row = await getTask(overdue.id);
    expect(row.rolloverCount).toBe(1);
    expect(row.lastRolledAt?.toISOString()).toBe(nightOf("2026-10-21").toISOString());
    // the manual-move override lapses with the due date
    expect(row.boardColumn).toBeNull();
    expect((await getTask(waiting.id)).rolloverCount).toBe(1);
    expect((await getTask(unassigned.id)).rolloverCount).toBe(1);

    const notes = await mails("rolled_over");
    expect(notes).toHaveLength(2);
    const forAnna = notes.find((n) => n.recipientStaffMemberId === cat.staff.anna.id);
    expect(forAnna).toMatchObject({
      subjectType: "task",
      subjectId: overdue.id,
      dedupeKey: `task:${overdue.id}:rolled-over:1`,
      link: `/veranstaltungen/${eventId}/board?aufgabe=${overdue.id}`,
    });
    expect(forAnna?.title).toContain("Schilder abholen");
  });

  it("leaves finished, future, today's and undated tasks alone", async () => {
    const ids = [
      await insertTask({
        title: "done",
        eventId,
        dueAt: dueOn("2026-10-10"),
        status: "done",
        completedAt: new Date(),
      }),
      await insertTask({
        title: "skipped",
        eventId,
        dueAt: dueOn("2026-10-10"),
        status: "skipped",
      }),
      await insertTask({
        title: "cancelled",
        eventId,
        dueAt: dueOn("2026-10-10"),
        status: "cancelled",
      }),
      await insertTask({ title: "today", eventId, dueAt: dueOn("2026-10-21") }),
      await insertTask({ title: "future", eventId, dueAt: dueOn("2026-11-01") }),
      await insertTask({ title: "undated", eventId }),
    ];
    // a task of a cancelled event is not nagged about either
    const cancelled = await insertEvent(cat, "Abgesagt", "2026-10-30");
    await db.update(event).set({ status: "cancelled" }).where(eq(event.id, cancelled.id));
    const orphan = await insertTask({
      title: "event abgesagt",
      eventId: cancelled.id,
      dueAt: dueOn("2026-10-10"),
    });

    expect((await taskRollover(db, nightOf("2026-10-21"))).rolled).toBe(0);
    for (const t of [...ids, orphan]) expect((await getTask(t.id)).rolloverCount).toBe(0);
  });

  it("rolls event-less tasks too", async () => {
    const t = await insertTask({
      title: "Büro",
      dueAt: dueOn("2026-10-20"),
      assigneeId: cat.staff.anna.id,
    });
    await taskRollover(db, nightOf("2026-10-21"));
    expect((await getTask(t.id)).rolloverCount).toBe(1);
    expect((await mails("rolled_over"))[0]?.link).toBe(`/board?aufgabe=${t.id}`);
  });

  it("counts a task once per Berlin day, however often the job runs", async () => {
    const t = await insertTask({
      title: "A",
      eventId,
      dueAt: dueOn("2026-10-20"),
      assigneeId: cat.staff.anna.id,
    });
    await taskRollover(db, nightOf("2026-10-21"));
    const again = await taskRollover(db, new Date(nightOf("2026-10-21").getTime() + 6 * 3_600_000));
    expect(again).toEqual({ rolled: 0, notified: 0, escalated: 0 });
    expect((await getTask(t.id)).rolloverCount).toBe(1);
    expect(await mails("rolled_over")).toHaveLength(1);

    // the next night counts again, with a new notification (dedupe key includes the count)
    await taskRollover(db, nightOf("2026-10-22"));
    expect((await getTask(t.id)).rolloverCount).toBe(2);
    expect((await mails("rolled_over")).map((n) => n.dedupeKey).sort()).toEqual([
      `task:${t.id}:rolled-over:1`,
      `task:${t.id}:rolled-over:2`,
    ]);
  });

  it("counts a day the job missed only once", async () => {
    const t = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-14") });
    await taskRollover(db, nightOf("2026-10-21"));
    expect((await getTask(t.id)).rolloverCount).toBe(1);
  });

  it("tells the manager when a task reaches its third carry-over, once", async () => {
    const t = await insertTask({
      title: "Hängt fest",
      eventId,
      dueAt: dueOn("2026-10-18"),
      assigneeId: cat.staff.ben.id,
      rolloverCount: 2,
    });
    const result = await taskRollover(db, nightOf("2026-10-21"));
    expect(result.escalated).toBe(1);
    const [escalation] = await mails("escalated");
    expect(escalation).toMatchObject({
      recipientStaffMemberId: manager.id,
      subjectId: t.id,
      dedupeKey: `task:${t.id}:escalated:3`,
      severity: "warning",
    });
    expect(escalation?.title).toContain("3×");
    expect(escalation?.body).toContain("Ben Test");
    const log = await db.select().from(escalationLog);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      subjectId: t.id,
      level: 2,
      escalatedToStaffMemberId: manager.id,
    });

    // the 4th night only notifies the assignee
    const next = await taskRollover(db, nightOf("2026-10-22"));
    expect(next.escalated).toBe(0);
    expect(await mails("escalated")).toHaveLength(1);
    expect((await getTask(t.id)).rolloverCount).toBe(4);
  });

  it("does not escalate to people who are not managers, and copes with no manager at all", async () => {
    await db.delete(notification);
    await insertStaff("Otto Büro", { userId: "user-off", role: "staff" });
    const t = await insertTask({
      title: "A",
      eventId,
      dueAt: dueOn("2026-10-18"),
      rolloverCount: 2,
    });
    const result = await taskRollover(db, nightOf("2026-10-21"));
    expect(result.escalated).toBe(1); // only the manager from the fixture
    expect((await mails("escalated")).map((n) => n.recipientStaffMemberId)).toEqual([manager.id]);
    expect((await getTask(t.id)).rolloverCount).toBe(3);

    await resetDatabase();
    cat = await seedCatalogue();
    const e = await insertEvent(cat, "Ohne Chef", "2026-11-14");
    await insertTask({ title: "B", eventId: e.id, dueAt: dueOn("2026-10-18"), rolloverCount: 2 });
    expect(await taskRollover(db, nightOf("2026-10-21"))).toEqual({
      rolled: 1,
      notified: 0,
      escalated: 0,
    });
  });

  it("uses the Berlin day: right after midnight Berlin a task due yesterday is overdue", async () => {
    const t = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-21") });
    // 2026-10-21 23:30 UTC = 2026-10-22 01:30 Berlin
    await taskRollover(db, new Date("2026-10-21T23:30:00Z"));
    expect((await getTask(t.id)).rolloverCount).toBe(1);
    // 2026-10-21 21:30 UTC = 23:30 Berlin on the 21st: still the due day
    const u = await insertTask({ title: "B", eventId, dueAt: dueOn("2026-10-22") });
    await taskRollover(db, new Date("2026-10-22T21:30:00Z"));
    expect((await getTask(u.id)).rolloverCount).toBe(0);
  });
});
