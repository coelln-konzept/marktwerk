import "server-only";
import {
  assignedText,
  BOARD_COLUMNS,
  type BoardColumn,
  berlinDay,
  boardColumnFor,
  can,
  compareCards,
  derivedColumn,
  dueAtForDate,
  findMentions,
  isIsoDate,
  isOpenStatus,
  mentionedText,
  missingEvidence,
  sortBetween,
  TASK_STATUSES,
  type TaskStatusKey,
  taskLink,
} from "@marktwerk/core";
import { insertNotifications } from "@marktwerk/db";
import {
  auditLog,
  event,
  eventDuty,
  notification,
  staffMember,
  task,
  taskCheckItem,
  taskComment,
  user,
} from "@marktwerk/db/schema";
import { and, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { visibleTasks } from "../task-scope";

export type TaskError =
  | "not_found"
  | "invalid_input"
  | "invalid_status"
  | "invalid_column"
  | "invalid_staff"
  | "invalid_event"
  | "invalid_state"
  | "reason_required"
  | "evidence_missing"
  | "not_undoable"
  | "conflict";

export class TaskInputError extends Error {
  constructor(
    readonly code: TaskError,
    /** For `evidence_missing`: which evidence is missing ("note", "check_items"). */
    readonly detail: string[] = [],
  ) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TaskRow = typeof task.$inferSelect;
type TaskCategory = TaskRow["category"];
type TaskPriority = TaskRow["priority"];
export type EffortFeedback = NonNullable<TaskRow["effortFeedback"]>;

const UUID = /^[0-9a-f-]{36}$/i;
const TITLE_MAX = 200;
const TEXT_MAX = 4000;
/** 100 hours; anything above is a typing error, not an estimate. */
const ESTIMATE_MAX_MINUTES = 6000;

/** Options for tests and callers that already know "today" / "now". */
export type TaskClock = { now?: Date; today?: string };

const clock = (c?: TaskClock) => {
  const now = c?.now ?? new Date();
  return { now, today: c?.today ?? berlinDay(now) };
};

// ---------------------------------------------------------------------------------------------
// state snapshots (audit + undo)

/** The fields a move, assignment or status change can touch. Audit diffs and undo work on these. */
type TaskState = {
  boardColumn: BoardColumn | null;
  boardSort: number;
  status: TaskStatusKey;
  waitingReason: string | null;
  skippedReason: string | null;
  completedAt: string | null;
  completedByStaffMemberId: string | null;
  assigneeId: string | null;
  assigneeOverridden: boolean;
};
type StateKey = keyof TaskState;

const STATE_KEYS: StateKey[] = [
  "boardColumn",
  "boardSort",
  "status",
  "waitingReason",
  "skippedReason",
  "completedAt",
  "completedByStaffMemberId",
  "assigneeId",
  "assigneeOverridden",
];

function stateOf(row: TaskRow): TaskState {
  return {
    boardColumn: row.boardColumn,
    boardSort: row.boardSort,
    status: row.status,
    waitingReason: row.waitingReason,
    skippedReason: row.skippedReason,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completedByStaffMemberId: row.completedByStaffMemberId,
    assigneeId: row.assigneeId,
    assigneeOverridden: row.assigneeOverridden,
  };
}

/** Keys whose value differs, as `{ before, after }` restricted to those keys. */
function stateDiff(before: TaskState, after: TaskState) {
  const keys = STATE_KEYS.filter((k) => before[k] !== after[k]);
  const pick = (s: TaskState) => Object.fromEntries(keys.map((k) => [k, s[k]]));
  return { keys, before: pick(before), after: pick(after) };
}

/** A state patch as columns (dates revived). */
function columnsOf(patch: Partial<TaskState>): Partial<typeof task.$inferInsert> {
  const { completedAt, ...rest } = patch;
  return {
    ...rest,
    ...(completedAt !== undefined
      ? { completedAt: completedAt ? new Date(completedAt) : null }
      : {}),
  };
}

async function writeAudit(
  tx: Tx,
  actor: Actor,
  action: string,
  taskId: string,
  diff: unknown,
): Promise<string> {
  // Not `audit()`: assign notifications and undo need the id of the entry (deterministic dedupe key).
  const [row] = await tx
    .insert(auditLog)
    .values({ actorId: actor.id, action, entityType: "task", entityId: taskId, diff })
    .returning({ id: auditLog.id });
  if (!row) throw new Error("audit entry missing");
  return row.id;
}

// ---------------------------------------------------------------------------------------------
// helpers

function need(actor: Actor, action: "read" | "write" | "assign") {
  if (!can(actor.role, "task", action)) forbidden();
}

function checkId(id: string, code: TaskError = "not_found") {
  if (!UUID.test(id)) throw new TaskInputError(code);
}

/** The task row locked for update, or `not_found` (also when the actor may not see it). */
async function loadTask(tx: Tx, actor: Actor, taskId: string): Promise<TaskRow> {
  checkId(taskId);
  const [row] = await tx
    .select()
    .from(task)
    .where(and(eq(task.id, taskId), visibleTasks(actor)))
    .for("update");
  if (!row) throw new TaskInputError("not_found");
  return row;
}

async function eventNameOf(tx: Tx, eventId: string | null): Promise<string | null> {
  if (!eventId) return null;
  const [row] = await tx.select({ name: event.name }).from(event).where(eq(event.id, eventId));
  return row?.name ?? null;
}

async function activeStaff(tx: Tx, staffMemberId: string): Promise<{ id: string; name: string }> {
  checkId(staffMemberId, "invalid_staff");
  const [person] = await tx
    .select({ id: staffMember.id, name: staffMember.displayName })
    .from(staffMember)
    .where(
      and(
        eq(staffMember.id, staffMemberId),
        eq(staffMember.active, true),
        isNull(staffMember.archivedAt),
      ),
    );
  if (!person) throw new TaskInputError("invalid_staff");
  return person;
}

function cleanTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (title === "" || title.length > TITLE_MAX) throw new TaskInputError("invalid_input");
  return title;
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new TaskInputError("invalid_input");
  const text = value.trim();
  if (text.length > TEXT_MAX) throw new TaskInputError("invalid_input");
  return text === "" ? null : text;
}

function cleanEstimate(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > ESTIMATE_MAX_MINUTES)
    throw new TaskInputError("invalid_input");
  return value as number;
}

