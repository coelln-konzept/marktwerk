"use client";

import {
  Camera,
  CircleCheck,
  Clock,
  GripVertical,
  ListChecks,
  NotebookPen,
  Paperclip,
  Undo2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { RolloverBadge } from "@/components/ui/status-badge";
import { formatEstimate } from "@/lib/task-ui";
import { cn } from "@/lib/utils";
import type { BoardTask } from "@/server/queries/tasks";
import { useBoard } from "./board-context";
import { CardMenu } from "./card-menu";
import { CategoryTag, DueLine, TaskStatusBadge } from "./task-bits";

/**
 * Kanban card (component inventory): grip, category tag, ↻n carry-over badge, status, title (opens the
 * drawer), tick-off, estimate, due-ness, assignee. Keyboard: the grip lifts (Space), arrows move, Space
 * drops, Esc cancels; on the card E ticks off, A opens the menu, Enter opens the drawer.
 */
export function TaskCard({ task }: { task: BoardTask }) {
  const t = useTranslations("board");
  const tTasks = useTranslations("tasks");
  const locale = useLocale();
  const board = useBoard();
  const { actions, lift, canWrite } = board;
  const [menuOpen, setMenuOpen] = useState(false);
  const lifted = lift?.id === task.id;
  const finished = task.status === "done" || task.status === "skipped";

  function onGripKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!canWrite) return;
    const key = event.key;
    if (key === " " || key === "Enter") {
      event.preventDefault();
      if (lifted) board.drop();
      else board.pick(task);
    } else if (lifted) {
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        board.cancelLift();
      } else if (move[key]) {
        event.preventDefault();
        board.moveLift(...(move[key] as [number, number]));
      }
    }
  }

  function onCardKey(event: React.KeyboardEvent<HTMLLIElement>) {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).closest("a")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "e" && canWrite && !finished) {
      event.preventDefault();
      actions.setStatus(task, "done");
    } else if (event.key === "a" && (board.canAssign || canWrite)) {
      event.preventDefault();
      setMenuOpen(true);
    }
  }

  return (
    <li
      data-card={task.id}
      onKeyDown={onCardKey}
      aria-label={undefined}
      className={cn(
        "relative flex gap-0.5 rounded-lg border bg-card py-2 pr-1.5 pl-0.5 shadow-card",
        lifted && "opacity-60 ring-2 ring-ring",
        finished && "bg-surface-2",
      )}
    >
      {board.liftable ? (
        <button
          type="button"
          data-grip={task.id}
          aria-pressed={lifted}
          aria-label={t("card.grip", { title: task.title })}
          title={t("card.gripHint")}
          onKeyDown={onGripKey}
          className="grid w-5 shrink-0 cursor-grab place-items-start rounded pt-0.5 text-faint-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      ) : (
        <span className="w-2 shrink-0" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-1">
          <div className="flex flex-wrap items-center gap-1">
            <CategoryTag category={task.category} />
            {task.rolloverCount > 0 && (
              <RolloverBadge
                count={task.rolloverCount}
                label={tTasks("rollover", { count: task.rolloverCount })}
              />
            )}
            {task.status !== "todo" && !(finished && task.status === "done") && (
              <TaskStatusBadge status={task.status} reason={task.waitingReason} />
            )}
          </div>
          <CardMenu task={task} open={menuOpen} onOpenChange={setMenuOpen} />
        </div>

        <Link
          href={actions.drawer.open(task.id) as never}
          scroll={false}
          className={cn(
            "rounded-sm text-left font-medium text-body leading-snug outline-none hover:underline focus-visible:outline-2 focus-visible:outline-ring",
            finished && "text-foreground-2",
          )}
        >
          {task.title}
        </Link>

        {board.showEvent && task.eventName && (
          <Link
            href={`/veranstaltungen/${task.eventId}/board` as never}
            className="truncate text-muted-foreground text-tiny hover:underline"
          >
            {task.eventName}
          </Link>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {canWrite &&
            (finished ? (
              <button
                type="button"
                onClick={() => actions.setStatus(task, "todo")}
                aria-label={t("card.reopen", { title: task.title })}
                title={t("menu.reopen")}
                className="grid size-6 cursor-pointer place-items-center rounded-full text-status-ok outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Undo2 aria-hidden className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => actions.setStatus(task, "done")}
                aria-label={t("card.complete", { title: task.title })}
                title={t("card.completeHint")}
                className="grid size-6 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:bg-status-ok-bg hover:text-status-ok focus-visible:outline-2 focus-visible:outline-ring"
              >
                <CircleCheck aria-hidden className="size-4" />
              </button>
            ))}
          <span className="tabular inline-flex items-center gap-1 text-foreground-2 text-tiny">
            <Clock aria-hidden className="size-3.5" />
            <span className="sr-only">{tTasks("estimate")}: </span>
            {formatEstimate(task.estimateMinutes, locale)}
          </span>
          <DueLine
            dueOn={task.dueOn}
            today={board.today}
            status={task.status}
            completedOn={task.completedOn}
          />
          <span className="ml-auto flex items-center gap-1.5">
            {task.checkTotal > 0 && (
              <span className="tabular inline-flex items-center gap-1 text-muted-foreground text-tiny">
                <ListChecks aria-hidden className="size-3.5" />
                <span className="sr-only">{tTasks("checks")}: </span>
                {task.checkDone}/{task.checkTotal}
              </span>
            )}
            {task.requiresNote && !finished && (
              <NotebookPen
                aria-label={tTasks("evidence.note")}
                className="size-3.5 text-muted-foreground"
              />
            )}
            {task.requiresPhoto && !finished && (
              <Camera
                aria-label={tTasks("evidence.photo")}
                className="size-3.5 text-muted-foreground"
              />
            )}
            {task.requiresAttachment && !finished && (
              <Paperclip
                aria-label={tTasks("evidence.attachment")}
                className="size-3.5 text-muted-foreground"
              />
            )}
            {task.assigneeName ? (
              <Avatar name={task.assigneeName} />
            ) : (
              <span
                title={t("card.unassigned")}
                className="grid size-6 place-items-center rounded-full border border-input border-dashed text-faint-foreground"
              >
                <UserRound aria-hidden className="size-3.5" />
                <span className="sr-only">{t("card.unassigned")}</span>
              </span>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}
