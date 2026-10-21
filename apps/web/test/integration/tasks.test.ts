import { auditLog, notification, task, taskCheckItem, taskComment } from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import {
  addCheckItem,
  addComment,
  assignTask,
  createTask,
  moveTask,
  setCheckItemDone,
  setEffortFeedback,
  setTaskStatus,
  TaskInputError,
  undoTaskChange,
  updateTask,
} from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import {
  asStaff,
  dueOn,
  getTask,
  insertEvent,
  insertStaff,
  insertTask,
  TODAY,
} from "../helpers/tasks";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let office: Actor;
let eventId: string;
const clock = { today: TODAY, now: new Date("2026-10-21T10:00:00Z") };

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
  // an office user who is also a staff member (Anna)
  office = asStaff(await createActor("staff"), cat.staff.anna);
  const ev = await insertEvent(cat, "Testmarkt", "2026-11-14");
  eventId = ev.id;
});

afterAll(async () => {
  await db.$client.end();
});

const audits = (action: string) =>
  db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(auditLog.at);

const notifications = (reason?: "assigned" | "mentioned") =>
  db
    .select()
    .from(notification)
    .where(reason ? eq(notification.reason, reason) : undefined);

/** Titles of the open cards of a column in the order `moveTask` sees them (via sort values). */
async function order(ids: string[]) {
  const rows = await Promise.all(ids.map((id) => getTask(id)));
  return rows
    .sort(
      (a, b) => a.boardSort - b.boardSort || (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0),
    )
    .map((r) => r.title);
}

