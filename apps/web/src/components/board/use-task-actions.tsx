"use client";

import type { BoardColumn, TaskStatusKey } from "@marktwerk/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import {
  assignCard,
  deleteCard,
  moveCard,
  restoreCard,
  setParent as setParentAction,
  setStatus as setStatusAction,
  snoozeCard,
  undoChange,
  unsnoozeCard,
} from "@/app/(app)/board/actions";
import { useShell } from "@/components/shell/shell-context";
import { callAction, NETWORK_ERROR } from "@/lib/call-action";
import { formatDateWeekdayDay } from "@/lib/format";
import type { BoardTask } from "@/server/queries/tasks";
import { useNestProblemText } from "./nesting";

/**
 * What the actions need to know about a task (the drawer has no full card). `openSubtasks`: how many of its
 * subtasks are still open, where the list knows it (ADR 0021); "Erledigt" then opens the drawer instead.
 */
type TaskRef = Pick<BoardTask, "id" | "title" | "status"> & { openSubtasks?: number };

/** A move into "Erledigt" completes the task (a card already finished just changes place). */
function movesIntoDone(task: TaskRef, column: BoardColumn): boolean {
  return column === "done" && task.status !== "done" && task.status !== "skipped";
}

/** What the board shows immediately, before the server has answered. */
export type OptimisticPatch =
  | { kind: "move"; id: string; column: BoardColumn; afterId: string | null }
  | { kind: "assign"; id: string; assigneeId: string | null; assigneeName: string | null }
  | { kind: "status"; id: string; status: TaskStatusKey }
  | { kind: "snooze"; id: string; until: string | null }
  /** Deleted: gone from the board at once. */
  | { kind: "remove"; id: string }
  /** Nested under `parentId` or lifted out (null), ADR 0021. */
  | { kind: "parent"; id: string; parentId: string | null };

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
 * `confirmDone` is the one exception (user test 2026-11, decision D1): where a task leaves the list
 * once it is done, "Erledigt" asks first; the undo toast stays. A task the caller knows has open subtasks
 * (`openSubtasks`) is not asked about at all: "Erledigt" opens its drawer (R29).
 */
