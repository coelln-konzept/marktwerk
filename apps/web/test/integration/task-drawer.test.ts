import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createdTaskHref,
  dueProblem,
  keptSubtasks,
  notifyNeedsDue,
  pendingSubtasks,
  type QueuedSubtask,
} from "@/components/task/drawer-logic";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { getTaskDetail } from "@/server/queries/tasks";
import { changeEventStatus } from "@/server/services/event-lifecycle";
import { deleteTask, restoreTask, TaskInputError, updateTask } from "@/server/services/tasks";
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
    { key: 1, parentId: "p", title: "Eins", id: "a" },
    { key: 2, parentId: "p", title: "Zwei", id: "b" },
    { key: 3, parentId: "p", title: "Drei", id: null },
  ];

  it("shows unsaved ones and saved ones whose row has not arrived yet (UX-021)", () => {
    expect(pendingSubtasks(queued, "p", ["a"]).map((q) => q.title)).toEqual(["Zwei", "Drei"]);
    expect(pendingSubtasks(queued, "p", ["a", "b"]).map((q) => q.title)).toEqual(["Drei"]);
    expect(pendingSubtasks(queued, "p", [])).toHaveLength(3);
  });

  it("shows nothing typed into another task once that one is no longer open", () => {
    expect(pendingSubtasks(queued, "other", [])).toEqual([]);
  });
});

describe("keptSubtasks", () => {
  it("keeps another task's rows only while their save is running", () => {
    const queued: QueuedSubtask[] = [
      { key: 1, parentId: "a", title: "A saved", id: "s1" },
      { key: 2, parentId: "a", title: "A saving", id: null },
      { key: 3, parentId: "b", title: "B saved, row there", id: "s2" },
      { key: 4, parentId: "b", title: "B saved, row not yet", id: "s3" },
    ];
    // Task B is open now and its refreshed rows hold s2.
    expect(keptSubtasks(queued, "b", ["s2"]).map((q) => q.key)).toEqual([2, 4]);
  });
});

describe("notifyNeedsDue", () => {
  const email = ["email" as const];

  it("is true for a timing counted from the due date, so clearing it is refused at the field", () => {
    expect(notifyNeedsDue({ channels: email, timing: "due_day", at: null })).toBe(true);
    expect(notifyNeedsDue({ channels: email, timing: "before_7d", at: null })).toBe(true);
  });

  it("is false without a notification and for timings that stand without a date", () => {
    expect(notifyNeedsDue({ channels: [], timing: null, at: null })).toBe(false);
    expect(notifyNeedsDue({ channels: email, timing: "on_create", at: null })).toBe(false);
    expect(
      notifyNeedsDue({ channels: email, timing: "custom", at: "2026-11-20T08:00:00.000Z" }),
    ).toBe(false);
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

  it("refuses to clear a due date a relative notification is timed from (why the field blocks it)", async () => {
    const t = await insertTask({
      title: "Schilder",
      eventId,
      dueAt: new Date("2026-11-10T09:00:00Z"),
      notifyChannels: ["email"],
      notifyTiming: "before_1d",
    });
    const refused = await updateTask(owner, t.id, { dueOn: null }).then(
      () => null,
      (error: unknown) => (error instanceof TaskInputError ? error.code : error),
    );
    expect(refused).toBe("invalid_notify");
    expect((await getTask(t.id)).dueAt?.toISOString().slice(0, 10)).toBe("2026-11-10");
    expect((await getTaskDetail(owner, t.id, "2026-11-01"))?.notify).toMatchObject({
      timing: "before_1d",
    });
  });

  it("tells a deleted task from one cancelled with its event (UX-060)", async () => {
    const deleted = await insertTask({ title: "Schilder", eventId });
    await deleteTask(owner, deleted.id);
    expect(await getTaskDetail(owner, deleted.id, "2026-11-01")).toMatchObject({
      status: "cancelled",
      eventCancelled: false,
    });
    await restoreTask(owner, deleted.id);
    expect((await getTaskDetail(owner, deleted.id, "2026-11-01"))?.status).toBe("todo");

    const withEvent = await insertTask({ title: "Kasse", eventId, status: "in_progress" });
    await changeEventStatus(owner, eventId, "cancelled", "Unwetter");
    // No "Wiederherstellen" for it: it comes back with the event.
    expect(await getTaskDetail(owner, withEvent.id, "2026-11-01")).toMatchObject({
      status: "cancelled",
      eventCancelled: true,
    });
  });
});