describe("moveTask", () => {
  it("sets a manual column when it differs from the due date's column, and audits the move", async () => {
    const t = await insertTask({ title: "Schilder", eventId, dueAt: dueOn("2026-11-10") });
    const result = await moveTask(owner, t.id, "today", { after: null }, { eventId }, clock);
    expect(result.changed).toBe(true);
    const row = await getTask(t.id);
    expect(row.boardColumn).toBe("today");
    const [entry] = await audits("task.move");
    expect(entry).toMatchObject({ actorId: owner.id, entityType: "task", entityId: t.id });
    expect(entry?.diff).toMatchObject({
      column: "today",
      before: { boardColumn: null },
      after: { boardColumn: "today" },
    });
  });

  it("clears the override when the target is the column the due date gives anyway", async () => {
    const t = await insertTask({
      title: "A",
      eventId,
      dueAt: dueOn("2026-10-22"),
      boardColumn: "today",
    });
    await moveTask(owner, t.id, "this_week", { index: 0 }, { eventId }, clock);
    expect((await getTask(t.id)).boardColumn).toBeNull();
  });

  it("puts a card between two neighbours with one write", async () => {
    const a = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-22"), boardSort: 10 });
    const b = await insertTask({ title: "B", eventId, dueAt: dueOn("2026-10-23"), boardSort: 20 });
    const c = await insertTask({ title: "C", eventId, dueAt: dueOn("2026-10-24"), boardSort: 0 });
    await moveTask(owner, c.id, "this_week", { index: 1 }, { eventId }, clock);
    expect((await getTask(c.id)).boardSort).toBe(15);
    expect((await getTask(a.id)).boardSort).toBe(10);
    expect((await getTask(b.id)).boardSort).toBe(20);
    expect(await order([a.id, b.id, c.id])).toEqual(["A", "C", "B"]);
  });

  it("supports 'after <card>' and the top of the column", async () => {
    const a = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-22"), boardSort: 10 });
    const b = await insertTask({ title: "B", eventId, dueAt: dueOn("2026-10-23"), boardSort: 20 });
    const c = await insertTask({ title: "C", eventId, dueAt: dueOn("2026-10-24"), boardSort: 30 });
    await moveTask(owner, c.id, "this_week", { after: a.id }, { eventId }, clock);
    expect(await order([a.id, b.id, c.id])).toEqual(["A", "C", "B"]);
    await moveTask(owner, c.id, "this_week", { after: null }, { eventId }, clock);
    expect(await order([a.id, b.id, c.id])).toEqual(["C", "A", "B"]);
    // a card that vanished: goes to the end
    await moveTask(
      owner,
      c.id,
      "this_week",
      { after: "00000000-0000-4000-8000-000000000000" },
      { eventId },
      clock,
    );
    expect(await order([a.id, b.id, c.id])).toEqual(["A", "B", "C"]);
  });

  it("renumbers the column when the neighbours leave no room", async () => {
    // fresh tasks all have board_sort 0
    const a = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-22") });
    const b = await insertTask({ title: "B", eventId, dueAt: dueOn("2026-10-23") });
    const c = await insertTask({ title: "C", eventId, dueAt: dueOn("2026-10-24") });
    await moveTask(owner, c.id, "this_week", { index: 1 }, { eventId }, clock);
    const sorts = await Promise.all([a, c, b].map(async (t) => (await getTask(t.id)).boardSort));
    expect(sorts[0]).toBeLessThan(sorts[1] as number);
    expect(sorts[1]).toBeLessThan(sorts[2] as number);
  });

  it("completes the task when it lands in Erledigt and reopens it when it leaves", async () => {
    const t = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-21") });
    const staffOffice = office;
    await moveTask(staffOffice, t.id, "done", { index: 0 }, { eventId }, clock);
    let row = await getTask(t.id);
    expect(row).toMatchObject({
      status: "done",
      completedByStaffMemberId: cat.staff.anna.id,
      boardColumn: null,
    });
    expect(row.completedAt?.toISOString()).toBe("2026-10-21T10:00:00.000Z");

    await moveTask(staffOffice, t.id, "today", { index: 0 }, { eventId }, clock);
    row = await getTask(t.id);
    expect(row).toMatchObject({
      status: "todo",
      completedAt: null,
      completedByStaffMemberId: null,
    });
  });

  it("refuses to complete through a move while required evidence is missing", async () => {
    const t = await insertTask({
      title: "A",
      eventId,
      dueAt: dueOn("2026-10-21"),
      requiresNote: true,
    });
    expect(await code(moveTask(owner, t.id, "done", { index: 0 }, { eventId }, clock))).toBe(
      "evidence_missing",
    );
    expect((await getTask(t.id)).status).toBe("todo");
  });

  it("validates input and does nothing when nothing changes", async () => {
    const t = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-21") });
    expect(await code(moveTask(owner, t.id, "nope" as never, { index: 0 }, {}, clock))).toBe(
      "invalid_column",
    );
    expect(await code(moveTask(owner, t.id, "today", { index: -1 }, {}, clock))).toBe(
      "invalid_input",
    );
    expect(await code(moveTask(owner, "not-a-uuid", "today", { index: 0 }, {}, clock))).toBe(
      "not_found",
    );
    // already in Heute by its due date, alone in the column: nothing to change
    const result = await moveTask(owner, t.id, "today", { index: 0 }, { eventId }, clock);
    expect(result.changed).toBe(false);
    expect(result.auditId).toBeNull();
    expect(await audits("task.move")).toHaveLength(0);
  });
});

describe("assignTask", () => {
  it("assigns by hand, remembers that, and notifies the new assignee", async () => {
    const t = await insertTask({ title: "Schilder", eventId, assigneeId: cat.staff.anna.id });
    const result = await assignTask(owner, t.id, cat.staff.ben.id);
    expect(result).toMatchObject({ changed: true, from: cat.staff.anna.id, to: cat.staff.ben.id });
    expect(await getTask(t.id)).toMatchObject({
      assigneeId: cat.staff.ben.id,
      assigneeOverridden: true,
    });

    const [note] = await notifications("assigned");
    expect(note).toMatchObject({
      recipientStaffMemberId: cat.staff.ben.id,
      subjectType: "task",
      subjectId: t.id,
      link: `/veranstaltungen/${eventId}/board?aufgabe=${t.id}`,
    });
    expect(note?.title).toContain("Schilder");
    expect(note?.dedupeKey).toBe(`task:${t.id}:assigned:${result.auditId}`);
    const [entry] = await audits("task.assign");
    expect(entry?.diff).toMatchObject({ fromName: "Anna Test", toName: "Ben Test" });
  });

  it("unassigns (and still marks the assignment as done by hand) without notifying", async () => {
    const t = await insertTask({ title: "A", eventId, assigneeId: cat.staff.anna.id });
    await assignTask(owner, t.id, null);
    expect(await getTask(t.id)).toMatchObject({ assigneeId: null, assigneeOverridden: true });
    expect(await notifications()).toHaveLength(0);
  });

  it("does not notify when you assign the task to yourself, nor when nothing changes", async () => {
    const t = await insertTask({ title: "A", eventId });
    expect((await assignTask(office, t.id, cat.staff.anna.id)).changed).toBe(true);
    expect(await notifications()).toHaveLength(0);
    expect((await assignTask(office, t.id, cat.staff.anna.id)).changed).toBe(false);
    expect(await audits("task.assign")).toHaveLength(1);
  });

  it("rejects unknown or inactive people", async () => {
    const t = await insertTask({ title: "A", eventId });
    expect(await code(assignTask(owner, t.id, "00000000-0000-4000-8000-000000000000"))).toBe(
      "invalid_staff",
    );
    expect(await code(assignTask(owner, t.id, "nope"))).toBe("invalid_staff");
  });
});