export function useTaskActions({
  staff,
  scopeEventId,
  apply,
  confirmDone = false,
}: {
  staff: Person[];
  /** Event board: the card order is kept per event. */
  scopeEventId?: string | null;
  apply?: (patch: OptimisticPatch) => void;
  /** Ask before "Erledigt" (lists the task disappears from: Übersicht, Benachrichtigungen, global Board). */
  confirmDone?: boolean;
}) {
  const t = useTranslations("board");
  const tTasks = useTranslations("tasks");
  const tShell = useTranslations("errors");
  const locale = useLocale();
  const { showToast, showError, confirm } = useShell();
  const router = useRouter();
  const drawer = useDrawerHrefs();
  const [pending, startTransition] = useTransition();
  const nestProblemText = useNestProblemText();

  const errorText = useCallback(
    (code: string) => {
      if (code === NETWORK_ERROR) return tShell("network");
      return t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
    },
    [t, tShell],
  );

  /** "2 offene Unteraufgaben, Foto fehlt": what still blocks "Erledigt". */
  const evidenceText = useCallback(
    (detail: string[] | undefined, openSubtasks: number | undefined) =>
      (detail ?? [])
        .map((d) =>
          d === "subtasks"
            ? openSubtasks
              ? tTasks("evidence.openSubtasks", { count: openSubtasks })
              : tTasks("evidence.subtasks")
            : d === "photo"
              ? tTasks("evidence.photoMissing")
              : d === "attachment"
                ? tTasks("evidence.attachmentMissing")
                : tTasks(`evidence.${d}` as never),
        )
        .join(", "),
    [tTasks],
  );

  /** `taskId`: a newer toast about the same task replaces this one (UX-031). */
  const showUndo = useCallback(
    (message: string, auditId: string | null, taskId?: string) => {
      const key = taskId ? `task:${taskId}` : undefined;
      if (!auditId) {
        showToast({ message, key });
        return;
      }
      showToast({
        message,
        key,
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const result = await callAction(() => undoChange(auditId));
          if (result.ok) showToast({ message: t("toast.reverted") });
          else showError(errorText(result.error));
        },
      });
    },
    [showToast, showError, t, errorText],
  );

  /**
   * A failed call: evidence that is still missing opens the task, everything else is a message. Both
   * are error toasts (red, stay until closed); the optimistic change reverts when the transition ends,
   * because nothing on the server changed.
   */
  const fail = useCallback(
    (result: Extract<Result, { ok: false }>, task: TaskRef) => {
      if (result.error === "evidence_missing") {
        showError(
          t("errors.evidence_missing", {
            title: task.title,
            what: evidenceText(result.detail, result.count),
          }),
          {
            actionLabel: t("toast.open"),
            // "Öffnen" goes somewhere; Strg+Z must not trigger it.
            undoable: false,
            onAction: () => router.push(drawer.open(task.id) as never),
          },
        );
        return;
      }
      showError(errorText(result.error));
    },
    [showError, t, evidenceText, errorText, router, drawer],
  );

  /**
   * "Hauptaufgabe auch erledigen?" (D2-11): after the last open subtask was finished, a second toast offers
   * to complete the parent too. Its action is a plain status change with the usual undo toast; it only goes
   * forward, so Strg+Z must not trigger it.
   */
  const offerParent = useCallback(
    (parent: { id: string; title: string }) => {
      const ref: TaskRef = { id: parent.id, title: parent.title, status: "todo" };
      showToast({
        message: t("toast.parentReady", { title: parent.title }),
        key: `task:${parent.id}:parent`,
        actionLabel: t("toast.completeParent"),
        undoable: false,
        onAction: () =>
          new Promise<void>((resolve) =>
            startTransition(async () => {
              apply?.({ kind: "status", id: parent.id, status: "done" });
              const result = await callAction(() => setStatusAction(parent.id, "done"));
              if (result.ok) {
                if (result.data.changed)
                  showUndo(
                    t("toast.done", { title: parent.title }),
                    result.data.auditId,
                    parent.id,
                  );
              } else fail(result, ref);
              resolve();
            }),
          ),
      });
    },
    [apply, showToast, showUndo, fail, t],
  );

  /**
   * "Erledigt" outside the drawer on a task whose subtasks are still open (R29): nothing is tried, the task's
   * drawer opens in place (its subtasks are there) and a plain hint in the refusal's words says why.
   */
  const openForSubtasks = useCallback(
    (task: TaskRef) => {
      router.push(drawer.open(task.id) as never, { scroll: false });
      showToast({
        message: t("errors.evidence_missing", {
          title: task.title,
          what: evidenceText(["subtasks"], task.openSubtasks),
        }),
      });
    },
    [router, drawer, showToast, t, evidenceText],
  );

  /**
   * The one rule for every way a task gets done here (UX-037): the "Erledigt" button, E, the "⋯" menu,
   * "Verschieben nach → Erledigt" and a drag into the Erledigt column. Open subtasks open the drawer
   * (R29); with `confirmDone` it asks first (decision D1), focus on "Ja, erledigt"; else `go` runs.
   */
  const whenDone = useCallback(
    (task: TaskRef, go: () => void) => {
      // A parent with open subtasks can't be done yet (ADR 0021 done gate): no question the server would
      // refuse anyway; its drawer opens on the subtasks with a short hint (R29).
      if ((task.openSubtasks ?? 0) > 0) return openForSubtasks(task);
      if (!confirmDone) return go();
      void confirm({
        title: t("confirmDone.title"),
        description: t("confirmDone.description", { title: task.title }),
        confirmLabel: t("confirmDone.confirm"),
        cancelLabel: t("confirmDone.cancel"),
      }).then((ok) => ok && go());
    },
    [t, confirmDone, confirm, openForSubtasks],
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
        const result = await callAction(call);
        if (result.ok) {
          if (result.data.changed) showUndo(success, result.data.auditId, task.id);
          if (result.data.parentReady) offerParent(result.data.parentReady);
          return;
        }
        fail(result, task);
      });
    },
    [apply, showUndo, fail, offerParent],
  );

  const move = useCallback(
    (task: TaskRef, column: BoardColumn, afterId: string | null) => {
      const go = () =>
        run(
          { kind: "move", id: task.id, column, afterId },
          task,
          () => moveCard(task.id, column, { after: afterId }, { eventId: scopeEventId ?? null }),
          column === "done"
            ? t("toast.done", { title: task.title })
            : t("toast.moved", { title: task.title, column: t(`columns.${column}`) }),
        );
      if (movesIntoDone(task, column)) whenDone(task, go);
      else go();
    },
    [run, whenDone, scopeEventId, t],
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
      const go = () =>
        startTransition(async () => {
          apply?.({ kind: "move", id: task.id, column, afterId });
          apply?.({
            kind: "assign",
            id: task.id,
            assigneeId: person?.id ?? null,
            assigneeName: person?.displayName ?? null,
          });
          const moved = await callAction(() =>
            moveCard(task.id, column, { after: afterId }, { eventId: scopeEventId ?? null }),
          );
          if (!moved.ok) return fail(moved, task);
          const assigned = await callAction(() => assignCard(task.id, staffMemberId));
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
            key: `task:${task.id}`,
            actionLabel: t("toast.undo"),
            onAction: async () => {
              // newest change first, so each undo still finds the state it expects
              let failure: string | null = null;
              for (const auditId of audits) {
                const result = await callAction(() => undoChange(auditId));
                if (!result.ok) {
                  failure = result.error;
                  break;
                }
              }
              if (failure) showError(errorText(failure));
              else showToast({ message: t("toast.reverted") });
            },
          });
        });
      if (movesIntoDone(task, column)) whenDone(task, go);
      else go();
    },
    [apply, staff, scopeEventId, fail, showToast, showError, t, errorText, whenDone],
  );

  const setStatus = useCallback(
    (
      task: TaskRef,
      status: TaskStatusKey,
      input: { reason?: string | null; note?: string | null } = {},
    ) => {
      const go = () =>
        run(
          { kind: "status", id: task.id, status },
          task,
          () => setStatusAction(task.id, status, input),
          status === "done"
            ? t("toast.done", { title: task.title })
            : status === "todo" && (task.status === "done" || task.status === "skipped")
              ? t("toast.reopened", { title: task.title })
              : t("toast.status", { title: task.title, status: tTasks(`status.${status}`) }),
        );
      if (status !== "done") return go();
      whenDone(task, go);
    },
    [run, t, tTasks, whenDone],
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

  /** "Löschen" (UT2-13): no question first; the toast offers undo. */
  const remove = useCallback(
    (task: TaskRef) =>
      run(
        { kind: "remove", id: task.id },
        task,
        () => deleteCard(task.id),
        t("toast.deleted", { title: task.title }),
      ),
    [run, t],
  );

  /** "Wiederherstellen" of a deleted task (Verlauf). */
  const restore = useCallback(
    (task: TaskRef) =>
      run(null, task, () => restoreCard(task.id), t("toast.restored", { title: task.title })),
    [run, t],
  );

  /**
   * "Unteraufgabe von…" (`parent`) / "Aus Hauptaufgabe lösen" (null) and the drag in the Checkliste (ADR 0021):
   * applied at once, the toast offers undo (through the `task.parent` audit entry). A refused nesting
   * (`invalid_parent`) is an error toast that says why; the optimistic change reverts with the transition.
   * `from`: the current parent, for the toast of a lift-out.
   */
  const setParent = useCallback(
    (task: TaskRef, parent: TaskRef | null, from: TaskRef | null = null) => {
      startTransition(async () => {
        apply?.({ kind: "parent", id: task.id, parentId: parent?.id ?? null });
        const result = await callAction(() => setParentAction(task.id, parent?.id ?? null));
        if (!result.ok) {
          showError(
            result.error === "invalid_parent"
              ? nestProblemText(result.detail?.[0], task.title, parent?.title ?? "")
              : errorText(result.error),
          );
          return;
        }
        if (!result.data.changed) return;
        showUndo(
          parent
            ? t("toast.nested", { title: task.title, parent: parent.title })
            : from
              ? t("toast.unnestedFrom", { title: task.title, parent: from.title })
              : t("toast.unnested", { title: task.title }),
          result.data.auditId,
          task.id,
        );
      });
    },
    [apply, showError, nestProblemText, errorText, showUndo, t],
  );

  return {
    pending,
    setParent,
    move,
    assign,
    moveAndAssign,
    setStatus,
    snooze,
    unsnooze,
    remove,
    restore,
    errorText,
    drawer,
  };
}

type Result =
  | {
      ok: true;
      data: {
        changed: boolean;
        auditId: string | null;
        /** Status changes: the parent whose subtasks are all finished now (ADR 0021). */
        parentReady?: { id: string; title: string } | null;
      };
    }
  | { ok: false; error: string; detail?: string[]; count?: number };