// ---------------------------------------------------------------------------------------------
// status

export type StatusInput = {
  /** Why it waits (`waiting_external`, `blocked`) or is skipped (required). */
  reason?: string | null;
  /** A note given while marking done; saved as a comment and counts as the required note. */
  note?: string | null;
};

/**
 * The column changes for a status change, with all rules applied: skipping needs a reason, "done"
 * needs its evidence (note and ticked check items; photo/attachment only from M5), leaving "done"
 * reopens the task. The optional completion note is returned so the caller can store it.
 */
async function statusPatch(
  tx: Tx,
  actor: Actor,
  row: TaskRow,
  to: TaskStatusKey,
  input: StatusInput,
  now: Date,
): Promise<{ patch: Partial<TaskState>; note: string | null }> {
  if (!TASK_STATUSES.includes(to) || to === "cancelled") throw new TaskInputError("invalid_status");
  if (row.status === "cancelled") throw new TaskInputError("invalid_state");
  const reason = cleanText(input.reason);
  const note = cleanText(input.note);
  const patch: Partial<TaskState> = {
    status: to,
    waitingReason: null,
    skippedReason: null,
    completedAt: null,
    completedByStaffMemberId: null,
  };

  if (to === "skipped") {
    if (!reason) throw new TaskInputError("reason_required");
    patch.skippedReason = reason;
  } else if (to === "waiting_external" || to === "blocked") {
    patch.waitingReason = reason;
  } else if (to === "done") {
    const [{ openItems } = { openItems: 0 }] = await tx
      .select({ openItems: count() })
      .from(taskCheckItem)
      .where(and(eq(taskCheckItem.taskId, row.id), eq(taskCheckItem.done, false)));
    const [{ comments } = { comments: 0 }] = await tx
      .select({ comments: count() })
      .from(taskComment)
      .where(and(eq(taskComment.taskId, row.id), isNull(taskComment.archivedAt)));
    const missing = missingEvidence({
      requiresNote: row.requiresNote,
      requiresPhoto: row.requiresPhoto,
      requiresAttachment: row.requiresAttachment,
      hasNote: note !== null || comments > 0,
      openCheckItems: openItems,
    });
    if (missing.length > 0) throw new TaskInputError("evidence_missing", missing);
    patch.completedAt = now.toISOString();
    patch.completedByStaffMemberId = actor.staffMemberId;
    // A finished task always sits in Erledigt; the manual-move override has served its purpose.
    patch.boardColumn = null;
  }
  return { patch, note: to === "done" ? note : null };
}

