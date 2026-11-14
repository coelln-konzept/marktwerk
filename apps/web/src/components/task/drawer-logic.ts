/**
 * Small pure rules behind the task drawer and "Neue Aufgabe" (UX audit round 1, B04), kept apart from the
 * components so they can be tested without a browser.
 */

import { checkNotifySetting, type NotifyChannel, type NotifyTiming } from "@marktwerk/core";

/** Earliest and latest due date the date fields take (a native date field otherwise accepts year 31022). */
export const DUE_MIN = "2000-01-01";
export const DUE_MAX = "2099-12-31";

/** Why a date field's content can't be saved: half typed (`incomplete`) or not a usable date (`invalid`). */
export type DueProblem = "incomplete" | "invalid";

/**
 * Checks what a native `<input type="date">` holds. A half-typed date ("05.03." without a year) reads as
 * `value === ""` with `validity.badInput`, which must not be taken for an empty field. An empty field
 * without bad input is fine (no due date).
 */
export function dueProblem(field: { value: string; badInput: boolean }): DueProblem | null {
  if (field.value === "") return field.badInput ? "incomplete" : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(field.value)) return "invalid";
  if (field.value < DUE_MIN || field.value > DUE_MAX) return "invalid";
  return null;
}

/**
 * The URL that opens a task just created in "Neue Aufgabe": the current page without the request that
 * opened the dialog (`neu=1`, `veranstaltung=<id>`), plus `aufgabe=<id>`. Reload and Back must not open the
 * dialog again (UX-004). `openPath` is a fixed page instead of the current one.
 */
export function createdTaskHref({
  pathname,
  search,
  taskId,
  openPath,
}: {
  pathname: string;
  search: URLSearchParams | string;
  taskId: string;
  openPath?: string;
}): string {
  if (openPath) return `${openPath}?aufgabe=${taskId}`;
  const params = new URLSearchParams(search);
  params.delete("neu");
  params.delete("veranstaltung");
  params.delete("detail");
  params.set("aufgabe", taskId);
  return `${pathname}?${params.toString()}`;
}

/**
 * A subtask typed into "Unteraufgabe hinzufügen" whose save may still be running; `id` once it is saved.
 * `parentId` is the task it was typed into: the drawer stays mounted when another task opens in it, so a
 * queued row must not show up under that one.
 */
export type QueuedSubtask = { key: number; parentId: string; title: string; id: string | null };

/**
 * The queued subtasks to show under `parentId` as "wird angelegt …": those not saved yet, and saved ones
 * whose row has not arrived with the refreshed task yet (so nothing flickers away in between).
 */
export function pendingSubtasks(
  queued: QueuedSubtask[],
  parentId: string,
  savedIds: Iterable<string>,
): QueuedSubtask[] {
  const saved = new Set(savedIds);
  return queued.filter((q) => q.parentId === parentId && (q.id === null || !saved.has(q.id)));
}

/**
 * What stays in the queue while `parentId` is open with the subtasks `savedIds`: its own pending ones, and
 * those of another task only while their save is still running (a saved one has nothing left to show).
 */
export function keptSubtasks(
  queued: QueuedSubtask[],
  parentId: string,
  savedIds: Iterable<string>,
): QueuedSubtask[] {
  const mine = new Set(pendingSubtasks(queued, parentId, savedIds));
  return queued.filter((q) => mine.has(q) || (q.parentId !== parentId && q.id === null));
}

/**
 * Whether the due date can be cleared without breaking the task's notification: a relative timing ("am
 * Fälligkeitstag", "1 Tag vorher", …) is computed from the due date, so the server refuses to clear it
 * (`invalid_notify`). Only `on_create` and `custom` stand without a date.
 */
export function notifyNeedsDue(notify: {
  channels: NotifyChannel[];
  timing: NotifyTiming | null;
  at: string | null;
}): boolean {
  const setting = { ...notify, at: notify.at ? new Date(notify.at) : null };
  // A setting that is fine with a date and refused without one depends on it.
  return checkNotifySetting(setting, true) === null && checkNotifySetting(setting, false) !== null;
}
