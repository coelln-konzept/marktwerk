import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createdTaskHref,
  dueProblem,
  pendingSubtasks,
  type QueuedSubtask,
} from "@/components/task/drawer-logic";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { getTaskDetail } from "@/server/queries/tasks";
import { createTask, deleteTask, restoreTask, updateTask } from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { getTask, insertEvent, insertTask } from "../helpers/tasks";

/** Task drawer and "Neue Aufgabe" (UX audit round 1, batch B04). */

describe("dueProblem", () => {
  it("takes an empty field as no due date, but a half-typed one as incomplete (UX-001)", () => {
    expect(dueProblem({ value: "", badInput: false })).toBeNull();
    expect(dueProblem({ value: "", badInput: true })).toBe("incomplete");
  });

  it("accepts a normal date and refuses years outside 2000–2099", () => {
    expect(dueProblem({ value: "2026-03-05", badInput: false })).toBeNull();
    expect(dueProblem({ value: "2000-01-01", badInput: false })).toBeNull();
    expect(dueProblem({ value: "2099-12-31", badInput: false })).toBeNull();
    // "31022026" typed into a native field becomes year 31022.
    expect(dueProblem({ value: "31022-02-26", badInput: false })).toBe("invalid");
    expect(dueProblem({ value: "0026-03-05", badInput: false })).toBe("invalid");
    expect(dueProblem({ value: "2100-01-01", badInput: false })).toBe("invalid");
  });
});

describe("createdTaskHref", () => {
  it("drops the request that opened the dialog, so reload and Back do not reopen it (UX-004)", () => {
    expect(createdTaskHref({ pathname: "/", search: "neu=1&veranstaltung=e1", taskId: "t1" })).toBe(
      "/?aufgabe=t1",
    );
  });

  it("keeps the other parameters of the page and replaces an open drawer", () => {
    expect(
      createdTaskHref({
        pathname: "/veranstaltungen/e1",
        search: new URLSearchParams("tab=checkliste&aufgabe=old&detail=task:old"),
        taskId: "t2",
      }),
    ).toBe("/veranstaltungen/e1?tab=checkliste&aufgabe=t2");
  });

  it("opens on a fixed page when one is given", () => {
    expect(
      createdTaskHref({ pathname: "/", search: "neu=1", taskId: "t3", openPath: "/genehmigungen" }),
    ).toBe("/genehmigungen?aufgabe=t3");
  });
});

describe("pendingSubtasks", () => {
  const queued: QueuedSubtask[] = [
    { key: 1, title: "Eins", id: "a" },
    { key: 2, title: "Zwei", id: "b" },
    { key: 3, title: "Drei", id: null },
  ];

  it("shows unsaved ones and saved ones whose row has not arrived yet (UX-021)", () => {
    expect(pendingSubtasks(queued, ["a"]).map((q) => q.title)).toEqual(["Zwei", "Drei"]);
    expect(pendingSubtasks(queued, ["a", "b"]).map((q) => q.title)).toEqual(["Drei"]);
    expect(pendingSubtasks(queued, [])).toHaveLength(3);
  });
});

describe("task drawer services", () => {
  let cat: Awaited<ReturnType<typeof seedCatalogue>>;
  let owner: Actor;
  let eventId: string;

  beforeEach(async () => {
    await resetDatabase();
    cat = await seedCatalogue();
    owner = await createActor("owner");
    eventId = (await insertEvent(cat, "Testmarkt", "2026-11-14")).id;
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("clears a due date from the drawer and its undo puts date and flags back (UX-001)", async () => {
    const t = await insertTask({
      title: "Schilder",
      eventId,
      dueAt: new Date("2026-11-10T09:00:00Z"),
    });
    const before = await getTask(t.id);
    // What the drawer sends when the field is cleared …
    expect((await updateTask(owner, t.id, { dueOn: null })).changed).toBe(true);
    expect((await getTask(t.id)).dueAt).toBeNull();
    // … and what its undo toast sends.
    await updateTask(owner, t.id, {
      dueOn: "2026-11-10",
      restoreFlags: { dueOverridden: before.dueOverridden, customized: before.customized },
    });
    const row = await getTask(t.id);
    // The day comes back (the time of day of a cleared date is gone; due dates are days).
    expect(row.dueAt?.toISOString().slice(0, 10)).toBe("2026-11-10");
    expect(row).toMatchObject({ dueOverridden: false, customized: false });
  });

  it("keeps every subtask of quick adds, in the order typed (UX-021)", async () => {
    const parent = await insertTask({ title: "Aufbau", eventId });
    // The drawer queues the saves: one after another, never two at once and none skipped.
    for (const title of ["Zelte", "Tische", "Kabel"])
      await createTask(owner, { title, parentId: parent.id });
    const detail = await getTaskDetail(owner, parent.id, "2026-11-01");
    expect(detail?.subtasks.map((s) => s.title)).toEqual(["Zelte", "Tische", "Kabel"]);
  });

  it("still opens a deleted task, shown as deleted, and restores it (UX-060)", async () => {
    const t = await insertTask({ title: "Schilder", eventId });
    await deleteTask(owner, t.id);
    const deleted = await getTaskDetail(owner, t.id, "2026-11-01");
    expect(deleted?.status).toBe("cancelled");
    await restoreTask(owner, t.id);
    expect((await getTaskDetail(owner, t.id, "2026-11-01"))?.status).toBe("todo");
  });
});