export type TaskChange = {
  changed: boolean;
  /** Audit entry to pass to {@link undoTaskChange}; null when nothing changed. */
  auditId: string | null;
};

/**
 * Sets the status. `waiting_external` / `blocked` take an optional reason, `skipped` needs one, `done`
 * enforces the evidence the template asked for (see `missingEvidence`).
 */
export async function setTaskStatus(
  actor: Actor,
  taskId: string,
  to: TaskStatusKey,
  input: StatusInput = {},
  at?: TaskClock,
): Promise<TaskChange & { from: TaskStatusKey }> {
  need(actor, "write");
  const { now } = clock(at);
  return db.transaction(async (tx) => {
    const row = await loadTask(tx, actor, taskId);
    const before = stateOf(row);
    const { patch, note } = await statusPatch(tx, actor, row, to, input, now);
    const after = { ...before, ...patch };
    const diff = stateDiff(before, after);
    if (diff.keys.length === 0) return { changed: false, auditId: null, from: row.status };

    await tx.update(task).set(columnsOf(patch)).where(eq(task.id, row.id));
    if (note) await insertComment(tx, actor, row, note);
    const auditId = await writeAudit(tx, actor, "task.status", row.id, {
      from: row.status,
      to,
      before: diff.before,
      after: diff.after,
      ...(note ? { note: true } : {}),
    });
    return { changed: true, auditId, from: row.status };
  });
}

// ---------------------------------------------------------------------------------------------
// move

export type MovePosition =
  /** Zero-based slot in the target column's current order (excluding the moved card). */
  | { index: number }
  /** Directly below this card; `null` = top of the column. A card that is gone puts it at the end. */
  | { after: string | null };

export type MoveScope = {
  /** Order within one event's cards (event board) or, when omitted, across all visible cards. */
  eventId?: string | null;
};

/**
 * Moves a card to a column and position. This is the single path behind the card menu
 * ("Verschieben nach…"), keyboard moves and, later, drag and drop.
 *
 * - The column becomes a manual override (`board_column`) unless it equals the one the due date
 *   gives anyway; the override lapses once the due date has passed.
 * - The slot is expressed as `board_sort` between the neighbours (one write); when the neighbours
 *   leave no room the column is renumbered first.
 * - Moving into "Erledigt" completes the task (evidence rules apply); moving a finished task out of
 *   it reopens it.
 */
