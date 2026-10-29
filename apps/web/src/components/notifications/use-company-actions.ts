"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import {
  restoreCompanyAction,
  setCompanyStateAction,
  snoozeCompanyAction,
} from "@/app/(app)/benachrichtigungen/actions";
import { useTaskActions } from "@/components/board/use-task-actions";
import { useShell } from "@/components/shell/shell-context";
import { formatDateWeekdayDay } from "@/lib/format";
import type { CompanyNotificationRow } from "@/server/queries/notifications";

export type CompanyActionRow = Pick<
  CompanyNotificationRow,
  "id" | "title" | "subjectType" | "subjectId" | "taskSnoozed" | "notificationSnoozed"
> & {
  taskStatus: string | null;
};

const FINISHED_TASK = ["done", "skipped"];

/** The task behind a row, as the task actions want it. */
const taskRef = (row: CompanyActionRow) => ({
  id: row.subjectId,
  title: row.title,
  status: row.taskStatus as never,
});

/**
 * Actions of the notification center and the bell, each with an undo toast. On a task, "Erledigt",
 * "Zurückstellen" and "Wieder öffnen" act on the task itself (tasks service, its own undo), so the item
 * leaves or returns to Übersicht, center and bell together; the notification follows. On a permit they
 * only change the notification (decision 2026-10-29).
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
    (row: CompanyActionRow) => {
      if (row.subjectType === "task" && row.taskStatus) {
        taskActions.setStatus(taskRef(row), "done");
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

  /**
   * "Wieder öffnen" / "Zurückstellung aufheben". A snoozed task ends its snooze; a finished task is
   * reopened; everything else only reopens the notification.
   */
  const reopen = useCallback(
    (row: CompanyActionRow) => {
      if (row.subjectType === "task" && row.taskStatus) {
        const finished = FINISHED_TASK.includes(row.taskStatus);
        if (finished || row.taskSnoozed) {
          if (finished) taskActions.setStatus(taskRef(row), "todo");
          else taskActions.unsnooze(taskRef(row));
          // A snooze set on the notification itself (before the task snooze existed) ends with it.
          if (!finished && row.notificationSnoozed) void setCompanyStateAction(row.id, "unread");
          return;
        }
      }
      startTransition(async () => {
        const result = await setCompanyStateAction(row.id, "unread");
        if (!result.ok) return showToast({ message: errorText(result.error) });
        if (result.data.changed)
          undoable(row.id, t("toast.reopened", { title: row.title }), result.data.previous);
      });
    },
    [taskActions, showToast, errorText, undoable, t],
  );

  /** `until` is `YYYY-MM-DD`, after today. */
  const snooze = useCallback(
    (row: CompanyActionRow, until: string) => {
      if (row.subjectType === "task" && row.taskStatus) {
        taskActions.snooze(taskRef(row), until);
        return;
      }
      startTransition(async () => {
        const result = await snoozeCompanyAction(row.id, until);
        if (!result.ok) return showToast({ message: errorText(result.error) });
        undoable(
          row.id,
          t("toast.snoozed", { title: row.title, date: formatDateWeekdayDay(until, locale) }),
          result.data.previous,
        );
      });
    },
    [taskActions, showToast, errorText, undoable, t, locale],
  );

  /** Opening an item marks it read (quietly, no toast). */
  const markRead = useCallback((id: string) => {
    void setCompanyStateAction(id, "read");
  }, []);

  return { done, reopen, snooze, markRead, pending: pending || taskActions.pending };
}
