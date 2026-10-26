"use client";

import { Menu } from "@base-ui/react/menu";
import { CalendarSearch, CircleCheck, Clock, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { SnoozeDialog, useSnoozePresets } from "@/components/task/snooze";
import { buttonVariants } from "@/components/ui/button";
import { DueBadge } from "@/components/ui/due-badge";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { MarketMarker } from "@/components/ui/market-marker";
import { type DueState, dueStateOf } from "@/lib/due-ui";
import { formatDateWeekdayDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompanyNotificationRow } from "@/server/queries/notifications";
import { useCompanyActions } from "./use-company-actions";

const menuPopup =
  "flex min-w-[200px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-none";
const menuItem =
  "flex min-h-8 cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1 text-small outline-none data-[highlighted]:bg-hover";
const small = cn(buttonVariants({ variant: "outline", size: "sm" }));

/**
 * The due state of a notification in the one vocabulary (`lib/due-ui.ts`); an expired permit keeps its own
 * word ("Abgelaufen") but the red octagon of everything overdue.
 */
export function useDueInfo() {
  const t = useTranslations("notificationCenter");
  return (
    row: Pick<CompanyNotificationRow, "dueOn" | "kind">,
    today: string,
  ): { state: DueState; label?: string } | null => {
    if (!row.dueOn) return null;
    const state = dueStateOf({ dueOn: row.dueOn, today });
    if (state.kind === "overdue" && row.kind === "permit_expiry")
      return { state, label: t("due.expired", { count: state.days }) };
    return { state };
  };
}

/** "Zurückstellen": presets (Morgen, Nächste Woche) and a date, like the task snooze. */
export function CompanySnoozeMenu({
  row,
  today,
  compact,
}: {
  row: Pick<CompanyNotificationRow, "id" | "title">;
  today: string;
  compact?: boolean;
}) {
  const t = useTranslations("notificationCenter");
  const tSnooze = useTranslations("tasks.snooze");
  const actions = useCompanyActions();
  const presets = useSnoozePresets(today);
  const [pickDate, setPickDate] = useState(false);
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          disabled={actions.pending}
          aria-label={`${t("actions.snooze")}: ${row.title}`}
          className={cn(small, "data-[popup-open]:bg-hover", compact && "px-2")}
        >
          <Clock aria-hidden className="size-4" />
          <span className={compact ? "sr-only" : undefined}>{t("actions.snooze")}</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
            <Menu.Popup className={menuPopup}>
              {presets.map((preset) => (
                <Menu.Item
                  key={preset.key}
                  className={menuItem}
                  onClick={() => actions.snooze(row, preset.date)}
                >
                  {preset.label}
                  <span className="tabular text-muted-foreground text-tiny">{preset.hint}</span>
                </Menu.Item>
              ))}
              <Menu.Item className={menuItem} onClick={() => setPickDate(true)}>
                {tSnooze("pickDate")}
                <CalendarSearch aria-hidden className="size-4 text-muted-foreground" />
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <SnoozeDialog
        open={pickDate}
        taskTitle={row.title}
        title={t("snoozeDialog.title")}
        hint={t("snoozeDialog.hint")}
        today={today}
        onCancel={() => setPickDate(false)}
        onSubmit={(until) => {
          setPickDate(false);
          actions.snooze(row, until);
        }}
      />
    </>
  );
}

/**
 * One row of the notification center: kind icon, title (opens the task drawer or the permit), market with
 * its colour marker, the due information, and Erledigt · Zurückstellen · Öffnen. Rows take part in the
 * J/K/Enter navigation (`data-row`).
 */
export function CompanyRow({ row, today }: { row: CompanyNotificationRow; today: string }) {
  const t = useTranslations("notificationCenter");
  const locale = useLocale();
  const dueInfo = useDueInfo();
  const actions = useCompanyActions();
  const KindIcon = row.subjectType === "task" ? CircleCheck : ShieldCheck;
  const info = row.status === "open" ? dueInfo(row, today) : null;
  const closed = row.status === "done";

  return (
    <li
      data-row
      data-href={row.href}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter (KeyboardRows)
      tabIndex={0}
      aria-label={row.title}
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 border-border-subtle border-b px-4 py-3 outline-none last:border-b-0 focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
        row.unread && "bg-selected/40",
        closed && "text-muted-foreground",
      )}
    >
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-status-neutral-bg text-foreground-2"
        title={t(`kind.${row.kind}`)}
      >
        <KindIcon aria-hidden className="size-4" />
        <span className="sr-only">{t(`kind.${row.kind}`)}</span>
      </span>
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <div className="flex items-center gap-2">
          {row.unread && (
            <span className="size-2 shrink-0 rounded-full bg-primary">
              <span className="sr-only">{t("unread")}</span>
            </span>
          )}
          <Link
            href={row.href as never}
            onClick={() => row.unread && actions.markRead(row.id)}
            className={cn(
              "min-w-0 rounded-sm outline-none hover:text-accent-soft-foreground focus-visible:outline-2 focus-visible:outline-ring",
              row.unread ? "font-semibold" : "font-medium",
            )}
          >
            {row.title}
          </Link>
          {row.isKey && <KeyTaskMark label={t("keyTask")} />}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-small">
          {row.market && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MarketMarker color={row.market.color} typeKey={row.market.typeKey} />
              <span className="truncate text-foreground-2">{row.market.name}</span>
            </span>
          )}
          <span>{t(`kind.${row.kind}`)}</span>
          {row.dueOn && (
            <span className="tabular">
              {t(`dateLabel.${row.kind}`, { date: formatDateWeekdayDay(row.dueOn, locale) })}
            </span>
          )}
          {row.status === "snoozed" && row.snoozedUntil && (
            <span className="tabular">
              {t("snoozedUntil", {
                date: formatDateWeekdayDay(row.snoozedUntil.slice(0, 10), locale),
              })}
            </span>
          )}
          {row.resolved && <span>{t("resolvedNote")}</span>}
        </div>
      </div>
      {info && <DueBadge state={info.state} label={info.label} today={today} className="mt-0.5" />}
      <div
        role="toolbar"
        aria-label={t("actionsFor", { title: row.title })}
        className="flex shrink-0 flex-wrap items-center gap-1.5"
      >
        {closed ? (
          <button
            type="button"
            disabled={actions.pending}
            className={small}
            onClick={() => actions.reopen(row)}
          >
            <RotateCcw aria-hidden className="size-4" />
            {t("actions.reopen")}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={actions.pending}
              className={small}
              onClick={() => actions.done(row)}
            >
              <CircleCheck aria-hidden className="size-4" />
              {t("actions.done")}
            </button>
            {row.status === "snoozed" ? (
              <button
                type="button"
                disabled={actions.pending}
                className={small}
                onClick={() => actions.reopen(row)}
              >
                <RotateCcw aria-hidden className="size-4" />
                {t("actions.reopen")}
              </button>
            ) : (
              <CompanySnoozeMenu row={row} today={today} />
            )}
          </>
        )}
        <Link
          href={row.href as never}
          onClick={() => row.unread && actions.markRead(row.id)}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          {t("actions.open")}
        </Link>
      </div>
    </li>
  );
}
