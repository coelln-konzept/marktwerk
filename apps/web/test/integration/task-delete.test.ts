import { auditLog } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { listEventHistory } from "@/server/queries/event-detail";
import {
  deleteTask,
  restoreTask,
  setTaskStatus,
  TaskInputError,
  undoTaskChange,
} from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, dueOn, getTask, insertEvent, insertTask } from "../helpers/tasks";

/** Deleting tasks (user test 2, UT2-13): owner, manager and staff; undo and "Wiederherstellen" bring it back. */
let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let office: Actor;
let eventId: string;

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TaskInputError) return error.code;
    throw error;
  }
  return "no error";
};

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  office = asStaff(await createActor("staff"), cat.staff.anna);
  eventId = (await insertEvent(cat, "Testmarkt", "2026-11-14")).id;
});

afterAll(async () => {
  await db.$client.end();
});

describe("deleteTask", () => {
  it("lets staff delete: the task is cancelled, audited, and the undo brings back its status", async () => {
    const t = await insertTask({ title: "Schilder", eventId, dueAt: dueOn("2026-11-10") });
    await setTaskStatus(office, t.id, "in_progress");
    const result = await deleteTask(office, t.id);
    expect(result.changed).toBe(true);
    expect((await getTask(t.id)).status).toBe("cancelled");
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "task.delete"));
    expect(entry?.diff).toMatchObject({
      before: { status: "in_progress" },
      after: { status: "cancelled" },
      title: "Schilder",
    });

    await undoTaskChange(office, result.auditId as string);
    expect((await getTask(t.id)).status).toBe("in_progress");
  });

  it("refuses a task that is already deleted", async () => {
    const t = await insertTask({ title: "Schilder", eventId });
    await deleteTask(owner, t.id);
    expect(await code(deleteTask(owner, t.id))).toBe("invalid_state");
  });

  it("is forbidden for field users", async () => {
    const field = asStaff(await createActor("field"), cat.staff.ben);
    const t = await insertTask({ title: "Schilder", eventId, assigneeId: cat.staff.ben.id });
    await expect(deleteTask(field, t.id)).rejects.toSatisfy(isForbidden);
    await expect(restoreTask(field, t.id)).rejects.toSatisfy(isForbidden);
    expect((await getTask(t.id)).status).toBe("todo");
  });
});

describe("restoreTask", () => {
  it("puts back the status before the delete; the Verlauf offers it only while deleted", async () => {
    const t = await insertTask({ title: "Schilder", eventId });
    await setTaskStatus(owner, t.id, "blocked", { reason: "Amt" });
    await deleteTask(owner, t.id);

    let history = await listEventHistory(owner, eventId);
    const deleted = history.find((e) => e.action === "task.delete");
    expect(deleted).toMatchObject({ restoreTaskId: t.id, restoreDeleted: true, subject: "Schilder" });

    const restored = await restoreTask(office, t.id);
    expect((await getTask(t.id)).status).toBe("blocked");
    history = await listEventHistory(owner, eventId);
    expect(history.find((e) => e.action === "task.delete")?.restoreTaskId).toBeNull();
    expect(history[0]?.action).toBe("task.restore");

    // The restore is undoable too (deletes it again).
    await undoTaskChange(office, restored.auditId as string);
    expect((await getTask(t.id)).status).toBe("cancelled");
  });

  it("falls back to todo for a task cancelled without a delete (e.g. with its event)", async () => {
    const t = await insertTask({ title: "Schilder", eventId, status: "cancelled" });
    await restoreTask(owner, t.id);
    expect((await getTask(t.id)).status).toBe("todo");
  });

  it("refuses a task that isn't deleted", async () => {
    const t = await insertTask({ title: "Schilder", eventId });
    expect(await code(restoreTask(owner, t.id))).toBe("invalid_state");
  });
});
