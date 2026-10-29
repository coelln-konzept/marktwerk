"use client";

import { Menu } from "@base-ui/react/menu";
import { CalendarSearch, CircleCheck, Ellipsis, ExternalLink, RotateCcw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SnoozeDialog, useSnoozePresets } from "@/components/task/snooze";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompanyNotificationRow } from "@/server/queries/notifications";
import { useCompanyActions } from "./use-company-actions";

const menuPopup =
  "flex min-w-[220px] max-w-[min(300px,calc(100vw-24px))] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden";
const menuItem =
  "flex min-h-9 cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1 text-small outline-hidden data-[highlighted]:bg-hover";
/** 36 px tall, also on phones (A1-13). */
const button = cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-9 px-3 text-small");

/** Where the whole row leads: a task opens its drawer in place, a permit its page. */
export type OpenTarget = { href: string; onOpen?: () => void };

/**
 * The actions of a notification row, shared by the center and the bell: one primary button (Erledigt, or
 * Wieder öffnen when it is closed or snoozed) and one "…" menu with Zurückstellen and Öffnen. The menu
 * says what the snooze does: a task is snoozed itself and leaves Übersicht, center and bell together;
 * a permit only loses its notification for a while.
 */
export function CompanyRowActions({
  row,
  today,
  open,
  onPickDate,
}: {
  row: CompanyNotificationRow;
  today: string;
  open: OpenTarget;
  /** The bell owns the date dialog (a popover must not host a modal); the center renders its own. */
  onPickDate?: (row: CompanyNotificationRow) => void;
}) {
  const t = useTranslations("notificationCenter");
  const tSnooze = useTranslations("tasks.snooze");
  const actions = useCompanyActions();
  const presets = useSnoozePresets(today);
  const router = useRouter();
  const pathname = usePathname();
  const [pickDate, setPickDate] = useState(false);
  const isTask = row.subjectType === "task";
  const closed = row.status === "done";

  function goOpen() {
    open.onOpen?.();
    // A drawer on this page keeps the scroll position; another page starts at the top.
    router.push(open.href as never, {
      scroll: new URL(open.href, window.location.href).pathname !== pathname,
    });
  }

  return (
    <div
      role="toolbar"
      aria-label={t("actionsFor", { title: row.title })}
      className="flex shrink-0 items-center gap-1.5"
    >
      {closed ? (
        <button
          type="button"
          disabled={actions.pending}
          className={button}
          onClick={() => actions.reopen(row)}
        >
          <RotateCcw aria-hidden />
          {t("actions.reopen")}
        </button>
      ) : row.status === "snoozed" ? (
        <button
          type="button"
          disabled={actions.pending}
          className={button}
          onClick={() => actions.reopen(row)}
        >
          <RotateCcw aria-hidden />
          {t("actions.unsnooze")}
        </button>
      ) : (
        <button
          type="button"
          disabled={actions.pending}
          className={button}
          onClick={() => actions.done(row)}
        >
          <CircleCheck aria-hidden />
          {t("actions.done")}
        </button>
      )}
      <Menu.Root>
        <Menu.Trigger
          disabled={actions.pending}
          aria-label={t("actions.more", { title: row.title })}
          className={cn(button, "size-9 px-0 data-[popup-open]:bg-hover")}
        >
          <Ellipsis aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
            <Menu.Popup className={menuPopup}>
              {row.status === "open" && (
                <>
                  <Menu.Group>
                    <Menu.GroupLabel className="px-2 pt-2 font-semibold text-small">
                      {t(isTask ? "snoozeMenu.task" : "snoozeMenu.permit")}
                    </Menu.GroupLabel>
                    <p className="px-2 pb-1.5 text-muted-foreground text-tiny">
                      {t(isTask ? "snoozeMenu.taskHint" : "snoozeMenu.permitHint")}
                    </p>
                    {presets.map((preset) => (
                      <Menu.Item
                        key={preset.key}
                        className={menuItem}
                        onClick={() => actions.snooze(row, preset.date)}
                      >
                        {preset.label}
                        <span className="tabular text-muted-foreground text-tiny">
                          {preset.hint}
                        </span>
                      </Menu.Item>
                    ))}
                    <Menu.Item
                      className={menuItem}
                      onClick={() => (onPickDate ? onPickDate(row) : setPickDate(true))}
                    >
                      {tSnooze("pickDate")}
                      <CalendarSearch aria-hidden className="size-4 text-muted-foreground" />
                    </Menu.Item>
                  </Menu.Group>
                  <Menu.Separator className="my-1 h-px bg-border" />
                </>
              )}
              <Menu.Item className={menuItem} onClick={goOpen}>
                {t("actions.open")}
                <ExternalLink aria-hidden className="size-4 text-muted-foreground" />
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {!onPickDate && (
        <RowSnoozeDialog
          row={row}
          today={today}
          open={pickDate}
          onClose={() => setPickDate(false)}
        />
      )}
    </div>
  );
}

/** "Datum wählen …": the task's own wording for a task, the notification's for a permit. */
export function RowSnoozeDialog({
  row,
  today,
  open,
  onClose,
}: {
  row: CompanyNotificationRow;
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("notificationCenter");
  const actions = useCompanyActions();
  const isTask = row.subjectType === "task";
  return (
    <SnoozeDialog
      open={open}
      taskTitle={row.title}
      title={isTask ? undefined : t("snoozeDialog.title")}
      hint={isTask ? undefined : t("snoozeDialog.hint")}
      today={today}
      onCancel={onClose}
      onSubmit={(until) => {
        onClose();
        actions.snooze(row, until);
      }}
    />
  );
}
