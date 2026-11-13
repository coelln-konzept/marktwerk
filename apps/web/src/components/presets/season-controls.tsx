"use client";

import { Menu } from "@base-ui/react/menu";
import { addDays, DISTANCE_DAYS_MAX, SEASON_STATUSES, type SeasonStatus } from "@marktwerk/core";
import { AlarmClockOff, CalendarPlus, Check, ChevronDown, Pencil } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useId, useOptimistic, useState, useTransition } from "react";
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

/** The status change with its undo toast; the undo is the same call back (`expectedFrom` guards both). */
function useSeasonStatusChange(season: { id: string; season: number; status: SeasonStatus }) {
  const t = useTranslations("templates.season");
  const errorText = useErrorText();
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();

  function change(to: SeasonStatus) {
    const from = season.status;
    startTransition(async () => {
      const result = await callAction(() => setSeasonStatusAction(season.id, to, from));
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

/** "Status: <badge> ⌄": every status in the order planning → dates_set → closed, the current one ticked. */
export function SeasonStatusMenu({
  season,
  canWrite,
}: {
  season: { id: string; season: number; status: SeasonStatus };
  canWrite: boolean;
}) {
  const t = useTranslations("templates.season");
  const { change, pending } = useSeasonStatusChange(season);
  const ui = SEASON_STATUS_UI[season.status];
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
        aria-label={t("statusChange", { status: t(`status.${season.status}`) })}
        aria-busy={pending}
        disabled={pending}
        className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-muted-foreground text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress data-[popup-open]:bg-hover"
      >
        {t("statusLabel")}: {badge}
        <ChevronDown aria-hidden className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="flex min-w-[220px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
            {SEASON_STATUSES.map((status) => {
              const Icon = SEASON_STATUS_UI[status].icon;
              const on = status === season.status;
              return (
                <Menu.Item
                  key={status}
                  disabled={on}
                  onClick={() => change(status)}
                  className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[highlighted]:bg-hover"
                >
                  <Icon aria-hidden className="size-4 text-muted-foreground" />
                  {t(`status.${status}`)}
                  {on && <Check aria-hidden className="ml-auto size-4" />}
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
  season: { id: string; season: number; status: SeasonStatus };
  to: SeasonStatus;
}) {
  const t = useTranslations("templates.season.suggest");
  const { change, pending } = useSeasonStatusChange(season);
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-border-subtle border-t px-4 py-2 text-small">
      <span className="text-foreground-2">{t(`${to}.hint`)}</span>
      <Button size="sm" aria-busy={pending} disabled={pending} onClick={() => change(to)}>
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

  const message = (date: string, shifted: number) => {
    const text = t("toast.expected", {
      season: season.season,
      date: formatDateWithWeekday(date, locale),
    });
    return shifted > 0 ? `${text} · ${t("toast.shifted", { count: shifted })}` : text;
  };

  function save() {
    const from = season.expectedStart;
    const to = value;
    if (to === from) {
      setEditing(false);
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
          setEditing(false);
          showError(errorText(result.error, season.season));
        }
        return;
      }
      setEditing(false);
      showToast({
        message: message(to, result.data.tasksShifted),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await callAction(() => setSeasonExpectedStartAction(season.id, from, to));
          if (undone.ok) showToast({ message: message(from, undone.data.tasksShifted) });
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
          setEditing(false);
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
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
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

/** "Saison anlegen" while the market has no record for that year: the one path `ensureEventSeason`. */
export function CreateSeasonButton({ presetId, season }: { presetId: string; season: number }) {
  const t = useTranslations("templates.season");
  const errorText = useErrorText();
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="default"
      aria-busy={pending}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await callAction(() => createSeasonAction(presetId, season));
          if (!result.ok) showError(errorText(result.error, season));
          else showToast({ message: t("toast.created", { season, count: result.data.tasks }) });
        })
      }
    >
      <CalendarPlus aria-hidden />
      {t("create")}
    </Button>
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