describe("setTaskStatus", () => {
  it("waits for an authority with a reason, and clears the reason when work continues", async () => {
    const t = await insertTask({ title: "Antrag", eventId });
    await setTaskStatus(owner, t.id, "waiting_external", { reason: "Ordnungsamt Neuss" }, clock);
    expect(await getTask(t.id)).toMatchObject({
      status: "waiting_external",
      waitingReason: "Ordnungsamt Neuss",
    });
    await setTaskStatus(owner, t.id, "in_progress", {}, clock);
    expect(await getTask(t.id)).toMatchObject({ status: "in_progress", waitingReason: null });
    const [entry] = (await audits("task.status")).slice(-1);
    expect(entry?.diff).toMatchObject({ from: "waiting_external", to: "in_progress" });
  });

  it("skipping needs a reason", async () => {
    const t = await insertTask({ title: "A", eventId });
    expect(await code(setTaskStatus(owner, t.id, "skipped", {}, clock))).toBe("reason_required");
    expect(await code(setTaskStatus(owner, t.id, "skipped", { reason: "   " }, clock))).toBe(
      "reason_required",
    );
    await setTaskStatus(owner, t.id, "skipped", { reason: "Nicht nötig bei Regen" }, clock);
    expect(await getTask(t.id)).toMatchObject({
      status: "skipped",
      skippedReason: "Nicht nötig bei Regen",
    });
  });

  it("marks done with who and when, and reopens", async () => {
    const t = await insertTask({
      title: "A",
      eventId,
      boardColumn: "today",
      dueAt: dueOn("2026-11-30"),
    });
    await setTaskStatus(office, t.id, "done", {}, clock);
    expect(await getTask(t.id)).toMatchObject({
      status: "done",
      completedByStaffMemberId: cat.staff.anna.id,
      boardColumn: null,
    });
    await setTaskStatus(office, t.id, "todo", {}, clock);
    expect(await getTask(t.id)).toMatchObject({
      status: "todo",
      completedAt: null,
      completedByStaffMemberId: null,
    });
  });

  it("an owner without a staff record completes with no 'completed by'", async () => {
    const t = await insertTask({ title: "A", eventId });
    await setTaskStatus(owner, t.id, "done", {}, clock);
    const row = await getTask(t.id);
    expect(row.status).toBe("done");
    expect(row.completedByStaffMemberId).toBeNull();
    expect(row.completedAt).not.toBeNull();
  });

  it("enforces a required note: a note given now (saved as a comment) or an earlier comment", async () => {
    const t = await insertTask({ title: "A", eventId, requiresNote: true });
    expect(await code(setTaskStatus(owner, t.id, "done", {}, clock))).toBe("evidence_missing");
    expect(await code(setTaskStatus(owner, t.id, "done", { note: "  " }, clock))).toBe(
      "evidence_missing",
    );
    await setTaskStatus(owner, t.id, "done", { note: "Schilder stehen, Foto im Chat" }, clock);
    const comments = await db.select().from(taskComment).where(eq(taskComment.taskId, t.id));
    expect(comments.map((c) => c.body)).toEqual(["Schilder stehen, Foto im Chat"]);

    const u = await insertTask({ title: "B", eventId, requiresNote: true });
    await addComment(owner, u.id, "Läuft");
    await setTaskStatus(owner, u.id, "done", {}, clock);
    expect((await getTask(u.id)).status).toBe("done");
  });

  it("reports which evidence is missing, and requires every check item", async () => {
    const t = await insertTask({ title: "A", eventId, requiresNote: true });
    const item = await addCheckItem(owner, t.id, "Schilder zählen");
    await addCheckItem(owner, t.id, "Protokoll");
    try {
      await setTaskStatus(owner, t.id, "done", {}, clock);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TaskInputError);
      expect((error as TaskInputError).detail).toEqual(["note", "check_items"]);
    }
    await setCheckItemDone(owner, t.id, item.id, true, clock);
    const open = await db
      .select()
      .from(taskCheckItem)
      .where(and(eq(taskCheckItem.taskId, t.id), eq(taskCheckItem.done, false)));
    for (const o of open) await setCheckItemDone(owner, t.id, o.id, true, clock);
    expect(await code(setTaskStatus(owner, t.id, "done", {}, clock))).toBe("evidence_missing"); // note
    await setTaskStatus(owner, t.id, "done", { note: "ok" }, clock);
    expect((await getTask(t.id)).status).toBe("done");
  });

  it("does not block on photo or attachment evidence until uploads exist (M5)", async () => {
    const t = await insertTask({
      title: "A",
      eventId,
      requiresPhoto: true,
      requiresAttachment: true,
    });
    await setTaskStatus(owner, t.id, "done", {}, clock);
    expect((await getTask(t.id)).status).toBe("done");
  });

  it("rejects cancelled and unknown statuses, and finished-then-cancelled tasks", async () => {
    const t = await insertTask({ title: "A", eventId });
    expect(await code(setTaskStatus(owner, t.id, "cancelled", {}, clock))).toBe("invalid_status");
    expect(await code(setTaskStatus(owner, t.id, "weird" as never, {}, clock))).toBe(
      "invalid_status",
    );
    const c = await insertTask({ title: "C", eventId, status: "cancelled" });
    expect(await code(setTaskStatus(owner, c.id, "todo", {}, clock))).toBe("invalid_state");
  });
});

