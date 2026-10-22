"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import {
  restoreCompanyAction,
  setCompanyStateAction,
  snoozeCompanyAction,
} from "@/app/(app)/benachrichtigungen/actions";
import { useTaskActions } from "@/components/board/use-task-actions";
import { formatInstant } from "@/components/event-detail/format-instant";
import { useShell } from "@/components/shell/shell-context";
import type { CompanyNotificationRow } from "@/server/queries/notifications";

type RowRef = Pick<CompanyNotificationRow, "id" | "title" | "subjectType" | "subjectId"> & {
  taskStatus: string | null;
};

/**
 * Actions of the notification center and the bell, each with an undo toast. "Erledigt" on a task completes
 * the task itself (tasks service, its own undo) and the notification resolves with it; on a permit it only
 * marks the notification done.
 */
export function useCompanyActions() {
  const t = useTranslations("notificationCenter");
  const locale = useLocale();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const taskActions = useTaskActions({ staff: [] });

  const errorText = useCallback(
    (code: string) =>
      t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic"),
    [t],
  );

  const undoable = useCallback(
    (id: string, message: string, previous: Parameters<typeof restoreCompanyAction>[1]) =>
      showToast({
        message,
        actionLabel: t("actions.undo"),
        onAction: async () => {
          const result = await restoreCompanyAction(id, previous);
          showToast({ message: result.ok ? t("toast.restored") : errorText(result.error) });
        },
      }),
    [showToast, t, errorText],
  );

  const done = useCallback(
    (row: RowRef) => {
      if (row.subjectType === "task" && row.taskStatus) {
        taskActions.setStatus(
          { id: row.subjectId, title: row.title, status: row.taskStatus as never },
          "done",
        );
        return;
      }
      startTransition(async () => {
        const result = await setCompanyStateAction(row.id, "done");
        if (!result.ok) return showToast({ message: errorText(result.error) });
        if (result.data.changed)
          undoable(row.id, t("toast.done", { title: row.title }), result.data.previous);
      });
    },
    [taskActions, showToast, errorText, undoable, t],
  );

  const reopen = useCallback(
    (row: Pick<RowRef, "id">) =>
      startTransition(async () => {
        const result = await setCompanyStateAction(row.id, "unread");
        if (!result.ok) return showToast({ message: errorText(result.error) });
        if (result.data.changed) undoable(row.id, t("toast.reopened"), result.data.previous);
      }),
    [showToast, errorText, undoable, t],
  );

  const snooze = useCallback(
    (row: Pick<RowRef, "id">, until: string) =>
      startTransition(async () => {
        const result = await snoozeCompanyAction(row.id, until);
        if (!result.ok) return showToast({ message: errorText(result.error) });
        undoable(
          row.id,
          t("toast.snoozed", { when: formatInstant(new Date(result.data.until), locale) }),
          result.data.previous,
        );
      }),
    [showToast, errorText, undoable, t, locale],
  );

  /** Opening an item marks it read (quietly, no toast). */
  const markRead = useCallback((id: string) => {
    void setCompanyStateAction(id, "read");
  }, []);

  return { done, reopen, snooze, markRead, pending: pending || taskActions.pending };
}
