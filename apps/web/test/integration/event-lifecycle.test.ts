import { readFileSync } from "node:fs";
import { auditLog, event, task } from "@marktwerk/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { listDueItems } from "@/server/queries/overview";
import {
  changeEventStatus,
  getEventCancellation,
  restoreCancelledEvent,
  revertEventStatus,
} from "@/server/services/event-lifecycle";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { dueOn, getTask, insertEvent, insertTask, TODAY } from "../helpers/tasks";

/** Cancelling an event cancels its open tasks; undo / leaving "abgesagt" reopens exactly those. */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let eventId: string;
let otherEventId: string;
let t: Record<string, string>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00+02:00"));
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  eventId = (await insertEvent(cat, "Abgesagt", "2026-10-24")).id;
  otherEventId = (await insertEvent(cat, "Anderer", "2026-10-25")).id;
  const mk = async (title: string, status: typeof task.$inferInsert.status, ev = eventId) =>
    (
      await insertTask({
        title,
        eventId: ev,
        status,
        dueAt: dueOn("2026-10-22"),
        ...(status === "done" ? { completedAt: dueOn("2026-10-20") } : {}),
      })
    ).id;
  t = {
    todo: await mk("todo", "todo"),
    prog: await mk("prog", "in_progress"),
    wait: await mk("wait", "waiting_external"),
    block: await mk("block", "blocked"),
    done: await mk("done", "done"),
    skip: await mk("skip", "skipped"),
    canc: await mk("canc", "cancelled"),
    other: await mk("other", "todo", otherEventId),
  };
});

afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await db.$client.end();
});

const status = async (id: string) => (await getTask(id)).status;
const lastStatusAudit = async () =>
  (
    await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "event.status"), eq(auditLog.entityId, eventId)))
  ).at(-1);

describe("cancelling an event", () => {
  it("cancels open tasks only, records {id, from}, leaves other events alone", async () => {
    await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    for (const k of ["todo", "prog", "wait", "block"])
      expect(await status(t[k] as string)).toBe("cancelled");
    expect(await status(t.done as string)).toBe("done");
    expect(await status(t.skip as string)).toBe("skipped");
    expect(await status(t.other as string)).toBe("todo");
    const diff = (await lastStatusAudit())?.diff as {
      cancelledTasks: { id: string; from: string }[];
    };
    expect(diff.cancelledTasks).toHaveLength(4);
    expect(diff.cancelledTasks).toEqual(
      expect.arrayContaining([
        { id: t.todo, from: "todo" },
        { id: t.prog, from: "in_progress" },
        { id: t.wait, from: "waiting_external" },
        { id: t.block, from: "blocked" },
      ]),
    );
  });

  it("removes the tasks from the Übersicht due list", async () => {
    const titles = async () => (await listDueItems(owner, TODAY)).map((i) => i.title);
    expect(await titles()).toContain("todo");
    await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    const after = await titles();
    expect(after).not.toContain("todo");
    expect(after).toContain("other");
  });
});