describe("updateTask", () => {
  it("edits title, description and estimate, and marks the task customized", async () => {
    const t = await insertTask({ title: "Alt", eventId });
    const result = await updateTask(owner, t.id, {
      title: "  Neu  ",
      description: "Text",
      estimateMinutes: 90,
    });
    expect(result.fields.sort()).toEqual(["description", "estimateMinutes", "title"]);
    expect(await getTask(t.id)).toMatchObject({
      title: "Neu",
      description: "Text",
      estimateMinutes: 90,
      customized: true,
    });
    const [entry] = await audits("task.update");
    expect(entry?.diff).toMatchObject({ before: { title: "Alt" }, after: { title: "Neu" } });
  });

  it("pins the due date by hand and keeps the time of day", async () => {
    const t = await insertTask({ title: "A", eventId, dueAt: new Date("2026-10-27T13:30:00Z") }); // 14:30 CET
    await updateTask(owner, t.id, { dueOn: "2026-10-30" });
    const row = await getTask(t.id);
    expect(row.dueOverridden).toBe(true);
    expect(row.dueAt?.toISOString()).toBe("2026-10-30T13:30:00.000Z");
    await updateTask(owner, t.id, { dueOn: null });
    expect((await getTask(t.id)).dueAt).toBeNull();
  });

  it("validates and ignores no-op edits", async () => {
    const t = await insertTask({ title: "A", eventId, estimateMinutes: 30 });
    expect(await code(updateTask(owner, t.id, { title: "   " }))).toBe("invalid_input");
    expect(await code(updateTask(owner, t.id, { estimateMinutes: -5 }))).toBe("invalid_input");
    expect(await code(updateTask(owner, t.id, { estimateMinutes: 1.5 }))).toBe("invalid_input");
    expect(await code(updateTask(owner, t.id, { dueOn: "2026-02-30" }))).toBe("invalid_input");
    expect((await updateTask(owner, t.id, { estimateMinutes: 30 })).changed).toBe(false);
    expect(await audits("task.update")).toHaveLength(0);
  });
});

