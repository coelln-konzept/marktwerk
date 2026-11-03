"use client";

import { type AblaufPhase, addDays, daysBetween, groupAblauf, taskDueness } from "@marktwerk/core";
import { AlarmClockOff, Camera } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { TaskTick, TickMark } from "@/components/task/task-tick";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { formatDateShort, formatDateWeekdayDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardTask } from "@/server/queries/tasks";
import { useBoard } from "./board-context";
import { CardMenu } from "./card-menu";
import { DueLine, TaskStatusBadge } from "./task-bits";

const isFinished = (task: BoardTask) => task.status === "done" || task.status === "skipped";

/** Days before the first market day each "before" phase covers (inclusive), for the header's date range. */
const BEFORE_RANGE: Partial<Record<AblaufPhase, [number, number | null]>> = {
  early: [29, null],
  weeks_4: [15, 28],
  weeks_2: [8, 14],
  week: [1, 7],
};

/**
 * The event's Checkliste ("Ablauf" view, UX decision 2026-10-24; user test 2026-11): every task in one
 * list, single-line rows with aligned columns (tick, title, category, due, date, menu), grouped by phase
 * relative to the market day with sticky headers. Finished tasks stay in place and must read as done at a
 * glance: filled green tick, tinted row, struck-through dimmed title. Open ones keep an empty circle and
 * full-contrast text. Click a row (or Enter) for the drawer, J/K move, E ticks off or unticks; all changes
 * go through the board's task actions (undo toasts).
 */
export function AblaufList({
  tasks,
  startsOn,
  endsOn,
}: {
  tasks: BoardTask[];
  startsOn: string;
  endsOn: string;
}) {
  const t = useTranslations("board.ablauf");
  const locale = useLocale();
  const { today } = useBoard();
  const groups = groupAblauf(tasks, { today, startsOn, endsOn });

  function rangeOf(phase: AblaufPhase): string | null {
    const range = BEFORE_RANGE[phase];
    if (range) {
      const [from, to] = range;
      const last = formatDateShort(addDays(startsOn, -from), locale);
      if (to === null) return t("until", { date: last });
      // Finished tasks keep their place, so the range is the whole phase, past days included.
      const first = formatDateShort(addDays(startsOn, -to), locale);
      // One day left of the range: a single date, not "Fr 30.10. – Fr 30.10.".
      return first === last ? last : `${first} – ${last}`;
    }
    if (phase === "event") {
      const days = daysBetween(today, startsOn);
      const when =
        days === 0
          ? t("today")
          : days === 1
            ? t("tomorrow")
            : days > 1
              ? t("inDays", { days })
              : null;
      const date =
        startsOn === endsOn
          ? formatDateShort(startsOn, locale)
          : `${formatDateShort(startsOn, locale)} – ${formatDateShort(endsOn, locale)}`;
      return when ? `${date} · ${when}` : date;
    }
    if (phase === "after") return t("from", { date: formatDateShort(addDays(endsOn, 1), locale) });
    return null;
  }

  if (tasks.length === 0) return null;
  const done = (rows: BoardTask[]) => rows.filter(isFinished).length;

  return (
    <KeyboardRows className="rounded-xl border bg-card">
      {groups.map(({ phase, tasks: rows }) => {
        const label =
          phase === "event" && startsOn !== endsOn ? t("phases.eventDays") : t(`phases.${phase}`);
        const header = (
          <>
            <span className="font-semibold text-body">{label}</span>
            {rangeOf(phase) && (
              <span className="tabular text-muted-foreground text-small">{rangeOf(phase)}</span>
            )}
            <span className="tabular ml-auto text-muted-foreground text-small">
              {done(rows) > 0
                ? t("countDone", { done: done(rows), count: rows.length })
                : t("count", { count: rows.length })}
            </span>
          </>
        );
        const list = (
          <ul className="m-0 list-none p-0">
            {rows.map((task) => (
              <AblaufRow key={task.id} task={task} />
            ))}
          </ul>
        );
        return (
          <section
            key={phase}
            aria-label={label}
            className="border-border-subtle border-t first:border-t-0"
          >
            <h2
              className={cn(
                "sticky top-14 z-[1] m-0 flex min-h-10 flex-wrap items-baseline gap-x-3 border-border-subtle border-b bg-card px-4 py-2",
                phase === "now" && "text-status-critical",
              )}
            >
              {header}
            </h2>
            {list}
          </section>
        );
      })}
    </KeyboardRows>
  );
}

