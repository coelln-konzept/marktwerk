"use client";

import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTaskActions } from "@/components/board/use-task-actions";
import { Button } from "@/components/ui/button";

/**
 * "Wiederherstellen" on a Verlauf entry that finished a task (user test 2026-11, UT-06) or deleted it (UT2-13):
 * reopens or brings it back through the same path as the board, with its own undo toast; the page refreshes and
 * the entry loses the button.
 */
export function RestoreTaskButton({
  taskId,
  title,
  deleted = false,
}: {
  taskId: string;
  title: string;
  deleted?: boolean;
}) {
  const t = useTranslations("eventDetail.history");
  const actions = useTaskActions({ staff: [] });
  return (
    <Button
      size="sm"
      disabled={actions.pending}
      aria-label={t(deleted ? "restoreDeletedAria" : "restoreAria", { title })}
      onClick={() =>
        deleted
          ? actions.restore({ id: taskId, title, status: "cancelled" })
          : actions.setStatus({ id: taskId, title, status: "done" }, "todo")
      }
    >
      <Undo2 aria-hidden />
      {t("restore")}
    </Button>
  );
}