describe("effort feedback", () => {
  it("is for finished tasks only", async () => {
    const t = await insertTask({ title: "A", eventId });
    expect(await code(setEffortFeedback(owner, t.id, "longer"))).toBe("invalid_state");
    await setTaskStatus(owner, t.id, "done", {}, clock);
    expect((await setEffortFeedback(owner, t.id, "longer")).changed).toBe(true);
    expect((await getTask(t.id)).effortFeedback).toBe("longer");
    expect(await code(setEffortFeedback(owner, t.id, "huge" as never))).toBe("invalid_input");
  });
});

describe("check items", () => {
  it("adds and ticks items with who and when", async () => {
    const t = await insertTask({ title: "A", eventId });
    const { id } = await addCheckItem(owner, t.id, "Schilder zählen");
    await setCheckItemDone(office, t.id, id, true, clock);
    const [row] = await db.select().from(taskCheckItem).where(eq(taskCheckItem.id, id));
    expect(row).toMatchObject({ done: true, doneByStaffMemberId: cat.staff.anna.id });
    expect(row?.doneAt?.toISOString()).toBe("2026-10-21T10:00:00.000Z");
    expect((await setCheckItemDone(office, t.id, id, true, clock)).changed).toBe(false);
    await setCheckItemDone(office, t.id, id, false, clock);
    const [again] = await db.select().from(taskCheckItem).where(eq(taskCheckItem.id, id));
    expect(again).toMatchObject({ done: false, doneAt: null });
    expect(await audits("task.check")).toHaveLength(3);
  });
});

describe("comments and mentions", () => {
  it("notifies mentioned staff (not the author) and stores who was mentioned", async () => {
    const t = await insertTask({ title: "Schilder", eventId });
    const result = await addComment(
      office,
      t.id,
      "@Ben Test kannst du das übernehmen? cc @Anna Test",
    );
    expect(result.mentioned.sort()).toEqual([cat.staff.anna.id, cat.staff.ben.id].sort());
    const [comment] = await db.select().from(taskComment).where(eq(taskComment.id, result.id));
    expect(comment).toMatchObject({
      authorStaffMemberId: cat.staff.anna.id,
      authorUserId: office.id,
    });
    expect(comment?.mentionedStaffMemberIds.sort()).toEqual(
      [cat.staff.anna.id, cat.staff.ben.id].sort(),
    );

    const notes = await notifications("mentioned");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      recipientStaffMemberId: cat.staff.ben.id,
      dedupeKey: `task:${t.id}:mention:${result.id}`,
    });
    expect(notes[0]?.title).toContain("Anna Test");
  });

  it("rejects empty comments and comments on tasks you cannot see", async () => {
    const t = await insertTask({ title: "A", eventId });
    expect(await code(addComment(owner, t.id, "   "))).toBe("invalid_input");
    expect(await code(addComment(owner, "00000000-0000-4000-8000-000000000000", "hi"))).toBe(
      "not_found",
    );
  });
});