describe("reopening", () => {
  it("undo restores the exact previous statuses; a task changed meanwhile stays", async () => {
    const res = await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    await db
      .update(task)
      .set({ status: "skipped" })
      .where(eq(task.id, t.block as string));
    await revertEventStatus(owner, eventId, "cancelled", res.from, res.previousReason);
    expect(await status(t.todo as string)).toBe("todo");
    expect(await status(t.prog as string)).toBe("in_progress");
    expect(await status(t.wait as string)).toBe("waiting_external");
    expect(await status(t.block as string)).toBe("skipped");
    expect(await status(t.canc as string)).toBe("cancelled");
    const diff = (await lastStatusAudit())?.diff as { reopenedTaskIds: string[] };
    expect(new Set(diff.reopenedTaskIds)).toEqual(new Set([t.todo, t.prog, t.wait]));
  });

  it("cancelled → draft reopens them too", async () => {
    await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    await changeEventStatus(owner, eventId, "draft");
    expect(await status(t.prog as string)).toBe("in_progress");
    expect(await status(t.canc as string)).toBe("cancelled");
    expect(await status(t.other as string)).toBe("todo");
  });

  it("does not reopen a task that was cancelled by hand after the event came back", async () => {
    await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    await changeEventStatus(owner, eventId, "draft");
    await db
      .update(task)
      .set({ status: "cancelled" })
      .where(eq(task.id, t.todo as string));
    await changeEventStatus(owner, eventId, "planned");
    expect(await status(t.todo as string)).toBe("cancelled");
  });

  it("cancel → draft → cancel → undo of the second cancel → leave: the latest entry wins", async () => {
    await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    await changeEventStatus(owner, eventId, "draft");
    // Between the cycles someone changes a task by hand.
    await db
      .update(task)
      .set({ status: "in_progress" })
      .where(eq(task.id, t.todo as string));
    const second = await changeEventStatus(owner, eventId, "cancelled", "Nochmal");
    expect(await status(t.todo as string)).toBe("cancelled");
    await revertEventStatus(owner, eventId, "cancelled", second.from, second.previousReason);
    // undo of the second cancel restores the second cancel's snapshot ("in_progress", not "todo")
    expect(await status(t.todo as string)).toBe("in_progress");
    expect(await status(t.prog as string)).toBe("in_progress");
    expect(await status(t.wait as string)).toBe("waiting_external");
    expect(await status(t.block as string)).toBe("blocked");
    expect(await status(t.done as string)).toBe("done");
    expect(await status(t.skip as string)).toBe("skipped");
    expect(await status(t.canc as string)).toBe("cancelled");
    expect(await status(t.other as string)).toBe("todo");
    // Leaving again (the event is no longer cancelled) must not touch the tasks.
    await changeEventStatus(owner, eventId, "planned");
    expect(await status(t.todo as string)).toBe("in_progress");
    expect(await status(t.block as string)).toBe("blocked");
  });

  it("undo of a leave re-cancels the reopened tasks", async () => {
    await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    const left = await changeEventStatus(owner, eventId, "draft");
    expect(await status(t.block as string)).toBe("blocked");
    await revertEventStatus(owner, eventId, "draft", left.from, left.previousReason);
    for (const k of ["todo", "prog", "wait", "block"])
      expect(await status(t[k] as string)).toBe("cancelled");
    expect(await status(t.done as string)).toBe("done");
    expect(await status(t.skip as string)).toBe("skipped");
    expect(await status(t.other as string)).toBe("todo");
    // and leaving once more reopens the original statuses
    await changeEventStatus(owner, eventId, "draft");
    expect(await status(t.todo as string)).toBe("todo");
    expect(await status(t.wait as string)).toBe("waiting_external");
  });

  it("reads a backfill-shaped audit entry (latest entry that cancelled tasks)", async () => {
    await db
      .update(task)
      .set({ status: "cancelled" })
      .where(eq(task.id, t.todo as string));
    await db.execute(
      sql`update app.event set status = 'cancelled', cancelled_reason = 'alt' where id = ${eventId}`,
    );
    await db.insert(auditLog).values({
      action: "event.status",
      entityType: "event",
      entityId: eventId,
      diff: {
        backfill: true,
        from: "cancelled",
        to: "cancelled",
        cancelledTasks: [{ id: t.todo, from: "in_progress" }],
      },
    });
    await changeEventStatus(owner, eventId, "draft");
    expect(await status(t.todo as string)).toBe("in_progress");
  });

  it("migration 0012 backfills already cancelled events and the entry makes them reopenable", async () => {
    await db.execute(sql`update app.event set status = 'cancelled' where id = ${eventId}`);
    const file = new URL(
      "../../../../packages/db/drizzle/0012_cancel_tasks_of_cancelled_events.sql",
      import.meta.url,
    );
    await db.execute(sql.raw(readFileSync(file, "utf8")));
    for (const k of ["todo", "prog", "wait", "block"])
      expect(await status(t[k] as string)).toBe("cancelled");
    expect(await status(t.done as string)).toBe("done");
    expect(await status(t.other as string)).toBe("todo");
    const entry = await lastStatusAudit();
    expect(entry?.actorId).toBeNull();
    expect(entry?.diff).toMatchObject({ backfill: true });
    await changeEventStatus(owner, eventId, "draft");
    expect(await status(t.block as string)).toBe("blocked");
    expect(await status(t.wait as string)).toBe("waiting_external");
    expect(await status(t.canc as string)).toBe("cancelled");
  });
});

describe("Absage aufheben (UX-049)", () => {
  it("counts the tasks a cancellation closes and an undo reopens", async () => {
    const res = await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    expect(res).toMatchObject({ from: "planned", to: "cancelled", tasks: 4 });
    const undone = await revertEventStatus(owner, eventId, "cancelled", "planned", null);
    expect(undone).toEqual({ from: "cancelled", to: "planned", tasks: 4 });
  });

  it("goes back to the status before the cancellation and reopens the tasks, long after the toast", async () => {
    await changeEventStatus(owner, eventId, "confirmed");
    await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    expect(await getEventCancellation(eventId)).toMatchObject({
      restoresTo: "confirmed",
      tasks: 4,
    });

    const restored = await restoreCancelledEvent(owner, eventId);
    expect(restored).toEqual({
      from: "cancelled",
      to: "confirmed",
      previousReason: "Sturm",
      tasks: 4,
    });
    const [row] = await db
      .select({ status: event.status, reason: event.cancelledReason })
      .from(event)
      .where(eq(event.id, eventId));
    expect(row).toEqual({ status: "confirmed", reason: null });
    expect(await status(t.prog as string)).toBe("in_progress");
    expect(await status(t.canc as string)).toBe("cancelled");
    expect((await lastStatusAudit())?.diff).toMatchObject({
      from: "cancelled",
      to: "confirmed",
      restored: true,
    });

    // The toast's undo cancels again, with the old reason and the same tasks.
    await revertEventStatus(owner, eventId, "confirmed", "cancelled", restored.previousReason);
    expect(await status(t.prog as string)).toBe("cancelled");
    const [again] = await db
      .select({ reason: event.cancelledReason })
      .from(event)
      .where(eq(event.id, eventId));
    expect(again?.reason).toBe("Sturm");
    // And lifting it once more still knows where to go back to.
    expect((await restoreCancelledEvent(owner, eventId)).to).toBe("confirmed");
  });

  it("falls back to the draft without a record, and refuses an event that is not cancelled", async () => {
    await db
      .update(event)
      .set({ status: "cancelled", cancelledReason: "alt" })
      .where(eq(event.id, eventId));
    expect(await getEventCancellation(eventId)).toEqual({
      restoresTo: "draft",
      tasks: 0,
      at: null,
    });
    expect((await restoreCancelledEvent(owner, eventId)).to).toBe("draft");
    await expect(restoreCancelledEvent(owner, eventId)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("is forbidden without event:write", async () => {
    await changeEventStatus(owner, eventId, "cancelled", "Sturm");
    const staff = await createActor("staff");
    const error = await restoreCancelledEvent(staff, eventId).catch((e) => e);
    expect(String((error as { digest?: unknown })?.digest ?? "")).toContain("403");
  });
});