export async function moveTask(
  actor: Actor,
  taskId: string,
  column: BoardColumn,
  position: MovePosition = { index: Number.MAX_SAFE_INTEGER },
  scope: MoveScope = {},
  at?: TaskClock,
): Promise<TaskChange & { column: BoardColumn }> {
  need(actor, "write");
  if (!BOARD_COLUMNS.includes(column)) throw new TaskInputError("invalid_column");
  if ("index" in position && !(Number.isInteger(position.index) && position.index >= 0))
    throw new TaskInputError("invalid_input");
  if ("after" in position && position.after !== null) checkId(position.after, "invalid_input");
  const { now, today } = clock(at);

  return db.transaction(async (tx) => {
    const row = await loadTask(tx, actor, taskId);
    if (row.status === "cancelled") throw new TaskInputError("invalid_state");
    const before = stateOf(row);
    let patch: Partial<TaskState> = {};
    let note: string | null = null;

    if (column === "done") {
      // Finished already: nothing to do. Otherwise this is "mark done".
      if (!isOpenStatus(row.status)) return { changed: false, auditId: null, column };
      ({ patch, note } = await statusPatch(tx, actor, row, "done", {}, now));
    } else {
      if (!isOpenStatus(row.status)) {
        ({ patch } = await statusPatch(tx, actor, row, "todo", {}, now));
      }
      const dueOn = row.dueAt ? berlinDay(row.dueAt) : null;
      patch.boardColumn = column === derivedColumn(dueOn, today) ? null : column;

      // neighbours in the target column
      const siblings = await columnCards(tx, actor, column, scope, today, row.id);
      const slot = slotOf(siblings, position);
      const prev = siblings[slot - 1]?.boardSort ?? null;
      const next = siblings[slot]?.boardSort ?? null;
      let sort = sortBetween(prev, next);
      if (sort === null) {
        // no room between the neighbours: renumber the column, leaving a gap for the moved card
        const order = [...siblings.slice(0, slot).map((s) => s.id), row.id];
        order.push(...siblings.slice(slot).map((s) => s.id));
        const sorts = new Map(order.map((id, i) => [id, (i + 1) * 1024]));
        for (const s of siblings) {
          const target = sorts.get(s.id) as number;
          if (s.boardSort !== target)
            await tx.update(task).set({ boardSort: target }).where(eq(task.id, s.id));
        }
        sort = sorts.get(row.id) as number;
      }
      patch.boardSort = sort;
    }

    const after = { ...before, ...patch };
    const diff = stateDiff(before, after);
    if (diff.keys.length === 0) return { changed: false, auditId: null, column };

    await tx.update(task).set(columnsOf(patch)).where(eq(task.id, row.id));
    if (note) await insertComment(tx, actor, row, note);
    const auditId = await writeAudit(tx, actor, "task.move", row.id, {
      column,
      before: diff.before,
      after: diff.after,
    });
    return { changed: true, auditId, column };
  });
}

type CardKey = { id: string; boardSort: number; dueAt: Date | null; createdAt: Date };

/** Open cards that currently show in `column` (within the scope), in display order, without `exceptId`. */
async function columnCards(
  tx: Tx,
  actor: Actor,
  column: BoardColumn,
  scope: MoveScope,
  today: string,
  exceptId: string,
): Promise<CardKey[]> {
  const rows = await tx
    .select({
      id: task.id,
      status: task.status,
      boardColumn: task.boardColumn,
      boardSort: task.boardSort,
      dueAt: task.dueAt,
      createdAt: task.createdAt,
    })
    .from(task)
    .where(
      and(
        visibleTasks(actor),
        ne(task.id, exceptId),
        inArray(task.status, ["todo", "in_progress", "waiting_external", "blocked"]),
        scope.eventId ? eq(task.eventId, scope.eventId) : undefined,
      ),
    );
  return rows
    .filter((r) => boardColumnFor(r, today) === column)
    .sort(compareCards)
    .map(({ id, boardSort, dueAt, createdAt }) => ({ id, boardSort, dueAt, createdAt }));
}

function slotOf(siblings: CardKey[], position: MovePosition): number {
  if ("index" in position) return Math.min(position.index, siblings.length);
  if (position.after === null) return 0;
  const at = siblings.findIndex((s) => s.id === position.after);
  return at === -1 ? siblings.length : at + 1;
}

// ---------------------------------------------------------------------------------------------
// assign

/**
 * Assigns or unassigns (`null`) a task. Either way the assignment counts as done by hand
 * (`assignee_overridden`), so a later change of the event's duty holder leaves it alone. The new
 * assignee gets an `assigned` notification, unless they did it themselves.
 */
