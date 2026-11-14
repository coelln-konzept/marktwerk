"use client";

import { Menu } from "@base-ui/react/menu";
import {
  addDays,
  DISTANCE_DAYS_MAX,
  SEASON_STATUSES,
  type SeasonStatus,
  type SeasonStatusBlock,
} from "@marktwerk/core";
import { AlarmClockOff, CalendarPlus, Check, ChevronDown, Pencil } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import {
  createSeasonAction,
  setSeasonExpectedStartAction,
  setSeasonStatusAction,
} from "@/app/(app)/vorlagen/[id]/actions";
import { type OptimisticPatch, useTaskActions } from "@/components/board/use-task-actions";
import { useShell } from "@/components/shell/shell-context";
import { TaskTick, TickMark } from "@/components/task/task-tick";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DueBadge } from "@/components/ui/due-badge";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { rowFocus } from "@/components/ui/table";
import { callAction, NETWORK_ERROR } from "@/lib/call-action";
import { formatDateShort, formatDateShortYear, formatDateWithWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SeasonTaskItem } from "@/server/queries/seasons";
import { SEASON_STATUS_UI } from "./season-status";

/*
 * The interactive parts of the market page's Saison panel (Fahrplan R12): the status switch, "Erwartet ab",
 * "Saison anlegen" and the task rows. Every change applies at once and offers an undo toast (UX concept §6).
 */

function useErrorText() {
  const t = useTranslations("templates.season.errors");
  const tShell = useTranslations("errors");
  return (code: string, season: number) => {
    if (code === NETWORK_ERROR) return tShell("network");
    return t.has(code as never) ? t(code as "outside_season", { season }) : t("generic");
  };
}

/**
 * Task counts as the panel lists them (UX-009): top-level tasks, the subtasks apart ("2 Aufgaben (+4
 * Unteraufgaben)"), so a toast never names more tasks than the panel shows.
 */
function useTaskCount() {
  const t = useTranslations("templates.season.toast");
  return (key: "shifted" | "created", tasks: number, subtasks: number, season = 0) => {
    const text =
      key === "created" ? t("created", { season, count: tasks }) : t(key, { count: tasks });
    return subtasks > 0 ? `${text} (${t("subtasks", { count: subtasks })})` : text;
  };
}

/** Id of a season's status switch: focus goes back there after changes that remove the control just used. */
const statusTriggerId = (season: number) => `season-${season}-status`;

/**
 * Focus to move once a control appears that is not rendered yet ("Saison anlegen" swaps the empty panel for the
 * season, UX-030): the new status switch takes it when it mounts.
 */
let focusOnMount: string | null = null;

/** Moves focus to a season's status switch (it stays mounted while the panel re-renders). */
function focusStatusTrigger(season: number) {
  document.getElementById(statusTriggerId(season))?.focus({ preventScroll: true });
}

/** The season facts the status switch needs. */
export type SeasonRef = {
  id: string;
  season: number;
  status: SeasonStatus;
  /** Why a status is refused (UX-050), per status. */
  statusBlocks: Record<SeasonStatus, SeasonStatusBlock | null>;
  openSeasonTasks: number;
};

/** The status change with its undo toast; the undo is the same call back (`expectedFrom` guards both). */
function useSeasonStatusChange(season: Pick<SeasonRef, "id" | "season" | "status">) {
  const t = useTranslations("templates.season");
  const errorText = useErrorText();
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();

  function change(to: SeasonStatus, after?: () => void) {
    if (pending) return;
    const from = season.status;
    startTransition(async () => {
      const result = await callAction(() => setSeasonStatusAction(season.id, to, from));
      after?.();
      if (!result.ok) {
        showError(errorText(result.error, season.season));
        return;
      }
      showToast({
        message: t("toast.status", { season: season.season, status: t(`status.${to}`) }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await callAction(() => setSeasonStatusAction(season.id, from, to));
          if (undone.ok)
            showToast({
              message: t("toast.status", { season: season.season, status: t(`status.${from}`) }),
            });
          else showError(errorText(undone.error, season.season));
        },
      });
    });
  }
  return { change, pending };
}