describe("createTask", () => {
  it("creates a manual task on an event, with a due date, estimate and assignee", async () => {
    const { id } = await createTask(owner, {
      title: "  Banner bestellen ",
      eventId,
      dueOn: "2026-11-02",
      estimateMinutes: 45,
      category: "logistics",
      assigneeId: cat.staff.ben.id,
    });
    const row = await getTask(id);
    expect(row).toMatchObject({
      title: "Banner bestellen",
      source: "manual",
      eventId,
      estimateMinutes: 45,
      category: "logistics",
      assigneeId: cat.staff.ben.id,
      assigneeOverridden: true,
      dueOverridden: true,
    });
    expect(row.dueAt?.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(await audits("task.create")).toHaveLength(1);
    expect(await notifications("assigned")).toHaveLength(1);
  });

  it("creates a task without an event", async () => {
    const { id } = await createTask(owner, { title: "Versicherung prüfen" });
    expect(await getTask(id)).toMatchObject({
      eventId: null,
      source: "manual",
      assigneeId: null,
      dueAt: null,
    });
  });

  it("validates input and the event", async () => {
    expect(await code(createTask(owner, { title: "" }))).toBe("invalid_input");
    expect(await code(createTask(owner, { title: "A", dueOn: "morgen" }))).toBe("invalid_input");
    expect(await code(createTask(owner, { title: "A", category: "x" as never }))).toBe(
      "invalid_input",
    );
    expect(
      await code(
        createTask(owner, { title: "A", eventId: "00000000-0000-4000-8000-000000000000" }),
      ),
    ).toBe("invalid_event");
    expect(
      await code(
        createTask(owner, { title: "A", assigneeId: "00000000-0000-4000-8000-000000000000" }),
      ),
    ).toBe("invalid_staff");
  });
});

describe("undoTaskChange", () => {
  it("undoes a move while nobody changed the task since", async () => {
    const t = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-11-10") });
    const moved = await moveTask(owner, t.id, "today", { index: 0 }, { eventId }, clock);
    await undoTaskChange(owner, moved.auditId as string);
    expect(await getTask(t.id)).toMatchObject({ boardColumn: null, boardSort: 0 });
    const [undo] = await audits("task.undo");
    expect(undo?.diff).toMatchObject({ of: moved.auditId, ofAction: "task.move" });
  });

  it("undoes marking done, including who/when", async () => {
    const t = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-10-21") });
    const done = await setTaskStatus(office, t.id, "done", {}, clock);
    await undoTaskChange(office, done.auditId as string);
    expect(await getTask(t.id)).toMatchObject({
      status: "todo",
      completedAt: null,
      completedByStaffMemberId: null,
    });
  });

  it("undoes an assignment and takes back the unread notification", async () => {
    const t = await insertTask({ title: "A", eventId, assigneeId: cat.staff.anna.id });
    const assigned = await assignTask(owner, t.id, cat.staff.ben.id);
    expect(await notifications("assigned")).toHaveLength(1);
    await undoTaskChange(owner, assigned.auditId as string);
    expect(await getTask(t.id)).toMatchObject({
      assigneeId: cat.staff.anna.id,
      assigneeOverridden: false,
    });
    expect(await notifications("assigned")).toHaveLength(0);
  });

  it("refuses with 'conflict' once the task changed since (like the duty undo)", async () => {
    const t = await insertTask({ title: "A", eventId, assigneeId: cat.staff.anna.id });
    const first = await assignTask(owner, t.id, cat.staff.ben.id);
    await assignTask(owner, t.id, null);
    expect(await code(undoTaskChange(owner, first.auditId as string))).toBe("conflict");
    expect((await getTask(t.id)).assigneeId).toBeNull();
  });

  it("cannot be repeated, and only works on your own undoable changes", async () => {
    const t = await insertTask({ title: "A", eventId, assigneeId: cat.staff.anna.id });
    const assigned = await assignTask(owner, t.id, cat.staff.ben.id);
    const other = await createActor("manager");
    expect(await code(undoTaskChange(other, assigned.auditId as string))).toBe("not_undoable");
    await undoTaskChange(owner, assigned.auditId as string);
    expect(await code(undoTaskChange(owner, assigned.auditId as string))).toBe("conflict");
    expect(await code(undoTaskChange(owner, "nope"))).toBe("not_undoable");
    const [edit] = await (async () => {
      await updateTask(owner, t.id, { title: "B" });
      return audits("task.update");
    })();
    expect(await code(undoTaskChange(owner, edit?.id as string))).toBe("not_undoable");
  });
});

describe("permissions and field scoping", () => {
  let field: Actor;
  let otherEvent: string;
  let mine: string;
  let theirs: string;

  beforeEach(async () => {
    const fieldStaff = await insertStaff("Frieda Platz", {
      userId: "user-field-frieda",
      role: "field",
    });
    const base = await createActor("field");
    field = asStaff({ ...base, id: "user-field-frieda" }, fieldStaff);
    await insertEvent(cat, "Mein Markt", "2026-11-21", [
      { roleId: cat.roles.setup.id, staffId: fieldStaff.id },
    ]);
    const ev = await insertEvent(cat, "Fremder Markt", "2026-11-28");
    otherEvent = ev.id;
    const [mineEvent] = await db.query.event.findMany({
      where: (e, { eq }) => eq(e.name, "Mein Markt"),
    });
    mine = (
      await insertTask({ title: "Meine", eventId: mineEvent?.id, dueAt: dueOn("2026-11-20") })
    ).id;
    theirs = (
      await insertTask({ title: "Fremde", eventId: otherEvent, dueAt: dueOn("2026-11-20") })
    ).id;
  });

  it("lets a field user work on tasks of their events only", async () => {
    await setTaskStatus(field, mine, "in_progress", {}, clock);
    expect((await getTask(mine)).status).toBe("in_progress");
    expect(await code(setTaskStatus(field, theirs, "in_progress", {}, clock))).toBe("not_found");
    expect(await code(moveTask(field, theirs, "today", { index: 0 }, {}, clock))).toBe("not_found");
    expect(await code(addComment(field, theirs, "hallo"))).toBe("not_found");
    expect((await getTask(theirs)).status).toBe("todo");
  });

  it("lets a field user create tasks on their events, not on others, and see their own event-less tasks", async () => {
    const [mineEvent] = await db.query.event.findMany({
      where: (e, { eq }) => eq(e.name, "Mein Markt"),
    });
    const created = await createTask(field, { title: "Eigene", eventId: mineEvent?.id });
    expect((await getTask(created.id)).eventId).toBe(mineEvent?.id);
    expect(await code(createTask(field, { title: "Fremd", eventId: otherEvent }))).toBe(
      "invalid_event",
    );
    // event-less task assigned to the field user → visible; unassigned → not
    const assigned = await insertTask({ title: "Büro", assigneeId: field.staffMemberId });
    const unassigned = await insertTask({ title: "Büro 2" });
    await setTaskStatus(field, assigned.id, "in_progress", {}, clock);
    expect(await code(setTaskStatus(field, unassigned.id, "in_progress", {}, clock))).toBe(
      "not_found",
    );
  });

  it("forbids assigning without the assign permission, but allows everything else a field user needs", async () => {
    await expect(assignTask(field, mine, cat.staff.ben.id)).rejects.toSatisfy(isForbidden);
    await expect(createTask(field, { title: "X", assigneeId: cat.staff.ben.id })).rejects.toSatisfy(
      isForbidden,
    );
  });

  it("gives office users every task", async () => {
    await assignTask(office, theirs, cat.staff.ben.id);
    expect((await getTask(theirs)).assigneeId).toBe(cat.staff.ben.id);
  });

  it("does not notify a mentioned field user about events they do not work at", async () => {
    // Frieda works at "Mein Markt" only; a comment on a task of "Fremder Markt" mentions her
    await addComment(owner, theirs, "@Frieda Platz bitte schauen");
    expect(await notifications("mentioned")).toHaveLength(0);
    await addComment(owner, mine, "@Frieda Platz bitte schauen");
    expect(await notifications("mentioned")).toHaveLength(1);
  });
});

describe("audit trail", () => {
  it("never leaves a mutation without an audit entry", async () => {
    const t = await insertTask({ title: "A", eventId, dueAt: dueOn("2026-11-10") });
    await moveTask(owner, t.id, "today", { index: 0 }, { eventId }, clock);
    await assignTask(owner, t.id, cat.staff.ben.id);
    await setTaskStatus(owner, t.id, "in_progress", {}, clock);
    await updateTask(owner, t.id, { title: "B" });
    await addComment(owner, t.id, "hi");
    const all = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "task"), eq(auditLog.entityId, t.id)));
    expect(all.map((a) => a.action).sort()).toEqual([
      "task.assign",
      "task.comment",
      "task.move",
      "task.status",
      "task.update",
    ]);
    expect(all.every((a) => a.actorId === owner.id)).toBe(true);
    expect(await db.select().from(task).where(eq(task.id, t.id))).toHaveLength(1);
  });
});
