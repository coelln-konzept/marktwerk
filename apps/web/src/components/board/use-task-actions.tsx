"use client";

import type { BoardColumn, TaskStatusKey } from "@marktwerk/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import {
  assignCard,
  moveCard,
  setStatus as setStatusAction,
  snoozeCard,
  undoChange,
  unsnoozeCard,
} from "@/app/(app)/board/actions";
import { useShell } from "@/components/shell/shell-context";
import { formatDateWeekdayDay } from "@/lib/format";
import type { BoardTask } from "@/server/queries/tasks";

/** What the actions need to know about a task (the drawer has no full card). */
type TaskRef = Pick<BoardTask, "id" | "title" | "status">;

/** What the board shows immediately, before the server has answered. */
export type OptimisticPatch =
  | { kind: "move"; id: string; column: BoardColumn; afterId: string | null }
  | { kind: "assign"; id: string; assigneeId: string | null; assigneeName: string | null }
  | { kind: "status"; id: string; status: TaskStatusKey }
  | { kind: "snooze"; id: string; until: string | null };

type Person = { id: string; displayName: string };

/** `?aufgabe=<id>` on the current page, keeping every other parameter (the drawer is a linkable overlay). */
export function useDrawerHrefs() {
  const pathname = usePathname();
  const search = useSearchParams();
  const open = useCallback(
    (id: string) => {
      const params = new URLSearchParams(search.toString());
      params.set("aufgabe", id);
      params.delete("detail");
      return `${pathname}?${params.toString()}`;
    },
    [pathname, search],
  );
  const close = useCallback(() => {
    const params = new URLSearchParams(search.toString());
    params.delete("aufgabe");
    params.delete("detail");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, search]);
  return { open, close };
}

/**
 * Card and drawer actions with their toasts: every change is applied at once, confirmed by an undo
 * toast (UX concept §6: undo instead of asking first) and reverted through the audit entry.
 */
