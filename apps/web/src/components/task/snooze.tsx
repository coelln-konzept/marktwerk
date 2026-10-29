"use client";

import { Menu } from "@base-ui/react/menu";
import { addDays, SNOOZE_PRESETS, type SnoozePreset, snoozePresetDate } from "@marktwerk/core";
import { AlarmClockOff, CalendarSearch } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useTaskActions } from "@/components/board/use-task-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatDateWeekdayDay } from "@/lib/format";
import type { BoardTask } from "@/server/queries/tasks";

/** What snoozing needs to know about a task. */
export type SnoozeRef = Pick<BoardTask, "id" | "title" | "status"> & {
  snoozedUntil?: string | null;
};

/** The preset choices ("Morgen", "Nächste Woche") with the date each one gives today. */
export function useSnoozePresets(today: string) {
  const t = useTranslations("tasks.snooze");
  const locale = useLocale();
  return SNOOZE_PRESETS.map((key: SnoozePreset) => {
    const date = snoozePresetDate(key, today);
    return {
      key,
      date,
      label: t(key === "tomorrow" ? "tomorrow" : "nextWeek"),
      hint: formatDateWeekdayDay(date, locale),
    };
  });
}

/** "Datum wählen …": a small modal with one date input (must be after today). */
export function SnoozeDialog({
  open,
  taskTitle,
  today,
  onSubmit,
  onCancel,
  title,
  hint,
}: {
  open: boolean;
  taskTitle: string;
  /** Other wording than for a task (e.g. the notification center). */
  title?: string;
  hint?: string;
  today: string;
  onSubmit: (until: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("tasks.snooze");
  const min = addDays(today, 1);
  const [date, setDate] = useState(min);
  useEffect(() => {
    if (open) setDate(min);
  }, [open, min]);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= min;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      title={title ?? t("dialogTitle")}
      description={taskTitle}
      closeLabel={t("cancel")}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSubmit(date);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="snooze-date">{t("dateLabel")}</Label>
          <Input
            id="snooze-date"
            type="date"
            value={date}
            min={min}
            required
            className="w-auto"
            onChange={(event) => setDate(event.target.value)}
          />
          <p className="text-muted-foreground text-tiny">{hint ?? t("hint")}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="default" disabled={!valid}>
            {t("confirm")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const popup =
  "flex min-w-[200px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden";
const item =
  "flex min-h-8 cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1 text-small outline-hidden data-[highlighted]:bg-hover";

/**
 * A small "Zurückstellen" menu button (presets + "Datum wählen …") for list rows such as the Übersicht's
 * "Heute fällig". Confirms with an undo toast.
 */
export function SnoozeMenu({ task, today }: { task: SnoozeRef; today: string }) {
  const t = useTranslations("tasks.snooze");
  const actions = useTaskActions({ staff: [] });
  const presets = useSnoozePresets(today);
  const [pickDate, setPickDate] = useState(false);

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label={t("actions", { title: task.title })}
          title={t("title")}
          className="inline-grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover"
        >
          <AlarmClockOff aria-hidden className="size-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
            <Menu.Popup className={popup}>
              {presets.map((preset) => (
                <Menu.Item
                  key={preset.key}
                  className={item}
                  onClick={() => actions.snooze(task, preset.date)}
                >
                  {preset.label}
                  <span className="tabular text-muted-foreground text-tiny">{preset.hint}</span>
                </Menu.Item>
              ))}
              <Menu.Item className={item} onClick={() => setPickDate(true)}>
                {t("pickDate")}
                <CalendarSearch aria-hidden className="size-4 text-muted-foreground" />
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <SnoozeDialog
        open={pickDate}
        taskTitle={task.title}
        today={today}
        onCancel={() => setPickDate(false)}
        onSubmit={(until) => {
          setPickDate(false);
          actions.snooze(task, until);
        }}
      />
    </>
  );
}
