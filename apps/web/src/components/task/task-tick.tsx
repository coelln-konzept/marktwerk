"use client";

import type { TaskStatusKey } from "@marktwerk/core";
import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Done and skipped count as finished: the tick shows them filled, and a click reopens. */
export const isTickFinished = (status: TaskStatusKey) => status === "done" || status === "skipped";

/**
 * The checkbox of a task row. Done: a filled green circle with a tick; skipped: a filled grey one with a
 * dash; open: an empty ring that previews the tick on hover (inside a `group/tick`). Shape and fill differ,
 * not only the colour.
 */
export function TickMark({ status, className }: { status: TaskStatusKey; className?: string }) {
  if (status === "done")
    return (
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full bg-status-ok-dot text-card group-hover/tick:opacity-80",
          className,
        )}
      >
        <Check aria-hidden strokeWidth={3} className="size-3.5" />
      </span>
    );
  if (status === "skipped")
    return (
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full bg-muted-foreground text-card group-hover/tick:opacity-80",
          className,
        )}
      >
        <Minus aria-hidden strokeWidth={3} className="size-3.5" />
      </span>
    );
  return (
    <span
      className={cn(
        "grid size-5 place-items-center rounded-full border-2 border-muted-foreground text-transparent group-hover/tick:border-status-ok group-hover/tick:text-status-ok",
        className,
      )}
    >
      <Check aria-hidden strokeWidth={3} className="size-3" />
    </span>
  );
}

/**
 * The one "Erledigt" control of every task row (Übersicht, Was fehlt, Checkliste), always the row's leading
 * element. An open task is ticked off; a finished one (done or skipped) reopens on a second click. The caller
 * owns the action, so each place keeps its own confirmation, optimistic update and undo toast.
 */
export function TaskTick({
  task,
  onToggle,
  disabled,
}: {
  task: { title: string; status: TaskStatusKey };
  /** Called with the status to set: `done` for an open task, `todo` for a finished one. */
  onToggle: (next: "done" | "todo") => void;
  disabled?: boolean;
}) {
  const t = useTranslations("tasks");
  const finished = isTickFinished(task.status);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(finished ? "todo" : "done")}
      aria-pressed={finished}
      aria-label={
        finished
          ? t("reopenAria", { title: task.title })
          : t("quickDone.aria", { title: task.title })
      }
      title={finished ? t("reopen") : t("quickDone.hint")}
      className="group/tick grid size-7 shrink-0 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60 touch:size-10"
    >
      <TickMark status={task.status} />
    </button>
  );
}