function AblaufRow({ task }: { task: BoardTask }) {
  const tTasks = useTranslations("tasks");
  const locale = useLocale();
  const { actions, canWrite, today } = useBoard();
  const [menuOpen, setMenuOpen] = useState(false);
  const finished = isFinished(task);
  const href = actions.drawer.open(task.id);
  const showStatus = task.status !== "todo" && !finished;
  // The date has its own column; the due column only speaks up when it adds something
  // (overdue, today, waiting since …) or says when a finished task was done.
  const dueKind = taskDueness(task, today).kind;
  const showDue =
    finished || dueKind === "overdue" || dueKind === "today" || dueKind === "waiting_since";
  const due = showDue ? (
    <DueLine dueOn={task.dueOn} today={today} status={task.status} completedOn={task.completedOn} />
  ) : null;

  function onKeyDown(event: React.KeyboardEvent<HTMLLIElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "e" && canWrite) {
      event.preventDefault();
      // The row stays where it is (Checkliste), so focus stays on it too.
      actions.setStatus(task, finished ? "todo" : "done");
    } else if (event.key === "a" && canWrite) {
      event.preventDefault();
      setMenuOpen(true);
    }
  }

  return (
    <li
      data-row
      data-href={href}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter/E (KeyboardRows)
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        "scroll-mt-28 grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-x-2 border-border-subtle border-b px-2 py-1.5 last:border-b-0 hover:bg-hover focus-visible:bg-selected focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[2rem_minmax(0,1fr)_8rem_10rem_6rem_2rem] sm:py-1",
        finished && "bg-sunken",
      )}
    >
      <span className="grid place-items-center">
        {canWrite ? (
          <TaskTick task={task} onToggle={(next) => actions.setStatus(task, next)} />
        ) : (
          <TickMark status={task.status} />
        )}
      </span>

      <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {task.isKey && <KeyTaskMark className="shrink-0" />}
          <Link
            href={href as never}
            scroll={false}
            tabIndex={-1}
            title={task.title}
            className={cn(
              "line-clamp-2 break-words rounded-sm font-medium hover:underline sm:line-clamp-1",
              finished && "text-muted-foreground line-through decoration-muted-foreground",
            )}
          >
            {task.title}
          </Link>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {showStatus && <TaskStatusBadge status={task.status} reason={task.waitingReason} />}
          {task.snoozedUntil && !finished && (
            <span className="tabular inline-flex items-center gap-1 text-muted-foreground text-tiny">
              <AlarmClockOff aria-hidden className="size-3.5" />
              {tTasks("snooze.until", { date: formatDateWeekdayDay(task.snoozedUntil, locale) })}
            </span>
          )}
          {task.requiresPhoto && !finished && (
            <Camera
              aria-label={tTasks("evidence.photo")}
              className="size-3.5 text-muted-foreground"
            />
          )}
          {/* Phone: category and due-ness sit under the title instead of in their own columns. */}
          <span className="text-muted-foreground text-tiny sm:hidden">
            {tTasks(`categories.${task.category}` as never)}
          </span>
          <span className="sm:hidden">{due}</span>
          {!showDue && task.dueOn && (
            <span className="tabular text-muted-foreground text-tiny sm:hidden">
              {formatDateShort(task.dueOn, locale)}
            </span>
          )}
        </span>
      </span>

      <span className="hidden truncate text-muted-foreground text-small sm:block">
        {tTasks(`categories.${task.category}` as never)}
      </span>
      <span className="hidden sm:block">{due}</span>
      <span className="tabular hidden text-right text-muted-foreground text-small sm:block">
        {task.dueOn ? formatDateShort(task.dueOn, locale) : ""}
      </span>
      <span className="grid place-items-center">
        <CardMenu task={task} open={menuOpen} onOpenChange={setMenuOpen} />
      </span>
    </li>
  );
}
