"use client";

import type { TaskStatusKey } from "@marktwerk/core";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTaskActions } from "@/components/board/use-task-actions";
import { SnoozeMenu } from "@/components/task/snooze";

/**
 * The two quick actions of a "Was fehlt" row: "Erledigt" and the snooze menu. Both apply at once and
 * confirm with an undo toast; a task that still needs evidence opens its drawer instead. A row that wants its
 * tick to show before the server answers passes its own `onDone` (and `pending`).
 */
export function TaskQuickActions({
  task,
  today,
  pending,
  onDone,
}: {
  task: { id: string; title: string; status: TaskStatusKey };
  today: string;
  /** A change is on its way (or the row is already ticked): the button waits. */
  pending?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("eventDetail.overview.missing");
  const actions = useTaskActions({ staff: [] });
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        disabled={pending ?? actions.pending}
        title={t("done")}
        aria-label={t("doneLabel", { title: task.title })}
        onClick={onDone ?? (() => actions.setStatus(task, "done"))}
        className="inline-grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-hover hover:text-status-ok focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60"
      >
        <Check aria-hidden className="size-4" />
      </button>
      <SnoozeMenu task={task} today={today} />
    </span>
  );
}
