"use server";

import { type BoardColumn, can, type TaskStatusKey } from "@marktwerk/core";
import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import { listContactOptions } from "@/server/queries/contacts";
import {
  assignTask,
  createTask,
  deleteTask,
  type EffortFeedback,
  type MovePosition,
  type MoveScope,
  moveTask,
  type NewTask,
  restoreTask,
  setEffortFeedback,
  setTaskParent,
  setTaskStatus,
  snoozeTask,
  TaskInputError,
  type TaskPatch,
  undoTaskChange,
  unsnoozeTask,
  updateTask,
} from "@/server/services/tasks";
import { requirePermission } from "@/server/session";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; detail?: string[]; count?: number };

/** Runs a service call, turns its input errors into results and refreshes the page data afterwards. */
async function run<T>(call: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await call();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof TaskInputError) {
      // The page may be showing an outdated card; make it current again.
      if (["conflict", "not_found", "invalid_state"].includes(error.code)) refresh();
      return {
        ok: false,
        error: error.code,
        detail: error.detail,
        ...(error.count !== undefined ? { count: error.count } : {}),
      };
    }
    throw error;
  }
}

/** Card menu "Verschieben nach…", keyboard drop, later drag and drop: one path. */
export async function moveCard(
  taskId: string,
  column: BoardColumn,
  position: MovePosition,
  scope: MoveScope,
) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => moveTask(actor, taskId, column, position, scope));
}

/** Card menu "Zuweisen an…" (null = niemand). */
export async function assignCard(taskId: string, staffMemberId: string | null) {
  await requirePermission("task", "assign");
  const actor = await getActor();
  return run(() => assignTask(actor, taskId, staffMemberId));
}

export async function setStatus(
  taskId: string,
  status: TaskStatusKey,
  input: { reason?: string | null; note?: string | null } = {},
) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => setTaskStatus(actor, taskId, status, input));
}

/** "Löschen" in the task drawer and the card menu (UT2-13); the toast offers undo. */
export async function deleteCard(taskId: string) {
  await requirePermission("task", "delete");
  const actor = await getActor();
  return run(() => deleteTask(actor, taskId));
}

/** "Wiederherstellen" of a deleted task in the Verlauf. */
export async function restoreCard(taskId: string) {
  await requirePermission("task", "delete");
  const actor = await getActor();
  return run(() => restoreTask(actor, taskId));
}

/** Undo toast of a move, assignment or status change. */
export async function undoChange(auditId: string) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => undoTaskChange(actor, auditId));
}

export async function editTask(taskId: string, patch: TaskPatch) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => updateTask(actor, taskId, patch));
}

export async function giveEffortFeedback(taskId: string, feedback: EffortFeedback | null) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => setEffortFeedback(actor, taskId, feedback));
}

/** "Unteraufgabe hinzufügen" in the task drawer (ADR 0021). */
export async function newSubtask(parentId: string, title: string) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => createTask(actor, { title, parentId }));
}

/** "Unteraufgabe von…" / "Aus Hauptaufgabe lösen" (null), later the drag in the Checkliste (ADR 0021). */
export async function setParent(taskId: string, parentId: string | null) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => setTaskParent(actor, taskId, parentId));
}

/** "Zurückstellen": hides the task from the due lists until `until` (`YYYY-MM-DD`, after today). */
export async function snoozeCard(taskId: string, until: string) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => snoozeTask(actor, taskId, until));
}

/** "Zurückstellung aufheben". */
export async function unsnoozeCard(taskId: string) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => unsnoozeTask(actor, taskId));
}

/** "+ Aufgabe": a manual task on an event or without one. */
export async function makeTask(input: NewTask) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => createTask(actor, input));
}

/**
 * The contacts the task drawer's picker offers (Fahrplan R24), loaded when "Kontakt wählen" / "Ändern" opens it:
 * live contacts only, plus whether the picker may create one in place (`contact:write`).
 */
export async function loadTaskContactOptions() {
  const user = await requirePermission("contact", "read");
  const contacts = await listContactOptions();
  return {
    ok: true as const,
    data: {
      options: contacts.map((c) => ({ id: c.id, name: c.name, kind: c.kind, city: c.city })),
      canCreate: can(user.role, "contact", "write"),
    },
  };
}
