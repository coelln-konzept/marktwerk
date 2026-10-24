"use client";

import type { TaskStatusKey } from "@marktwerk/core";
import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTaskActions } from "@/components/board/use-task-actions";

/**
 * The task's leading icon as a one-click "Erledigt" (Übersicht rows). Applies at once with an undo
 * toast; a task that still needs evidence opens its drawer instead (same path as the board).
 */
export function TaskDoneButton({
  task,
}: {
  task: { id: string; title: string; status: TaskStatusKey };
}) {
  const t = useTranslations("tasks.quickDone");
  const actions = useTaskActions({ staff: [] });
  return (
    <button
      type="button"
      disabled={actions.pending}
      title={t("label")}
      aria-label={t("aria", { title: task.title })}
      onClick={() => actions.setStatus(task, "done")}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg bg-status-neutral-bg text-foreground-2 outline-none hover:bg-status-ok-bg hover:text-status-ok focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60"
    >
      <CircleCheck aria-hidden className="size-4" />
    </button>
  );
}

/**
 * The status icon of a checklist row (event Überblick → Kernaufgaben) as a checkbox: an open task is marked
 * "Erledigt", a finished one reopens. Both apply at once with an undo toast (same path as the board).
 */
export function TaskCheckToggle({
  task,
  children,
}: {
  task: { id: string; title: string; status: TaskStatusKey };
  /** The row's state icon. */
  children: React.ReactNode;
}) {
  const t = useTranslations("tasks");
  const actions = useTaskActions({ staff: [] });
  const done = task.status === "done";
  return (
    <button
      type="button"
      disabled={actions.pending}
      title={done ? t("statusReopen") : t("quickDone.label")}
      aria-label={
        done ? t("reopenAria", { title: task.title }) : t("quickDone.aria", { title: task.title })
      }
      aria-pressed={done}
      onClick={() => actions.setStatus(task, done ? "todo" : "done")}
      className="group/check -m-1.5 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md outline-none hover:bg-status-ok-bg focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60"
    >
      {done ? (
        children
      ) : (
        <>
          <span className="group-hover/check:hidden">{children}</span>
          <CircleCheck
            aria-hidden
            className="hidden size-4 text-status-ok group-hover/check:block"
          />
        </>
      )}
    </button>
  );
}
