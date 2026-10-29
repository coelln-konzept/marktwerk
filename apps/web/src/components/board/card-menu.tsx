"use client";

import { Menu } from "@base-ui/react/menu";
import type { BoardColumn, TaskStatusKey } from "@marktwerk/core";
import {
  AlarmClockOff,
  CalendarSearch,
  Check,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  UserMinus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSnoozePresets } from "@/components/task/snooze";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { COLUMN_ORDER, REASON_STATUSES, SETTABLE_STATUSES, TASK_STATUS_UI } from "@/lib/task-ui";
import { cn } from "@/lib/utils";
import type { BoardTask } from "@/server/queries/tasks";
import { useBoard } from "./board-context";

const popup =
  "flex max-h-[min(420px,var(--available-height))] min-w-[220px] flex-col overflow-y-auto rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden";
const item =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-hover";
const subTrigger = cn(item, "justify-between data-[popup-open]:bg-hover");

/**
 * The "⋯" menu of a card: *Zuweisen an…*, *Verschieben nach…*, *Status*, *Erledigt* (UX concept §6, drag
 * alternatives). Everything a drag could do is here, so the board never depends on a pointer.
 */
export function CardMenu({
  task,
  open,
  onOpenChange,
}: {
  task: BoardTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("board");
  const tTasks = useTranslations("tasks");
  const router = useRouter();
  const { staff, canWrite, canAssign, actions, askReason, askSnoozeDate, today } = useBoard();
  const tSnooze = useTranslations("tasks.snooze");
  const presets = useSnoozePresets(today);
  const finished = task.status === "done" || task.status === "skipped";

  function pickStatus(status: TaskStatusKey) {
    if ((REASON_STATUSES as readonly string[]).includes(status)) askReason(task, status);
    else actions.setStatus(task, status);
  }

  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger
        aria-label={t("card.actions", { title: task.title })}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover"
      >
        <Ellipsis aria-hidden className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
          <Menu.Popup className={popup}>
            <Menu.Item
              className={item}
              onClick={() => router.push(actions.drawer.open(task.id) as never)}
            >
              <ExternalLink aria-hidden className="size-4 text-muted-foreground" />
              {t("menu.open")}
              <Kbd className="ml-auto">↵</Kbd>
            </Menu.Item>

            {canAssign && (
              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger className={subTrigger}>
                  {t("menu.assign")}
                  <span className="flex items-center gap-1">
                    <Kbd>A</Kbd>
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </span>
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner sideOffset={4} className="z-50">
                    <Menu.Popup className={popup}>
                      <Menu.Group>
                        <Menu.GroupLabel className="px-2 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                          {t("menu.assignTo")}
                        </Menu.GroupLabel>
                        {staff.map((s) => (
                          <Menu.Item
                            key={s.id}
                            className={item}
                            disabled={s.id === task.assigneeId}
                            onClick={() => actions.assign(task, s.id)}
                          >
                            <span aria-hidden>
                              <Avatar name={s.displayName} />
                            </span>
                            <span className="truncate">{s.displayName}</span>
                            {s.id === task.assigneeId && (
                              <Check
                                aria-label={t("menu.current")}
                                className="ml-auto size-4 text-muted-foreground"
                              />
                            )}
                          </Menu.Item>
                        ))}
                      </Menu.Group>
                      {task.assigneeId && (
                        <>
                          <Menu.Separator className="my-1 h-px bg-border" />
                          <Menu.Item className={item} onClick={() => actions.assign(task, null)}>
                            <UserMinus aria-hidden className="size-4 text-muted-foreground" />
                            {t("menu.unassign")}
                          </Menu.Item>
                        </>
                      )}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
            )}

            {canWrite && (
              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger className={subTrigger}>
                  {t("menu.move")}
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner sideOffset={4} className="z-50">
                    <Menu.Popup className={popup}>
                      {COLUMN_ORDER.map((column: BoardColumn) => (
                        <Menu.Item
                          key={column}
                          className={item}
                          disabled={column === task.column}
                          onClick={() => actions.move(task, column, null)}
                        >
                          {t(`columns.${column}`)}
                          {column === task.column && (
                            <Check
                              aria-label={t("menu.current")}
                              className="ml-auto size-4 text-muted-foreground"
                            />
                          )}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
            )}

            {canWrite && (
              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger className={subTrigger}>
                  <span>{t("menu.status")}</span>
                  <span className="flex items-center gap-1 text-muted-foreground text-tiny">
                    {tTasks(`status.${task.status}`)}
                    <ChevronRight aria-hidden className="size-4" />
                  </span>
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner sideOffset={4} className="z-50">
                    <Menu.Popup className={popup}>
                      {SETTABLE_STATUSES.filter((s) => s !== "done").map((status) => {
                        const Icon = TASK_STATUS_UI[status].icon;
                        return (
                          <Menu.Item
                            key={status}
                            className={item}
                            disabled={status === task.status}
                            onClick={() => pickStatus(status)}
                          >
                            <Icon aria-hidden className="size-4 text-muted-foreground" />
                            {tTasks(`status.${status}`)}
                            {(REASON_STATUSES as readonly string[]).includes(status) && (
                              <span aria-hidden className="text-muted-foreground">
                                …
                              </span>
                            )}
                          </Menu.Item>
                        );
                      })}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
            )}

            {canWrite && !finished && (
              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger className={subTrigger}>
                  <span className="flex items-center gap-2">
                    <AlarmClockOff aria-hidden className="size-4 text-muted-foreground" />
                    {tSnooze("title")}
                  </span>
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner sideOffset={4} className="z-50">
                    <Menu.Popup className={popup}>
                      {presets.map((preset) => (
                        <Menu.Item
                          key={preset.key}
                          className={cn(item, "justify-between gap-4")}
                          onClick={() => actions.snooze(task, preset.date)}
                        >
                          {preset.label}
                          <span className="tabular text-muted-foreground text-tiny">
                            {preset.hint}
                          </span>
                        </Menu.Item>
                      ))}
                      <Menu.Item
                        className={cn(item, "justify-between gap-4")}
                        onClick={() => askSnoozeDate(task)}
                      >
                        {tSnooze("pickDate")}
                        <CalendarSearch aria-hidden className="size-4 text-muted-foreground" />
                      </Menu.Item>
                      {task.snoozedUntil && (
                        <>
                          <Menu.Separator className="my-1 h-px bg-border" />
                          <Menu.Item className={item} onClick={() => actions.unsnooze(task)}>
                            {tSnooze("clear")}
                          </Menu.Item>
                        </>
                      )}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
            )}

            {canWrite && (
              <>
                <Menu.Separator className="my-1 h-px bg-border" />
                {finished ? (
                  <Menu.Item className={item} onClick={() => actions.setStatus(task, "todo")}>
                    {t("menu.reopen")}
                  </Menu.Item>
                ) : (
                  <Menu.Item className={item} onClick={() => actions.setStatus(task, "done")}>
                    {t("menu.done")}
                    <Kbd className="ml-auto">E</Kbd>
                  </Menu.Item>
                )}
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
