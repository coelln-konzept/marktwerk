"use client";

import {
  addDays,
  DISTANCE_DAYS_MAX,
  type KeyTaskRow,
  keyTaskState,
  type MissingTask,
  type TaskStatusKey,
} from "@marktwerk/core";
import { AlarmClockOff, Ban, Circle, CircleCheck, Hourglass } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useOptimistic } from "react";
import { type OptimisticPatch, useTaskActions } from "@/components/board/use-task-actions";
import { DueBadge } from "@/components/ui/due-badge";
import { focusNeighbourRow } from "@/components/ui/keyboard-rows";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { formatDateShort, formatDateShortYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskQuickActions } from "./overview-task-actions";

/*
 * The task rows of the event Überblick ("Was fehlt" and "Kernaufgaben"). Client components so a tick shows at
 * once (optimistic status through the board's `apply`) and E ticks the focused row, like the Ablauf.
 * Both lists draw their due information with the shared DueBadge, so one task looks the same in both.
 */

const taskHref = (eventId: string, taskId: string) =>
  `/veranstaltungen/${eventId}?aufgabe=${taskId}` as never;

const rowFocus =
  "scroll-mt-20 focus-visible:bg-selected focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** The row's status as the user sees it: the tick applies before the server has answered. */
function useOptimisticStatus(status: TaskStatusKey) {
  const [shown, apply] = useOptimistic(status, (current, patch: OptimisticPatch) =>
    patch.kind === "status" ? patch.status : current,
  );
  return { shown, apply };
}

/** The date next to a due badge, unless the badge already prints it (further out than two weeks). */
function useDateText(dueOn: string | null, today: string) {
  const locale = useLocale();
  if (!dueOn || dueOn > addDays(today, DISTANCE_DAYS_MAX)) return null;
  return formatDateShortYear(dueOn, locale, today);
}

// ---------------------------------------------------------------------------------------------
// Was fehlt

