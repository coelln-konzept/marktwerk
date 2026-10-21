"use server";

import type { BoardColumn, TaskStatusKey } from "@marktwerk/core";
import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  addCheckItem,
  addComment,
  assignTask,
  createTask,
  type EffortFeedback,
  type MovePosition,
  type MoveScope,
  moveTask,
  type NewTask,
  setCheckItemDone,
  setEffortFeedback,
  setTaskStatus,
  TaskInputError,
  type TaskPatch,
  undoTaskChange,
  updateTask,
} from "@/server/services/tasks";
import { requirePermission } from "@/server/session";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; detail?: string[] };

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
      return { ok: false, error: error.code, detail: error.detail };
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

export async function tickCheckItem(taskId: string, itemId: string, done: boolean) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => setCheckItemDone(actor, taskId, itemId, done));
}

export async function newCheckItem(taskId: string, title: string) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => addCheckItem(actor, taskId, title));
}

export async function postComment(taskId: string, body: string) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => addComment(actor, taskId, body));
}

/** "+ Aufgabe": a manual task on an event or without one. */
export async function makeTask(input: NewTask) {
  await requirePermission("task", "write");
  const actor = await getActor();
  return run(() => createTask(actor, input));
}
