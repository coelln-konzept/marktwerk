/**
 * Subtasks (ADR 0021, UT2-14): the service rules (one level, done gate, delete/restore with the parent, the
 * `task.parent` path and its undo), the lists that work on top-level tasks without counting a subtask twice,
 * and the jobs (an overdue subtask counts once, through its parent; a subtask reaches its own assignee).
 */
import {
  auditLog,
  notification,
  outboundMessage,
  settings,
  staffMember,
  task,
} from "@marktwerk/db/schema";
import { dailyDigest, deadlineSweep, taskRollover } from "@marktwerk/jobs";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { getEventOverview } from "@/server/queries/event-overview";
import { listCompanyNotifications } from "@/server/queries/notifications";
import {
  calendarItems,
  dueItems,
  eventTaskSummary,
  getPeopleRail,
  getTaskDetail,
  listBoardTasks,
  openTaskCounts,
} from "@/server/queries/tasks";
import { createEventsFromPreset } from "@/server/services/events";
import {
  assignTask,
  createTask,
  deleteTask,
  restoreTask,
  setTaskParent,
  setTaskStatus,
  skipPastEventTasks,
  TaskInputError,
  undoTaskChange,
  undoTaskChanges,
} from "@/server/services/tasks";
import {
  applyTemplateVersion,
  previewTemplateApplication,
} from "@/server/services/template-propagation";
import {
  addTemplateItem,
  createDraft,
  deleteTemplateItem,
  publishDraft,
} from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, dueOn, getTask, insertEvent, insertTask, TODAY } from "../helpers/tasks";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let anna: Actor;
let ben: Actor;
let eventId: string;
let otherEventId: string;
const clock = { today: TODAY, now: new Date("2026-10-21T10:00:00Z") };

const problem = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TaskInputError) return [error.code, ...error.detail].join(":");
    throw error;
  }
  return "no error";
};

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  anna = asStaff(await createActor("staff"), cat.staff.anna);
  ben = asStaff(await createActor("manager"), cat.staff.ben);
  eventId = (await insertEvent(cat, "Testmarkt", "2026-11-14")).id;
  otherEventId = (await insertEvent(cat, "Anderer Markt", "2026-11-21")).id;
});

afterAll(async () => {
  await db.$client.end();
});

const audits = (action: string, entityId?: string) =>
  db
    .select()
    .from(auditLog)
    .where(
      and(eq(auditLog.action, action), entityId ? eq(auditLog.entityId, entityId) : undefined),
    );