/** A task row of "Was fehlt": title, why it is listed (due badge or blocked / waiting), date, quick actions. */
export function MissingTaskRow({
  eventId,
  task,
  today,
  canWrite,
}: {
  eventId: string;
  task: MissingTask;
  today: string;
  canWrite: boolean;
}) {
  const t = useTranslations("eventDetail.overview.missing");
  const { shown, apply } = useOptimisticStatus(task.status);
  const actions = useTaskActions({ staff: [], apply });
  const done = shown === "done";
  const date = useDateText(task.dueOn, today);
  const href = taskHref(eventId, task.id);

  // Overdue, today, soon and a wait that has run past its date are due information: the shared badge.
  // Blocked and a wait without a date are states of their own.
  const dueBased =
    task.dueOn !== null &&
    (task.reason === "overdue" ||
      task.reason === "today" ||
      task.reason === "soon" ||
      (task.reason === "waiting" && task.dueOn < today));
  const stateBadge: { tone: Tone; icon: typeof Ban; text: string } | null = dueBased
    ? null
    : task.reason === "blocked"
      ? { tone: "warn", icon: Ban, text: t("reason.blocked") }
      : { tone: "waiting", icon: Hourglass, text: t("reason.waiting") };

  return (
    <li
      data-row
      data-href={href}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey)
          return;
        if (event.key === "e" && canWrite && !done) {
          event.preventDefault();
          focusNeighbourRow(event.currentTarget);
          actions.setStatus(task, "done");
        }
      }}
      className={cn(
        "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-border-subtle border-b px-4 py-1.5 last:border-b-0 hover:bg-hover",
        rowFocus,
        done && "opacity-60",
      )}
    >
      <Link
        href={href}
        scroll={false}
        className={cn(
          "min-w-0 basis-full font-medium hover:underline sm:basis-0 sm:flex-1 sm:truncate",
          done && "line-through",
        )}
      >
        {task.title}
      </Link>
      {stateBadge ? (
        <StatusBadge tone={stateBadge.tone} icon={stateBadge.icon}>
          {stateBadge.text}
        </StatusBadge>
      ) : (
        task.dueOn && (
          <DueBadge dueOn={task.dueOn} today={today} waiting={task.reason === "waiting"} />
        )
      )}
      {date && <span className="tabular text-muted-foreground text-small">{date}</span>}
      {canWrite && (
        <TaskQuickActions
          task={task}
          today={today}
          pending={actions.pending || done}
          onDone={() => {
            focusNeighbourRow(document.activeElement as HTMLElement | null);
            actions.setStatus(task, "done");
          }}
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Kernaufgaben

const RING: Record<string, string> = {
  overdue: "text-status-critical",
  soon: "text-status-warn",
  waiting: "text-status-waiting",
  snoozed: "text-muted-foreground",
  open: "text-muted-foreground",
};

/**
 * One Kernaufgabe: the leading circle is the checkbox (open = empty ring in the state's colour, done =
 * filled tick), then the title, then the due badge or the plain state. Titles wrap on phones.
 */
export function KeyTaskItem({
  eventId,
  row,
  today,
  canWrite,
}: {
  eventId: string;
  row: KeyTaskRow;
  today: string;
  canWrite: boolean;
}) {
  const t = useTranslations("eventDetail.overview.key");
  const tTasks = useTranslations("tasks");
  const locale = useLocale();
  const { shown, apply } = useOptimisticStatus(row.status);
  const actions = useTaskActions({ staff: [], apply });
  const state = keyTaskState({ ...row, status: shown }, today) ?? row.state;
  const done = state === "done";
  const date = useDateText(row.dueOn, today);
  const href = taskHref(eventId, row.id);

  const mark = done ? (
    <CircleCheck aria-hidden className="size-5 text-status-ok" />
  ) : (
    <Circle aria-hidden className={cn("size-5", RING[state])} strokeWidth={2} />
  );

  return (
    <li
      data-row
      data-href={href}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey)
          return;
        if (event.key === "e" && canWrite && !done) {
          event.preventDefault();
          focusNeighbourRow(event.currentTarget);
          actions.setStatus(row, "done");
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-x-2.5 border-border-subtle border-b px-4 py-1.5 last:border-b-0 hover:bg-hover",
        rowFocus,
      )}
    >
      {canWrite ? (
        <button
          type="button"
          disabled={actions.pending}
          title={done ? tTasks("statusReopen") : tTasks("quickDone.label")}
          aria-label={
            done
              ? tTasks("reopenAria", { title: row.title })
              : tTasks("quickDone.aria", { title: row.title })
          }
          aria-pressed={done}
          onClick={() => actions.setStatus(row, done ? "todo" : "done")}
          className="group/check -ml-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-status-ok-bg focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60 touch:size-10"
        >
          {done ? (
            mark
          ) : (
            <>
              <span className="group-hover/check:hidden">{mark}</span>
              <CircleCheck
                aria-hidden
                className="hidden size-5 text-status-ok group-hover/check:block"
              />
            </>
          )}
        </button>
      ) : (
        mark
      )}
      <Link
        href={href}
        scroll={false}
        className={cn(
          "min-w-0 flex-1 break-words hover:underline sm:truncate",
          done && "text-muted-foreground",
        )}
      >
        {row.title}
      </Link>
      {done ? (
        <span className="whitespace-nowrap font-medium text-small text-status-ok">
          {t("state.done")}
        </span>
      ) : state === "snoozed" && row.snoozedUntil ? (
        <StatusBadge tone="neutral" icon={AlarmClockOff}>
          {t("state.snoozed")}{" "}
          {t("snoozedUntil", { date: formatDateShort(row.snoozedUntil, locale) })}
        </StatusBadge>
      ) : row.dueOn ? (
        <>
          <DueBadge dueOn={row.dueOn} today={today} waiting={state === "waiting"} />
          {date && (
            <span className="tabular hidden whitespace-nowrap text-muted-foreground text-small sm:inline">
              {date}
            </span>
          )}
        </>
      ) : (
        <span className="whitespace-nowrap font-medium text-muted-foreground text-small">
          {t("state.open")}
        </span>
      )}
    </li>
  );
}