export async function assignTask(
  actor: Actor,
  taskId: string,
  staffMemberId: string | null,
): Promise<TaskChange & { from: string | null; to: string | null; toName: string | null }> {
  need(actor, "assign");
  return db.transaction(async (tx) => {
    const row = await loadTask(tx, actor, taskId);
    if (row.status === "cancelled") throw new TaskInputError("invalid_state");
    const person = staffMemberId === null ? null : await activeStaff(tx, staffMemberId);
    const from = row.assigneeId;
    const to = person?.id ?? null;
    if (from === to)
      return { changed: false, auditId: null, from, to, toName: person?.name ?? null };

    const before = stateOf(row);
    const after = { ...before, assigneeId: to, assigneeOverridden: true };
    const diff = stateDiff(before, after);
    await tx
      .update(task)
      .set({ assigneeId: to, assigneeOverridden: true })
      .where(eq(task.id, row.id));
    const fromName = from
      ? ((
          await tx
            .select({ name: staffMember.displayName })
            .from(staffMember)
            .where(eq(staffMember.id, from))
        )[0]?.name ?? null)
      : null;
    const auditId = await writeAudit(tx, actor, "task.assign", row.id, {
      before: diff.before,
      after: diff.after,
      fromName,
      toName: person?.name ?? null,
    });
    if (person && person.id !== actor.staffMemberId) {
      const text = assignedText(
        { title: row.title, eventName: await eventNameOf(tx, row.eventId) },
        actor.displayName,
      );
      await insertNotifications(tx, [
        {
          recipientStaffMemberId: person.id,
          reason: "assigned",
          subjectType: "task",
          subjectId: row.id,
          title: text.title,
          body: text.body,
          link: taskLink(row.id, row.eventId),
          dedupeKey: assignedKey(row.id, auditId),
        },
      ]);
    }
    return { changed: true, auditId, from, to, toName: person?.name ?? null };
  });
}

const assignedKey = (taskId: string, auditId: string) => `task:${taskId}:assigned:${auditId}`;

// ---------------------------------------------------------------------------------------------
// undo

const UNDOABLE = ["task.move", "task.assign", "task.status"];

/**
 * Undo toast: reverts one of the actor's own moves, assignments or status changes, but only while the
 * task still has the values that change produced (nobody changed it since; otherwise `conflict`).
 * Works from the audit entry, so the client cannot ask for arbitrary values.
 */
export async function undoTaskChange(
  actor: Actor,
  auditId: string,
): Promise<{ taskId: string; action: string }> {
  need(actor, "write");
  checkId(auditId, "not_undoable");
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.id, auditId),
          eq(auditLog.entityType, "task"),
          eq(auditLog.actorId, actor.id),
          inArray(auditLog.action, UNDOABLE),
        ),
      );
    const diff = entry?.diff as { before?: Partial<TaskState>; after?: Partial<TaskState> } | null;
    if (!entry?.entityId || !diff?.before || !diff.after) throw new TaskInputError("not_undoable");
    if ("assigneeId" in diff.before) need(actor, "assign");

    const row = await loadTask(tx, actor, entry.entityId);
    const current = stateOf(row);
    const expected = diff.after;
    for (const key of Object.keys(expected) as StateKey[]) {
      if (current[key] !== expected[key]) throw new TaskInputError("conflict");
    }
    // A person who has been deactivated since cannot be put back.
    if (diff.before.assigneeId) await activeStaff(tx, diff.before.assigneeId);

    await tx.update(task).set(columnsOf(diff.before)).where(eq(task.id, row.id));
    if (entry.action === "task.assign") {
      // the person was told "assigned"; take that back while they have not read it
      await tx
        .delete(notification)
        .where(
          and(
            eq(notification.dedupeKey, assignedKey(row.id, entry.id)),
            eq(notification.state, "unread"),
          ),
        );
    }
    await writeAudit(tx, actor, "task.undo", row.id, {
      of: entry.id,
      ofAction: entry.action,
      before: diff.after,
      after: diff.before,
    });
    return { taskId: row.id, action: entry.action };
  });
}