describe("subtask services", () => {
  it("creates a subtask under a task: same event, checklist, phase and category, audited", async () => {
    const parent = await insertTask({
      title: "Genehmigung",
      eventId,
      phase: "pre",
      category: "permits",
    });
    const sub = await createTask(owner, { title: "Formular", parentId: parent.id });
    expect(await getTask(sub.id)).toMatchObject({
      parentTaskId: parent.id,
      eventId,
      phase: "pre",
      category: "permits",
      source: "manual",
    });
    const [entry] = await audits("task.create", sub.id);
    expect(entry?.diff).toMatchObject({ parentTaskId: parent.id, parentTitle: "Genehmigung" });

    expect(await problem(createTask(owner, { title: "x", parentId: sub.id }))).toBe(
      "invalid_parent:parent_is_subtask",
    );
    expect(
      await problem(createTask(owner, { title: "x", parentId: parent.id, eventId: otherEventId })),
    ).toBe("invalid_parent:other_event");
    expect(
      await problem(
        createTask(owner, { title: "x", parentId: "00000000-0000-4000-8000-000000000000" }),
      ),
    ).toBe("invalid_parent:not_found");
  });

  it("nests and lifts out through setTaskParent, one level, undoable", async () => {
    const a = await insertTask({ title: "A", eventId });
    const b = await insertTask({ title: "B", eventId });
    const c = await insertTask({ title: "C", eventId });
    const nested = await setTaskParent(owner, b.id, a.id);
    expect(nested).toMatchObject({ changed: true, parentTitle: "A" });
    expect((await getTask(b.id)).parentTaskId).toBe(a.id);
    const [entry] = await audits("task.parent", b.id);
    expect(entry?.diff).toMatchObject({
      before: { parentTaskId: null },
      after: { parentTaskId: a.id },
      toTitle: "A",
    });
    expect((await setTaskParent(owner, b.id, a.id)).changed).toBe(false);

    expect(await problem(setTaskParent(owner, a.id, a.id))).toBe("invalid_parent:self");
    expect(await problem(setTaskParent(owner, c.id, b.id))).toBe(
      "invalid_parent:parent_is_subtask",
    );
    expect(await problem(setTaskParent(owner, a.id, c.id))).toBe("invalid_parent:has_subtasks");
    const elsewhere = await insertTask({ title: "Woanders", eventId: otherEventId });
    expect(await problem(setTaskParent(owner, c.id, elsewhere.id))).toBe(
      "invalid_parent:other_event",
    );
    const finished = await insertTask({
      title: "Fertig",
      eventId,
      status: "done",
      completedAt: new Date(),
    });
    expect(await problem(setTaskParent(owner, c.id, finished.id))).toBe(
      "invalid_parent:parent_closed",
    );

    // undo puts it back on top; lifting out works the same way
    await undoTaskChange(owner, nested.auditId as string);
    expect((await getTask(b.id)).parentTaskId).toBeNull();
    await setTaskParent(owner, b.id, a.id);
    const lifted = await setTaskParent(owner, b.id, null);
    expect(lifted.changed).toBe(true);
    expect((await getTask(b.id)).parentTaskId).toBeNull();
    // undo of the lift needs the nesting to still be allowed: A meanwhile became a subtask of C
    await setTaskParent(owner, a.id, c.id);
    expect(await problem(undoTaskChange(owner, lifted.auditId as string))).toBe("conflict");
  });

  it("keeps the parent open while a subtask is, and names it once the last one is finished", async () => {
    const parent = await insertTask({ title: "Plakate", eventId });
    const one = await createTask(owner, { title: "drucken", parentId: parent.id });
    const two = await createTask(owner, { title: "aufhängen", parentId: parent.id });
    expect(await problem(setTaskStatus(owner, parent.id, "done", {}, clock))).toBe(
      "evidence_missing:subtasks",
    );
    // the refusal says how many are open ("2 offene Unteraufgaben")
    const refused = await setTaskStatus(owner, parent.id, "done", {}, clock).catch((e) => e);
    expect(refused).toBeInstanceOf(TaskInputError);
    expect((refused as TaskInputError).count).toBe(2);
    expect((await setTaskStatus(owner, one.id, "done", {}, clock)).parentReady).toBeNull();
    const last = await setTaskStatus(owner, two.id, "done", {}, clock);
    expect(last.parentReady).toEqual({ id: parent.id, title: "Plakate" });
    await setTaskStatus(owner, parent.id, "done", {}, clock);

    // a finished parent has no open subtask: reopening one is refused, undo of its "done" conflicts
    expect(await problem(setTaskStatus(owner, two.id, "todo", {}, clock))).toBe(
      "invalid_parent:parent_closed",
    );
    expect(await problem(undoTaskChange(owner, last.auditId as string))).toBe("conflict");
    // reopening the parent first makes it possible again
    await setTaskStatus(owner, parent.id, "todo", {}, clock);
    await undoTaskChange(owner, last.auditId as string);
    expect((await getTask(two.id)).status).toBe("todo");
  });

  it("deletes the open subtasks with their parent; undo and restore bring them back", async () => {
    const parent = await insertTask({ title: "Aufbau", eventId });
    const open = await createTask(owner, { title: "Tische", parentId: parent.id });
    const done = await createTask(owner, { title: "Strom", parentId: parent.id });
    await setTaskStatus(owner, done.id, "done", {}, clock);

    const deleted = await deleteTask(owner, parent.id);
    expect((await getTask(open.id)).status).toBe("cancelled");
    expect((await getTask(done.id)).status).toBe("done");
    const [entry] = await audits("task.delete", parent.id);
    expect(entry?.diff).toMatchObject({ subtasks: [{ id: open.id, from: "todo" }] });
    // a subtask of a deleted parent does not come back on its own
    expect(await problem(restoreTask(owner, open.id))).toBe("invalid_parent:parent_cancelled");

    await undoTaskChange(owner, deleted.auditId as string);
    expect((await getTask(parent.id)).status).toBe("todo");
    expect((await getTask(open.id)).status).toBe("todo");

    await deleteTask(owner, parent.id);
    const restored = await restoreTask(owner, parent.id);
    expect((await getTask(open.id)).status).toBe("todo");
    // undo of the restore deletes both again
    await undoTaskChange(owner, restored.auditId as string);
    expect((await getTask(parent.id)).status).toBe("cancelled");
    expect((await getTask(open.id)).status).toBe("cancelled");
  });

  it("cleanup of a past market skips the subtasks with their parent; undo reopens all", async () => {
    const past = (await insertEvent(cat, "Alter Markt", "2026-10-01")).id;
    const parent = await insertTask({
      title: "Abrechnung",
      eventId: past,
      dueAt: dueOn("2026-10-05"),
    });
    const sub = await createTask(owner, { title: "Belege", parentId: parent.id });
    const result = await skipPastEventTasks(owner, [past], clock);
    // The count is of top-level tasks (what the cleanup view lists); each task has its own entry.
    expect(result.skipped).toBe(1);
    expect(result.auditIds).toHaveLength(2);
    expect((await getTask(sub.id)).status).toBe("skipped");
    await undoTaskChanges(owner, result.auditIds);
    expect((await getTask(parent.id)).status).toBe("todo");
    expect((await getTask(sub.id)).status).toBe("todo");
  });

  it("sends the assignment notification to the subtask's assignee", async () => {
    const parent = await insertTask({ title: "Kasse", eventId, assigneeId: cat.staff.anna.id });
    const sub = await createTask(owner, {
      title: "Wechselgeld",
      parentId: parent.id,
      assigneeId: cat.staff.ben.id,
    });
    const other = await createTask(owner, { title: "Quittungen", parentId: parent.id });
    await assignTask(owner, other.id, cat.staff.anna.id);
    const rows = await db
      .select({ to: notification.recipientStaffMemberId, subject: notification.subjectId })
      .from(notification)
      .where(eq(notification.reason, "assigned"));
    expect(rows).toEqual(
      expect.arrayContaining([
        { to: cat.staff.ben.id, subject: sub.id },
        { to: cat.staff.anna.id, subject: other.id },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("shows parent and subtasks in the detail", async () => {
    const parent = await insertTask({ title: "Kasse", eventId });
    const sub = await createTask(owner, {
      title: "Wechselgeld",
      parentId: parent.id,
      dueOn: "2026-10-19",
      assigneeId: cat.staff.ben.id,
    });
    const detail = await getTaskDetail(owner, parent.id, TODAY);
    expect(detail?.subtasks).toEqual([
      {
        id: sub.id,
        title: "Wechselgeld",
        status: "todo",
        dueOn: "2026-10-19",
        assigneeId: cat.staff.ben.id,
        assigneeName: "Ben Test",
        overdue: true,
        // a due date given at creation is set by hand; the drawer's undo of a due edit restores these flags
        dueOverridden: true,
        customized: false,
      },
    ]);
  });
});

describe("board query with subtasks (Checkliste, D2-12)", () => {
  /** Two parents and a plain task on the event; one subtask on the other event. */
  async function board() {
    const a = await insertTask({ title: "Aufbau", eventId, dueAt: dueOn("2026-11-10") });
    const b = await insertTask({ title: "Werbung", eventId, dueAt: dueOn("2026-11-05") });
    const c = await insertTask({ title: "Schilder", eventId, dueAt: dueOn("2026-11-12") });
    const a1 = await insertTask({
      title: "Zelte",
      eventId,
      parentTaskId: a.id,
      dueAt: dueOn("2026-11-08"),
    });
    const a2 = await insertTask({
      title: "Strom",
      eventId,
      parentTaskId: a.id,
      dueAt: dueOn("2026-10-19"),
      assigneeId: cat.staff.ben.id,
    });
    const a3 = await insertTask({ title: "Tische", eventId, parentTaskId: a.id });
    const aDone = await insertTask({
      title: "Plan",
      eventId,
      parentTaskId: a.id,
      dueAt: dueOn("2026-11-09"),
      status: "done",
      completedAt: new Date("2026-10-20T10:00:00Z"),
    });
    await insertTask({ title: "gelöscht", eventId, parentTaskId: a.id, status: "cancelled" });
    const b1 = await insertTask({ title: "Plakate", eventId, parentTaskId: b.id });
    const other = await insertTask({ title: "Fremd", eventId: otherEventId });
    await insertTask({ title: "Fremd-Sub", eventId: otherEventId, parentTaskId: other.id });
    return { a, b, c, a1, a2, a3, aDone, b1 };
  }

  it("event board: subtasks under their parents, in their order, never counted on their own", async () => {
    const { a, b, c, a1, a2, a3, aDone, b1 } = await board();
    const { tasks, subtasks } = await listBoardTasks(owner, { eventId }, TODAY);

    // Top-level only in `tasks`; no task in both lists.
    expect(tasks.map((t) => t.id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(tasks.every((t) => t.parentId === null)).toBe(true);
    const top = new Set(tasks.map((t) => t.id));
    expect(subtasks.some((s) => top.has(s.id))).toBe(false);

    // Under each parent in board order, then due date (undated last); deleted ones left out.
    const under = (id: string) => subtasks.filter((s) => s.parentId === id).map((s) => s.id);
    expect(under(a.id)).toEqual([a2.id, a1.id, aDone.id, a3.id]);
    expect(under(b.id)).toEqual([b1.id]);
    expect(subtasks).toHaveLength(5);

    // The parent's progress matches the subtasks shown under it.
    expect(tasks.find((t) => t.id === a.id)).toMatchObject({
      subtasksTotal: 4,
      subtasksDone: 1,
      subtasksOverdue: 1,
    });
    expect(subtasks.find((s) => s.id === a2.id)).toMatchObject({
      assigneeName: "Ben Test",
      dueOn: "2026-10-19",
      column: "today",
      subtasksTotal: 0,
    });
    expect(subtasks.find((s) => s.id === aDone.id)).toMatchObject({
      status: "done",
      completedOn: "2026-10-20",
    });
  });

  it("across events: parents with their progress only, no subtasks", async () => {
    const { a, a1 } = await board();
    const { tasks, subtasks } = await listBoardTasks(owner, {}, TODAY);
    expect(subtasks).toEqual([]);
    expect(tasks.some((t) => t.id === a1.id || t.parentId !== null)).toBe(false);
    expect(tasks.find((t) => t.id === a.id)).toMatchObject({ subtasksTotal: 4, subtasksDone: 1 });
  });

  it("nesting and its undo move the task between the lists", async () => {
    const { b, c, b1 } = await board();
    const nested = await setTaskParent(owner, c.id, b.id);
    let data = await listBoardTasks(owner, { eventId }, TODAY);
    expect(data.tasks.map((t) => t.id)).not.toContain(c.id);
    // Its place under the parent follows the same order (dated before undated).
    expect(data.subtasks.filter((s) => s.parentId === b.id).map((s) => s.id)).toEqual([
      c.id,
      b1.id,
    ]);
    expect(data.tasks.find((t) => t.id === b.id)?.subtasksTotal).toBe(2);

    await undoTaskChange(owner, nested.auditId as string);
    data = await listBoardTasks(owner, { eventId }, TODAY);
    expect(data.tasks.map((t) => t.id)).toContain(c.id);
    expect(data.subtasks.map((s) => s.id)).not.toContain(c.id);
  });
});

describe("lists count a subtask once, through its parent", () => {
  /** Parent (Anna, due later), an overdue subtask of Ben's, an overdue one of Anna's, an unassigned one. */
  async function tree() {
    const parent = await insertTask({
      title: "Genehmigung",
      eventId,
      assigneeId: cat.staff.anna.id,
      dueAt: dueOn("2026-11-10"),
    });
    const bens = await insertTask({
      title: "Gebühr zahlen",
      eventId,
      parentTaskId: parent.id,
      assigneeId: cat.staff.ben.id,
      dueAt: dueOn("2026-10-19"),
    });
    const annas = await insertTask({
      title: "Formular",
      eventId,
      parentTaskId: parent.id,
      assigneeId: cat.staff.anna.id,
      dueAt: dueOn("2026-10-20"),
    });
    const nobodys = await insertTask({
      title: "Kopie",
      eventId,
      parentTaskId: parent.id,
      dueAt: dueOn("2026-10-23"),
    });
    return { parent, bens, annas, nobodys };
  }

  it("board, KPIs, event summary and overview carry the parent with its progress", async () => {
    const { parent } = await tree();
    const { tasks } = await listBoardTasks(owner, { eventId }, TODAY);
    expect(tasks.map((t) => t.id)).toEqual([parent.id]);
    expect(tasks[0]).toMatchObject({ subtasksTotal: 3, subtasksDone: 0, subtasksOverdue: 2 });

    expect(await openTaskCounts(owner, TODAY)).toEqual({ open: 1, overdue: 1 });
    expect(await eventTaskSummary(owner, eventId, TODAY)).toMatchObject({ open: 1, overdue: 1 });

    const overview = await getEventOverview(
      owner,
      { id: eventId, startsOn: "2026-11-14", endsOn: "2026-11-14" },
      TODAY,
    );
    expect(overview.tasks?.progress).toMatchObject({ total: 1 });
    expect(overview.tasks?.missing.map((m) => [m.id, m.reason])).toEqual([[parent.id, "overdue"]]);
    // A single-table query: the subtask counts still refer to the parent row (R29, they read 0 before).
    expect(overview.tasks?.missing[0]).toMatchObject({
      subtasksTotal: 3,
      subtasksDone: 0,
      subtasksOverdue: 2,
      openSubtasks: 3,
    });
  });

  it("Übersicht and Kalender: the parent for everyone's lists, own subtasks on the own list", async () => {
    const { parent, bens } = await tree();
    // Owner: one item, overdue through its subtasks, with the progress.
    const items = await dueItems(owner, TODAY);
    expect(items.map((i) => [i.id, i.urgency])).toEqual([[parent.id, "overdue"]]);
    expect(items[0]?.dueOn).toBe("2026-11-10");
    expect(items[0]?.subtasks).toEqual({ done: 0, total: 3, open: 3, overdue: 2 });
    const calendar = await calendarItems(owner, "2026-10-01", "2026-11-30", TODAY);
    expect(calendar.map((c) => [c.id, c.tone])).toEqual([[parent.id, "critical"]]);

    // Anna owns the parent: it stands for her own subtask too.
    expect((await dueItems(anna, TODAY)).map((i) => i.id)).toEqual([parent.id]);
    expect(await openTaskCounts(anna, TODAY)).toEqual({ open: 1, overdue: 1 });
    // Ben's own list (also "Nur meine" in the Kalender): his subtask of Anna's task.
    const mine = await calendarItems(ben, "2026-10-01", "2026-11-30", TODAY, true);
    expect(mine.map((c) => c.id)).toEqual([bens.id]);

    // Once Ben has the parent as well, the parent stands for his subtask.
    await db.update(task).set({ assigneeId: cat.staff.ben.id }).where(eq(task.id, parent.id));
    expect(
      (await calendarItems(ben, "2026-10-01", "2026-11-30", TODAY, true)).map((c) => c.id),
    ).toEqual([parent.id]);
  });

  it("the people rail counts each person's own items once", async () => {
    await tree();
    const rail = await getPeopleRail(owner, { eventId }, TODAY);
    const open = Object.fromEntries(rail.people.map((p) => [p.name, p.openTasks]));
    // Anna: the parent (her own subtask goes through it); Ben: his subtask of Anna's task.
    expect(open).toEqual({ "Anna Test": 1, "Ben Test": 1 });
    expect(rail.unassigned.tasks).toBe(0);
  });
});

describe("quick Erledigt knows the open subtasks (R29)", () => {
  /**
   * An overdue parent with four subtasks (todo, in progress, done, deleted: two open) and an overdue plain task.
   * Lists outside the drawer carry the open count, so their "Erledigt" opens the drawer instead of asking.
   */
  async function tree() {
    const parent = await insertTask({ title: "Aufbau", eventId, dueAt: dueOn("2026-10-19") });
    const todo = await insertTask({ title: "Zelte", eventId, parentTaskId: parent.id });
    const working = await insertTask({
      title: "Strom",
      eventId,
      parentTaskId: parent.id,
      status: "in_progress",
    });
    await insertTask({
      title: "Plan",
      eventId,
      parentTaskId: parent.id,
      status: "done",
      completedAt: new Date("2026-10-20T10:00:00Z"),
    });
    await insertTask({ title: "gelöscht", eventId, parentTaskId: parent.id, status: "cancelled" });
    const plain = await insertTask({ title: "Schilder", eventId, dueAt: dueOn("2026-10-20") });
    return { parent, todo, working, plain };
  }

  /** The open count per task id in each list: board, Übersicht, event Überblick, notification center. */
  async function counts() {
    const board = await listBoardTasks(owner, { eventId }, TODAY);
    const due = await dueItems(owner, TODAY);
    const overview = await getEventOverview(
      owner,
      { id: eventId, startsOn: "2026-11-14", endsOn: "2026-11-14" },
      TODAY,
    );
    const center = await listCompanyNotifications(
      owner,
      { status: "open", sort: "urgency" },
      clock.now,
    );
    return {
      board: Object.fromEntries(board.tasks.map((t) => [t.title, t.openSubtasks])),
      due: Object.fromEntries(due.map((i) => [i.title, i.subtasks?.open ?? 0])),
      missing: Object.fromEntries(
        (overview.tasks?.missing ?? []).map((m) => [m.title, m.openSubtasks]),
      ),
      center: Object.fromEntries(center.rows.map((r) => [r.title, r.openSubtasks])),
    };
  }

  it("board, Übersicht, Überblick and notification center count the open subtasks like the done gate", async () => {
    const { parent, todo, working } = await tree();
    await deadlineSweep(db, clock.now);
    const expected = { Aufbau: 2, Schilder: 0 };
    expect(await counts()).toEqual({
      board: expected,
      due: expected,
      missing: expected,
      center: expected,
    });

    // The done gate refuses the parent with the same number.
    const refused = await setTaskStatus(owner, parent.id, "done", {}, clock).catch((e) => e);
    expect((refused as TaskInputError).count).toBe(2);

    // Once they are finished the parent counts none and "Erledigt" works as usual.
    await setTaskStatus(owner, todo.id, "done", {}, clock);
    await setTaskStatus(owner, working.id, "skipped", { reason: "nicht nötig" }, clock);
    const after = await counts();
    expect(after.board.Aufbau).toBe(0);
    expect(after.due.Aufbau).toBe(0);
    expect(after.missing.Aufbau).toBe(0);
    expect(after.center.Aufbau).toBe(0);
    await setTaskStatus(owner, parent.id, "done", {}, clock);
  });
});

describe("jobs: an overdue subtask counts once, through its parent", () => {
  const NOW = new Date("2026-10-21T10:00:00Z");

  async function tree() {
    await db
      .insert(settings)
      .values({ id: 1, companyName: "Test GmbH", emailEnabled: true, dailyDigestEnabled: true })
      .onConflictDoUpdate({
        target: settings.id,
        set: { emailEnabled: true, dailyDigestEnabled: true },
      });
    await db
      .update(staffMember)
      .set({ userId: "user-staff", email: "anna@test.local" })
      .where(eq(staffMember.id, cat.staff.anna.id));
    await db
      .update(staffMember)
      .set({ userId: "user-manager", email: "ben@test.local" })
      .where(eq(staffMember.id, cat.staff.ben.id));
    const parent = await insertTask({
      title: "Genehmigung",
      eventId,
      assigneeId: cat.staff.anna.id,
      dueAt: dueOn("2026-11-10"),
    });
    const bens = await insertTask({
      title: "Gebühr zahlen",
      eventId,
      parentTaskId: parent.id,
      assigneeId: cat.staff.ben.id,
      dueAt: dueOn("2026-10-19"),
    });
    const annas = await insertTask({
      title: "Formular",
      eventId,
      parentTaskId: parent.id,
      assigneeId: cat.staff.anna.id,
      dueAt: dueOn("2026-10-20"),
    });
    return { parent, bens, annas };
  }

  const personal = () =>
    db
      .select({
        to: notification.recipientStaffMemberId,
        subject: notification.subjectId,
        reason: notification.reason,
        body: notification.body,
      })
      .from(notification)
      .where(isNotNull(notification.recipientStaffMemberId));

  it("deadline sweep: the parent's assignee once, a subtask of somebody else's task its assignee", async () => {
    const { parent, bens, annas } = await tree();
    await deadlineSweep(db, NOW);
    const sent = (await personal()).filter((n) => n.reason === "overdue");
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining([
        {
          to: cat.staff.anna.id,
          subject: parent.id,
          reason: "overdue",
          body: "Unteraufgabe fällig am 19.10.2026",
        },
        expect.objectContaining({ to: cat.staff.ben.id, subject: bens.id }),
      ]),
    );
    expect(sent.some((n) => n.subject === annas.id)).toBe(false);
    // Company-wide: the parent only.
    const company = await db
      .select({ subject: notification.subjectId, reason: notification.reason })
      .from(notification)
      .where(isNull(notification.recipientStaffMemberId));
    expect(company).toEqual([{ subject: parent.id, reason: "overdue" }]);
    // Running again adds nothing.
    await deadlineSweep(db, NOW);
    expect((await personal()).filter((n) => n.reason === "overdue")).toHaveLength(2);
    expect(
      await db.select().from(notification).where(isNull(notification.recipientStaffMemberId)),
    ).toHaveLength(1);
  });

  it("rollover: subtasks roll over, only somebody's own item notifies, nothing escalates", async () => {
    const { bens, annas } = await tree();
    const result = await taskRollover(db, NOW);
    expect(result.rolled).toBe(2);
    expect((await getTask(bens.id)).rolloverCount).toBe(1);
    expect((await getTask(annas.id)).rolloverCount).toBe(1);
    const sent = (await personal()).filter((n) => n.reason === "rolled_over");
    expect(sent.map((n) => [n.to, n.subject])).toEqual([[cat.staff.ben.id, bens.id]]);
  });

  it("digest: the parent (overdue through its subtask) for Anna, the own subtask for Ben", async () => {
    await tree();
    await dailyDigest(db, NOW);
    const mails = await db
      .select({ to: outboundMessage.recipientAddress, text: outboundMessage.renderedText })
      .from(outboundMessage);
    const annaMail = mails.find((m) => m.to === "anna@test.local")?.text ?? "";
    const benMail = mails.find((m) => m.to === "ben@test.local")?.text ?? "";
    expect(annaMail).toContain("Genehmigung");
    expect(annaMail).not.toContain("Formular");
    expect(benMail).toContain("Gebühr zahlen");
    expect(benMail).not.toContain("Genehmigung");
  });
});

describe("template propagation compares child items by stable key", () => {
  it("adds a new child as a subtask and cancels the subtask of a removed child", async () => {
    const { templateId } = await seedPublishedTemplate(
      owner,
      [
        baseItem({ title: "Genehmigung", offsetDays: -30 }),
        baseItem({ title: "Formular", parentKey: "genehmigung" }),
        baseItem({ title: "Gebühr", parentKey: "genehmigung" }),
      ],
      { presetIds: [cat.presets.flea.id] },
    );
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-03-13"]);
    const ev = created?.id as string;
    const byKey = async () =>
      new Map(
        (await db.select().from(task).where(eq(task.eventId, ev))).map((t) => [
          t.templateStableKey,
          t,
        ]),
      );
    const before = await byKey();
    const parentId = before.get("genehmigung")?.id;
    expect(before.get("gebuehr")?.parentTaskId).toBe(parentId);

    const draft = await createDraft(owner, templateId);
    await deleteTemplateItem(owner, draft.versionId, "gebuehr");
    await addTemplateItem(
      owner,
      draft.versionId,
      baseItem({ title: "Kopie", parentKey: "genehmigung" }),
    );
    await publishDraft(owner, draft.versionId, "v2");

    const preview = await previewTemplateApplication(owner, templateId);
    const plan = preview.events.find((e) => e.eventId === ev);
    expect(plan?.add.map((a) => a.key)).toEqual(["kopie"]);
    expect(plan?.cancel.map((c) => c.title)).toEqual(["Gebühr"]);
    expect(plan?.remove).toEqual([]);
    expect(plan?.size).toBe(2);

    const result = await applyTemplateVersion(owner, templateId, [ev]);
    expect(result).toMatchObject({ added: 1, cancelled: 1, removed: 0 });
    const after = await byKey();
    expect(after.get("kopie")?.parentTaskId).toBe(parentId);
    expect(after.get("gebuehr")?.status).toBe("cancelled");
    expect(after.get("formular")?.status).toBe("todo");
  });
});