/**
 * "Status: <badge> ⌄": every status in the order planning → dates_set → closed with what it means, the current
 * one ticked; a status that contradicts the season's dates or tasks is disabled with the reason (UX-050). The
 * trigger stays enabled while a change runs, so focus stays on it when the menu closes (UX-030).
 */
export function SeasonStatusMenu({ season, canWrite }: { season: SeasonRef; canWrite: boolean }) {
  const t = useTranslations("templates.season");
  const { change, pending } = useSeasonStatusChange(season);
  const ui = SEASON_STATUS_UI[season.status];
  const triggerId = statusTriggerId(season.season);
  useEffect(() => {
    if (focusOnMount !== triggerId) return;
    focusOnMount = null;
    document.getElementById(triggerId)?.focus({ preventScroll: true });
  }, [triggerId]);
  const badge = (
    <StatusBadge tone={ui.tone} icon={ui.icon}>
      {t(`status.${season.status}`)}
    </StatusBadge>
  );
  if (!canWrite)
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-small">
        {t("statusLabel")}: {badge}
      </span>
    );
  return (
    <Menu.Root>
      <Menu.Trigger
        id={triggerId}
        aria-label={t("statusChange", { status: t(`status.${season.status}`) })}
        aria-busy={pending}
        className={cn(
          "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-muted-foreground text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover",
          pending && "cursor-progress",
        )}
      >
        {t("statusLabel")}: {badge}
        <ChevronDown aria-hidden className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="flex w-[280px] max-w-[calc(100vw-2rem)] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
            {SEASON_STATUSES.map((status) => {
              const Icon = SEASON_STATUS_UI[status].icon;
              const on = status === season.status;
              const block = on ? null : season.statusBlocks[status];
              return (
                <Menu.Item
                  key={status}
                  disabled={on || block !== null || pending}
                  onClick={() => change(status)}
                  className="flex min-h-8 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-small outline-hidden data-[disabled]:cursor-default data-[highlighted]:bg-hover"
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn(block && "text-muted-foreground")}>
                      {t(`status.${status}`)}
                    </span>
                    <span className="text-muted-foreground text-tiny">
                      {block
                        ? t(`statusBlocked.${block}`, { count: season.openSeasonTasks })
                        : t(`statusHint.${status}`)}
                    </span>
                  </span>
                  {on && <Check aria-hidden className="mt-0.5 ml-auto size-4 shrink-0" />}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The one-click step the panel suggests ("Auf „Termine stehen“ setzen", "Saison abschließen"). */
export function SeasonSuggestion({
  season,
  to,
}: {
  season: Pick<SeasonRef, "id" | "season" | "status">;
  to: SeasonStatus;
}) {
  const t = useTranslations("templates.season.suggest");
  const { change, pending } = useSeasonStatusChange(season);
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-border-subtle border-t px-4 py-2 text-small">
      <span className="text-foreground-2">{t(`${to}.hint`)}</span>
      <Button
        size="sm"
        aria-busy={pending}
        disabled={pending}
        // The suggestion goes away with the change: focus moves to the status it set (UX-030).
        onClick={() => change(to, () => focusStatusTrigger(season.season))}
      >
        {t(`${to}.action`)}
      </Button>
    </p>
  );
}

/** "Erwartet ab …" with "Ändern": an inline date field while the season has no dates (decision 2026-11-13). */
export function ExpectedStartEditor({
  season,
  canWrite,
}: {
  season: { id: string; season: number; expectedStart: string };
  canWrite: boolean;
}) {
  const t = useTranslations("templates.season");
  const locale = useLocale();
  const errorText = useErrorText();
  const { showToast, showError } = useShell();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(season.expectedStart);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const taskCount = useTaskCount();
  const editButton = useRef<HTMLButtonElement>(null);
  // Closing the field (save, Abbrechen, Esc) gives focus back to "Ändern" (UX-030).
  const returnFocus = useRef(false);
  useEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    editButton.current?.focus({ preventScroll: true });
  }, [editing]);
  const close = () => {
    returnFocus.current = true;
    setEditing(false);
  };

  const message = (date: string, moved: { tasksShifted: number; subtasksShifted: number }) => {
    const text = t("toast.expected", {
      season: season.season,
      date: formatDateWithWeekday(date, locale),
    });
    if (moved.tasksShifted + moved.subtasksShifted === 0) return text;
    return `${text} · ${taskCount("shifted", moved.tasksShifted, moved.subtasksShifted)}`;
  };

  function save() {
    const from = season.expectedStart;
    const to = value;
    if (to === from) {
      close();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await callAction(() => setSeasonExpectedStartAction(season.id, to, from));
      if (!result.ok) {
        // Input problems stay at the field; everything else is a toast.
        if (["invalid_date", "outside_season"].includes(result.error))
          setError(errorText(result.error, season.season));
        else {
          close();
          showError(errorText(result.error, season.season));
        }
        return;
      }
      close();
      showToast({
        message: message(to, result.data),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await callAction(() => setSeasonExpectedStartAction(season.id, from, to));
          if (undone.ok) showToast({ message: message(from, undone.data) });
          else showError(errorText(undone.error, season.season));
        },
      });
    });
  }

  if (!editing)
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">
          {t("start.expected", { date: formatDateWithWeekday(season.expectedStart, locale) })}
        </span>
        {canWrite && (
          <Button
            ref={editButton}
            size="sm"
            variant="ghost"
            aria-label={t("start.editLabel", { season: season.season })}
            onClick={() => {
              setValue(season.expectedStart);
              setError(null);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
            {t("start.edit")}
          </Button>
        )}
      </span>
    );

  return (
    <form
      noValidate
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <label htmlFor={id} className="font-medium">
        {t("start.expectedLabel")}
      </label>
      <Input
        id={id}
        type="date"
        // The field replaces the "Ändern" button that was just pressed.
        autoFocus
        required
        min={`${season.season}-01-01`}
        max={`${season.season}-12-31`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-auto"
      />
      <Button type="submit" variant="default" size="sm" aria-busy={pending} disabled={pending}>
        {t("start.save")}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={close}>
        {t("start.cancel")}
      </Button>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="m-0 basis-full text-small text-status-critical"
        >
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * "Saison anlegen" while the market has no record for that year: the one path `ensureEventSeason`. Without dates
 * it asks for "Erwartet ab" (UX-009: no silent 1 January), prefilled from last year's first date when there is
 * one; with dates the first one is the start and nothing is asked. The toast counts top-level tasks like the
 * panel and says how many were already due and are due today instead. Focus moves to the new season's status.
 */
export function CreateSeasonForm({
  presetId,
  season,
  hasDates,
  suggestedStart,
}: {
  presetId: string;
  season: number;
  hasDates: boolean;
  suggestedStart: string | null;
}) {
  const t = useTranslations("templates.season");
  const errorText = useErrorText();
  const taskCount = useTaskCount();
  const { showToast, showError } = useShell();
  const [value, setValue] = useState(suggestedStart ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function create() {
    if (!hasDates && value === "") {
      setError(t("createForm.required"));
      return;
    }
    setError(null);
    focusOnMount = statusTriggerId(season);
    startTransition(async () => {
      const result = await callAction(() =>
        createSeasonAction(presetId, season, hasDates ? undefined : value),
      );
      if (!result.ok) {
        focusOnMount = null;
        if (["invalid_date", "outside_season"].includes(result.error))
          setError(errorText(result.error, season));
        else showError(errorText(result.error, season));
        return;
      }
      const { topLevelTasks, subtasks, dueToday } = result.data;
      const text = taskCount("created", topLevelTasks, subtasks, season);
      showToast({
        message: dueToday > 0 ? `${text} · ${t("toast.dueToday", { count: dueToday })}` : text,
      });
    });
  }

  if (hasDates)
    return (
      <Button variant="default" aria-busy={pending} disabled={pending} onClick={create}>
        <CalendarPlus aria-hidden />
        {t("create")}
      </Button>
    );

  return (
    <form
      noValidate
      className="flex flex-col items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <span className="flex flex-wrap items-center justify-center gap-2">
        <label htmlFor={id} className="font-medium text-small">
          {t("createForm.label")}
        </label>
        <Input
          id={id}
          type="date"
          required
          min={`${season}-01-01`}
          max={`${season}-12-31`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [suggestedStart ? `${id}-hint` : null, error ? `${id}-error` : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          className="w-auto"
        />
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
          <CalendarPlus aria-hidden />
          {t("create")}
        </Button>
      </span>
      {suggestedStart && (
        <span id={`${id}-hint`} className="text-muted-foreground text-small">
          {t("createForm.suggested")}
        </span>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="m-0 text-small text-status-critical">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * One season task: the shared tick (no question first: the row stays, finished rows move to "Erledigt"), the
 * title opening the task drawer in place (`?aufgabe=<id>`), the due badge with its date, the assignee.
 */
export function SeasonTaskRow({
  presetId,
  task,
  today,
  canWrite,
}: {
  presetId: string;
  task: SeasonTaskItem;
  today: string;
  canWrite: boolean;
}) {
  const t = useTranslations("templates.season");
  const locale = useLocale();
  const [status, apply] = useOptimistic(task.status, (current, patch: OptimisticPatch) =>
    patch.kind === "status" ? patch.status : current,
  );
  const actions = useTaskActions({ staff: [], apply });
  const finished = status === "done" || status === "skipped";
  const href = `/vorlagen/${presetId}?aufgabe=${task.id}` as never;
  const snoozed = !finished && task.snoozedUntil !== null && task.snoozedUntil > today;
  // The badge prints a date of its own beyond two weeks; nearer ones get the date next to it.
  const date =
    task.dueOn && task.dueOn <= addDays(today, DISTANCE_DAYS_MAX)
      ? formatDateShortYear(task.dueOn, locale, today)
      : null;
  const ref = { ...task, status };

  return (
    <li
      data-row
      data-href={href}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey)
          return;
        if (event.key === "e" && canWrite && !finished) {
          event.preventDefault();
          actions.setStatus(ref, "done");
        }
      }}
      className={cn(
        "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-border-subtle border-b px-4 py-1.5 last:border-b-0 hover:bg-hover",
        rowFocus,
      )}
    >
      {canWrite ? (
        <TaskTick
          task={ref}
          disabled={actions.pending}
          onToggle={(next) => actions.setStatus(ref, next)}
        />
      ) : (
        <TickMark status={status} />
      )}
      <Link
        href={href}
        scroll={false}
        className={cn(
          "min-w-0 flex-1 basis-[calc(100%-2.5rem)] font-medium hover:underline sm:basis-0 sm:truncate",
          finished && "text-muted-foreground line-through decoration-muted-foreground",
        )}
      >
        {task.title}
      </Link>
      {!finished &&
        (snoozed && task.snoozedUntil ? (
          <StatusBadge tone="neutral" icon={AlarmClockOff}>
            {t("snoozedUntil", { date: formatDateShort(task.snoozedUntil, locale) })}
          </StatusBadge>
        ) : (
          task.dueOn && (
            <DueBadge dueOn={task.dueOn} today={today} waiting={status === "waiting_external"} />
          )
        ))}
      {date && <span className="tabular text-muted-foreground text-small">{date}</span>}
      <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground text-small sm:w-40">
        {task.assigneeName ? (
          <>
            <span aria-hidden>
              <Avatar name={task.assigneeName} />
            </span>
            <span className="truncate">
              <span className="sr-only">{t("assignee")}: </span>
              {task.assigneeName}
            </span>
          </>
        ) : (
          <span className="text-faint-foreground">{t("unassigned")}</span>
        )}
      </span>
    </li>
  );
}