// ---------------------------------------------------------------------------------------------
// edit

export type TaskPatch = {
  title?: string;
  description?: string | null;
  estimateMinutes?: number;
  /** `YYYY-MM-DD`, or null to clear. Editing it pins the date against anchor shifts. */
  dueOn?: string | null;
};

/** Title, description, estimate and due date. Marks the task as customized and the due date as set by hand. */
export async function updateTask(
  actor: Actor,
  taskId: string,
  patch: TaskPatch,
): Promise<{ changed: boolean; fields: string[] }> {
  need(actor, "write");
  return db.transaction(async (tx) => {
    const row = await loadTask(tx, actor, taskId);
    if (row.status === "cancelled") throw new TaskInputError("invalid_state");
    const set: Partial<typeof task.$inferInsert> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (patch.title !== undefined) {
      const title = cleanTitle(patch.title);
      if (title !== row.title) {
        set.title = title;
        before.title = row.title;
        after.title = title;
      }
    }
    if (patch.description !== undefined) {
      const description = cleanText(patch.description);
      if (description !== row.description) {
        set.description = description;
        before.description = row.description;
        after.description = description;
      }
    }
    if (patch.estimateMinutes !== undefined) {
      const minutes = cleanEstimate(patch.estimateMinutes);
      if (minutes !== row.estimateMinutes) {
        set.estimateMinutes = minutes;
        before.estimateMinutes = row.estimateMinutes;
        after.estimateMinutes = minutes;
      }
    }
    if (patch.dueOn !== undefined) {
      if (patch.dueOn !== null && !isIsoDate(patch.dueOn))
        throw new TaskInputError("invalid_input");
      const was = row.dueAt ? berlinDay(row.dueAt) : null;
      if (patch.dueOn !== was) {
        set.dueAt = patch.dueOn === null ? null : dueAtForDate(patch.dueOn, row.dueAt);
        set.dueOverridden = true;
        before.dueOn = was;
        after.dueOn = patch.dueOn;
      }
    }

    const fields = Object.keys(after);
    if (fields.length === 0) return { changed: false, fields };
    set.customized = true;
    await tx.update(task).set(set).where(eq(task.id, row.id));
    await writeAudit(tx, actor, "task.update", row.id, { before, after });
    return { changed: true, fields };
  });
}

/** How the team felt about the estimate once the task is done (feeds better estimates later). */
export async function setEffortFeedback(
  actor: Actor,
  taskId: string,
  feedback: EffortFeedback | null,
): Promise<{ changed: boolean }> {
  need(actor, "write");
  if (feedback !== null && !["as_planned", "longer", "shorter"].includes(feedback))
    throw new TaskInputError("invalid_input");
  return db.transaction(async (tx) => {
    const row = await loadTask(tx, actor, taskId);
    if (row.status !== "done") throw new TaskInputError("invalid_state");
    if (row.effortFeedback === feedback) return { changed: false };
    await tx.update(task).set({ effortFeedback: feedback }).where(eq(task.id, row.id));
    await writeAudit(tx, actor, "task.effort", row.id, {
      before: { effortFeedback: row.effortFeedback },
      after: { effortFeedback: feedback },
    });
    return { changed: true };
  });
}

// ---------------------------------------------------------------------------------------------
// check items

export async function addCheckItem(
  actor: Actor,
  taskId: string,
  title: string,
): Promise<{ id: string }> {
  need(actor, "write");
  const clean = cleanTitle(title);
  return db.transaction(async (tx) => {
    const row = await loadTask(tx, actor, taskId);
    if (row.status === "cancelled") throw new TaskInputError("invalid_state");
    const [last] = await tx
      .select({ sort: sql<number>`coalesce(max(${taskCheckItem.sort}), 0)::int` })
      .from(taskCheckItem)
      .where(eq(taskCheckItem.taskId, row.id));
    const [item] = await tx
      .insert(taskCheckItem)
      .values({ taskId: row.id, title: clean, sort: (last?.sort ?? 0) + 1 })
      .returning({ id: taskCheckItem.id });
    if (!item) throw new Error("check item missing");
    await writeAudit(tx, actor, "task.check", row.id, {
      op: "add",
      itemId: item.id,
      title: clean,
    });
    return item;
  });
}