export function useTaskActions({
  staff,
  scopeEventId,
  apply,
}: {
  staff: Person[];
  /** Event board: the card order is kept per event. */
  scopeEventId?: string | null;
  apply?: (patch: OptimisticPatch) => void;
}) {
  const t = useTranslations("board");
  const tTasks = useTranslations("tasks");
  const locale = useLocale();
  const { showToast } = useShell();
  const router = useRouter();
  const drawer = useDrawerHrefs();
  const [pending, startTransition] = useTransition();

  const errorText = useCallback(
    (code: string) =>
      t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic"),
    [t],
  );

  const evidenceText = useCallback(
    (detail: string[] | undefined) =>
      (detail ?? []).map((d) => tTasks(`evidence.${d}` as never)).join(", "),
    [tTasks],
  );

  const showUndo = useCallback(
    (message: string, auditId: string | null) => {
      if (!auditId) {
        showToast({ message });
        return;
      }
      showToast({
        message,
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const result = await undoChange(auditId);
          showToast({ message: result.ok ? t("toast.reverted") : errorText(result.error) });
        },
      });
    },
    [showToast, t, errorText],
  );

  /** A failed call: evidence that is still missing opens the task, everything else is a message. */
  const fail = useCallback(
    (result: Extract<Result, { ok: false }>, task: TaskRef) => {
      if (result.error === "evidence_missing") {
        showToast({
          message: t("errors.evidence_missing", {
            title: task.title,
            what: evidenceText(result.detail),
          }),
          actionLabel: t("toast.open"),
          onAction: () => router.push(drawer.open(task.id) as never),
        });
        return;
      }
      showToast({ message: errorText(result.error) });
    },
    [showToast, t, evidenceText, errorText, router, drawer],
  );

  const run = useCallback(
    (
      patch: OptimisticPatch | null,
      task: TaskRef,
      call: () => Promise<Result>,
      success: string,
    ) => {
      startTransition(async () => {
        if (patch) apply?.(patch);
        const result = await call();
        if (result.ok) {
          if (result.data.changed) showUndo(success, result.data.auditId);
          return;
        }
        fail(result, task);
      });
    },
    [apply, showUndo, fail],
  );

  const move = useCallback(
    (task: TaskRef, column: BoardColumn, afterId: string | null) =>
      run(
        { kind: "move", id: task.id, column, afterId },
        task,
        () => moveCard(task.id, column, { after: afterId }, { eventId: scopeEventId ?? null }),
        column === "done"
          ? t("toast.done", { title: task.title })
          : t("toast.moved", { title: task.title, column: t(`columns.${column}`) }),
      ),
    [run, scopeEventId, t],
  );

  const assign = useCallback(
    (task: TaskRef, staffMemberId: string | null) => {
      const person = staff.find((s) => s.id === staffMemberId) ?? null;
      run(
        {
          kind: "assign",
          id: task.id,
          assigneeId: person?.id ?? null,
          assigneeName: person?.displayName ?? null,
        },
        task,
        () => assignCard(task.id, staffMemberId),
        person
          ? t("toast.assigned", { title: task.title, name: person.displayName })
          : t("toast.unassigned", { title: task.title }),
      );
    },
    [run, staff, t],
  );

  /**
   * Drag and drop onto another swimlane in a different column: one gesture, two server calls (move,
   * then assign), one toast whose "Rückgängig" reverts both.
   */
  const moveAndAssign = useCallback(
    (task: TaskRef, column: BoardColumn, afterId: string | null, staffMemberId: string | null) => {
      const person = staff.find((s) => s.id === staffMemberId) ?? null;
      startTransition(async () => {
        apply?.({ kind: "move", id: task.id, column, afterId });
        apply?.({
          kind: "assign",
          id: task.id,
          assigneeId: person?.id ?? null,
          assigneeName: person?.displayName ?? null,
        });
        const moved = await moveCard(
          task.id,
          column,
          { after: afterId },
          { eventId: scopeEventId ?? null },
        );
        if (!moved.ok) return fail(moved, task);
        const assigned = await assignCard(task.id, staffMemberId);
        if (!assigned.ok) return fail(assigned, task);
        const audits = [assigned.data.auditId, moved.data.auditId].filter((id) => id !== null);
        const message = person
          ? t("toast.assignedMoved", {
              title: task.title,
              name: person.displayName,
              column: t(`columns.${column}`),
            })
          : t("toast.unassignedMoved", { title: task.title, column: t(`columns.${column}`) });
        if (audits.length === 0) return;
        showToast({
          message,
          actionLabel: t("toast.undo"),
          onAction: async () => {
            // newest change first, so each undo still finds the state it expects
            let failure: string | null = null;
            for (const auditId of audits) {
              const result = await undoChange(auditId);
              if (!result.ok) {
                failure = result.error;
                break;
              }
            }
            showToast({ message: failure ? errorText(failure) : t("toast.reverted") });
          },
        });
      });
    },
    [apply, staff, scopeEventId, fail, showToast, t, errorText],
  );

  const setStatus = useCallback(
    (
      task: TaskRef,
      status: TaskStatusKey,
      input: { reason?: string | null; note?: string | null } = {},
    ) =>
      run(
        { kind: "status", id: task.id, status },
        task,
        () => setStatusAction(task.id, status, input),
        status === "done"
          ? t("toast.done", { title: task.title })
          : status === "todo" && (task.status === "done" || task.status === "skipped")
            ? t("toast.reopened", { title: task.title })
            : t("toast.status", { title: task.title, status: tTasks(`status.${status}`) }),
      ),
    [run, t, tTasks],
  );

  /** "Zurückstellen": hides the task from due lists until `until`; the toast offers undo. */
  const snooze = useCallback(
    (task: TaskRef, until: string) =>
      run(
        { kind: "snooze", id: task.id, until },
        task,
        () => snoozeCard(task.id, until),
        t("toast.snoozed", { title: task.title, date: formatDateWeekdayDay(until, locale) }),
      ),
    [run, t, locale],
  );

  const unsnooze = useCallback(
    (task: TaskRef) =>
      run(
        { kind: "snooze", id: task.id, until: null },
        task,
        () => unsnoozeCard(task.id),
        t("toast.unsnoozed", { title: task.title }),
      ),
    [run, t],
  );

  return { pending, move, assign, moveAndAssign, setStatus, snooze, unsnooze, errorText, drawer };
}

type Result =
  | { ok: true; data: { changed: boolean; auditId: string | null } }
  | { ok: false; error: string; detail?: string[] };