export async function setCheckItemDone(
  actor: Actor,
  taskId: string,
  itemId: string,
  done: boolean,
  at?: TaskClock,
): Promise<{ changed: boolean }> {
  need(actor, "write");
  checkId(itemId);
  const { now } = clock(at);
  return db.transaction(async (tx) => {
    const row = await loadTask(tx, actor, taskId);
    if (row.status === "cancelled") throw new TaskInputError("invalid_state");
    const [item] = await tx
      .select()
      .from(taskCheckItem)
      .where(and(eq(taskCheckItem.id, itemId), eq(taskCheckItem.taskId, row.id)))
      .for("update");
    if (!item) throw new TaskInputError("not_found");
    if (item.done === done) return { changed: false };
    await tx
      .update(taskCheckItem)
      .set({
        done,
        doneAt: done ? now : null,
        doneByStaffMemberId: done ? actor.staffMemberId : null,
      })
      .where(eq(taskCheckItem.id, item.id));
    await writeAudit(tx, actor, "task.check", row.id, {
      op: done ? "tick" : "untick",
      itemId: item.id,
      title: item.title,
    });
    return { changed: true };
  });
}

// ---------------------------------------------------------------------------------------------
// comments

/** Stores a comment, resolves its @mentions and notifies the mentioned people (not the author). */
async function insertComment(
  tx: Tx,
  actor: Actor,
  row: TaskRow,
  body: string,
): Promise<{ id: string; mentioned: string[] }> {
  const people = await tx
    .select({
      id: staffMember.id,
      displayName: staffMember.displayName,
      loginRole: user.role,
    })
    .from(staffMember)
    .leftJoin(user, eq(user.id, staffMember.userId))
    .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)));
  const mentioned = findMentions(body, people);

  const [comment] = await tx
    .insert(taskComment)
    .values({
      taskId: row.id,
      authorStaffMemberId: actor.staffMemberId,
      authorUserId: actor.id,
      body,
      mentionedStaffMemberIds: mentioned,
    })
    .returning({ id: taskComment.id });
  if (!comment) throw new Error("comment missing");

  const recipients = people.filter((p) => mentioned.includes(p.id) && p.id !== actor.staffMemberId);
  // A field user only gets a link into events they work at.
  const fieldIds = recipients.filter((p) => p.loginRole === "field").map((p) => p.id);
  const allowedField =
    fieldIds.length && row.eventId
      ? new Set(
          (
            await tx
              .select({ id: eventDuty.staffMemberId })
              .from(eventDuty)
              .where(
                and(eq(eventDuty.eventId, row.eventId), inArray(eventDuty.staffMemberId, fieldIds)),
              )
          ).map((r) => r.id),
        )
      : new Set<string>();
  const notify = recipients.filter(
    (p) => p.loginRole !== "field" || (row.eventId !== null && allowedField.has(p.id)),
  );
  if (notify.length > 0) {
    const text = mentionedText(
      { title: row.title, eventName: await eventNameOf(tx, row.eventId) },
      actor.displayName,
    );
    await insertNotifications(
      tx,
      notify.map((p) => ({
        recipientStaffMemberId: p.id,
        reason: "mentioned" as const,
        subjectType: "task",
        subjectId: row.id,
        title: text.title,
        body: text.body,
        link: taskLink(row.id, row.eventId),
        dedupeKey: `task:${row.id}:mention:${comment.id}`,
      })),
    );
  }
  return { id: comment.id, mentioned };
}

/** Adds a comment. Names written as "@Anna Meier" notify that person (`mentioned`). */
export async function addComment(
  actor: Actor,
  taskId: string,
  body: string,
): Promise<{ id: string; mentioned: string[] }> {
  need(actor, "write");
  const text = cleanText(body);
  if (!text) throw new TaskInputError("invalid_input");
  return db.transaction(async (tx) => {
    const row = await loadTask(tx, actor, taskId);
    if (row.status === "cancelled") throw new TaskInputError("invalid_state");
    const result = await insertComment(tx, actor, row, text);
    await writeAudit(tx, actor, "task.comment", row.id, {
      commentId: result.id,
      mentioned: result.mentioned,
    });
    return result;
  });
}

// ---------------------------------------------------------------------------------------------
// create

export type NewTask = {
  title: string;
  /** Null / omitted: a task without an event (office, company). */
  eventId?: string | null;
  description?: string | null;
  dueOn?: string | null;
  estimateMinutes?: number;
  category?: TaskCategory;
  priority?: TaskPriority;
  /** Needs the `assign` permission. */
  assigneeId?: string | null;
};

/** A task made by hand (`source = manual`), on an event or without one. */
export async function createTask(actor: Actor, input: NewTask): Promise<{ id: string }> {
  need(actor, "write");
  const title = cleanTitle(input.title);
  const description = cleanText(input.description);
  const estimate = cleanEstimate(input.estimateMinutes ?? 0);
  if (input.dueOn != null && !isIsoDate(input.dueOn)) throw new TaskInputError("invalid_input");
  if (input.category && !task.category.enumValues.includes(input.category))
    throw new TaskInputError("invalid_input");
  if (input.priority && !task.priority.enumValues.includes(input.priority))
    throw new TaskInputError("invalid_input");
  if (input.assigneeId) need(actor, "assign");

  return db.transaction(async (tx) => {
    let eventName: string | null = null;
    if (input.eventId) {
      checkId(input.eventId, "invalid_event");
      const [found] = await tx
        .select({ name: event.name })
        .from(event)
        .where(and(eq(event.id, input.eventId), isNull(event.archivedAt)));
      if (!found) throw new TaskInputError("invalid_event");
      // Field users: only events they work at.
      if (actor.role === "field") {
        const [duty] = actor.staffMemberId
          ? await tx
              .select({ one: eventDuty.eventId })
              .from(eventDuty)
              .where(
                and(
                  eq(eventDuty.eventId, input.eventId),
                  eq(eventDuty.staffMemberId, actor.staffMemberId),
                ),
              )
          : [];
        if (!duty) throw new TaskInputError("invalid_event");
      }
      eventName = found.name;
    } else if (actor.role === "field" && !actor.staffMemberId) {
      throw new TaskInputError("invalid_event");
    }
    const person = input.assigneeId ? await activeStaff(tx, input.assigneeId) : null;

    const [created] = await tx
      .insert(task)
      .values({
        eventId: input.eventId ?? null,
        source: "manual",
        title,
        description,
        category: input.category ?? "general",
        priority: input.priority ?? "normal",
        estimateMinutes: estimate,
        dueAt: input.dueOn ? dueAtForDate(input.dueOn, null) : null,
        dueOverridden: input.dueOn != null,
        assigneeId: person?.id ?? null,
        assigneeOverridden: person !== null,
        customized: false,
      })
      .returning({ id: task.id });
    if (!created) throw new Error("task missing");
    const auditId = await writeAudit(tx, actor, "task.create", created.id, {
      title,
      eventId: input.eventId ?? null,
      dueOn: input.dueOn ?? null,
      estimateMinutes: estimate,
      assigneeId: person?.id ?? null,
    });
    if (person && person.id !== actor.staffMemberId) {
      const text = assignedText({ title, eventName }, actor.displayName);
      await insertNotifications(tx, [
        {
          recipientStaffMemberId: person.id,
          reason: "assigned",
          subjectType: "task",
          subjectId: created.id,
          title: text.title,
          body: text.body,
          link: taskLink(created.id, input.eventId ?? null),
          dedupeKey: assignedKey(created.id, auditId),
        },
      ]);
    }
    return created;
  });
}
