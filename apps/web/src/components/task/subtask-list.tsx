"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, LoaderCircle, Plus, Trash2, UserMinus, UserRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { useTaskActions } from "@/components/board/use-task-actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DueBadge } from "@/components/ui/due-badge";
import { Input } from "@/components/ui/input";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { StaffOption, SubtaskRow } from "@/server/queries/tasks";
import type { QueuedSubtask } from "./drawer-logic";
import { DueDateInput } from "./due-input";
import { isTickFinished, TaskTick } from "./task-tick";

const popup =
  "flex max-h-[min(420px,var(--available-height))] min-w-[220px] flex-col overflow-y-auto rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden";
const menuItem =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-hover";

type Actions = ReturnType<typeof useTaskActions>;

/**
 * The subtasks of a task in its drawer (ADR 0021, D2-10…D2-14): progress ("2/5 erledigt"), and per subtask the
 * tick, its title (opens the subtask's own drawer), due date, an overdue badge, the assignee and "Löschen".
 * Every change goes through the same actions as a task of its own, with an undo toast; finishing the last open
 * one offers to complete the parent ("Hauptaufgabe auch erledigen?", in `useTaskActions`). New subtasks are
 * added with Enter: the field empties at once and keeps the focus, the new row shows "wird angelegt …" until
 * it is saved, and quick Enters queue up instead of being dropped (UX-021).
 */
export function SubtaskList({
  subtasks,
  staff,
  today,
  canWrite,
  canAssign,
  canDelete,
  pending,
  actions,
  onSaveDue,
  draft,
  onDraftChange,
  onAdd,
  queued,
}: {
  subtasks: SubtaskRow[];
  staff: StaffOption[];
  today: string;
  canWrite: boolean;
  canAssign: boolean;
  canDelete: boolean;
  /** A save of the drawer is running (the due-date fields wait for it; adding does not). */
  pending: boolean;
  actions: Actions;
  onSaveDue: (subtask: SubtaskRow, dueOn: string | null) => void;
  /** The title being typed into "Unteraufgabe hinzufügen" (the drawer keeps it while it is open). */
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: (title: string) => void;
  /** Subtasks typed in but not shown as saved rows yet. */
  queued: QueuedSubtask[];
}) {
  const t = useTranslations("tasks");
  const done = subtasks.filter((s) => isTickFinished(s.status)).length;
  const total = subtasks.length + queued.length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-small">{t("subtasks")}</h3>
        {total > 0 && (
          <span className="tabular text-muted-foreground text-small">
            {t("subtask.progress", { done, total })}
          </span>
        )}
      </div>
      {total > 0 && (
        <div aria-hidden className="h-1 overflow-hidden rounded-full bg-sunken">
          <div
            className="h-full rounded-full bg-status-ok-dot transition-[width]"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      )}
      {total > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0" aria-busy={queued.length > 0 || undefined}>
          {subtasks.map((item) => (
            <SubtaskItem
              key={item.id}
              item={item}
              staff={staff}
              today={today}
              canWrite={canWrite}
              canAssign={canAssign}
              canDelete={canDelete}
              pending={pending}
              actions={actions}
              onSaveDue={onSaveDue}
            />
          ))}
          {queued.map((item) => (
            <li
              key={`queued-${item.key}`}
              className="flex items-start gap-1.5 border-b py-1.5 text-muted-foreground last:border-b-0"
            >
              <span className="grid size-7 shrink-0 place-items-center touch:size-10">
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
                <span className="font-medium text-small leading-snug">{item.title}</span>
                <span className="text-tiny">{t("subtask.saving")}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        !canWrite && <p className="m-0 text-muted-foreground text-small">{t("subtask.none")}</p>
      )}
      {canWrite && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = draft.trim();
            // Every Enter with text adds one; saves queue up in the drawer (never dropped while one runs).
            if (value) onAdd(value);
          }}
        >
          <Input
            aria-label={t("addSubtask")}
            placeholder={t("addSubtask")}
            value={draft}
            maxLength={200}
            onChange={(e) => onDraftChange(e.target.value)}
          />
          <Button
            type="submit"
            size="icon"
            aria-label={t("addSubtaskButton")}
            disabled={!draft.trim()}
          >
            <Plus aria-hidden />
          </Button>
        </form>
      )}
    </section>
  );
}

function SubtaskItem({
  item,
  staff,
  today,
  canWrite,
  canAssign,
  canDelete,
  pending,
  actions,
  onSaveDue,
}: {
  item: SubtaskRow;
  staff: StaffOption[];
  today: string;
  canWrite: boolean;
  canAssign: boolean;
  canDelete: boolean;
  pending: boolean;
  actions: Actions;
  onSaveDue: (subtask: SubtaskRow, dueOn: string | null) => void;
}) {
  const t = useTranslations("tasks");
  const tBoard = useTranslations("board");
  const finished = isTickFinished(item.status);
  const ref = { id: item.id, title: item.title, status: item.status };
  const team = isModuleVisible("team");

  return (
    <li className="flex items-start gap-1.5 border-b py-1.5 last:border-b-0">
      <TaskTick
        task={item}
        disabled={!canWrite}
        onToggle={(next) => actions.setStatus(ref, next)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <Link
          href={actions.drawer.open(item.id) as never}
          scroll={false}
          className={cn(
            "self-start rounded-sm font-medium text-small leading-snug hover:underline focus-visible:outline-2 focus-visible:outline-ring",
            finished && "text-muted-foreground line-through",
          )}
        >
          {item.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <DueDateInput
              value={item.dueOn}
              pending={pending}
              aria-label={t("subtask.dueAria", { title: item.title })}
              className="h-7 text-small"
              onCommit={(value) => onSaveDue(item, value)}
            />
          ) : (
            item.dueOn &&
            !item.overdue &&
            !finished && <DueBadge dueOn={item.dueOn} today={today} withDate />
          )}
          {item.overdue && item.dueOn && <DueBadge dueOn={item.dueOn} today={today} />}
          {team &&
            (canAssign ? (
              <Menu.Root>
                <Menu.Trigger
                  aria-label={t("subtask.assignAria", {
                    title: item.title,
                    name: item.assigneeName ?? t("nobody"),
                  })}
                  className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-muted-foreground text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover"
                >
                  {item.assigneeName ? (
                    <>
                      <Avatar name={item.assigneeName} />
                      <span className="max-w-32 truncate text-foreground">{item.assigneeName}</span>
                    </>
                  ) : (
                    <>
                      <UserRound aria-hidden className="size-4" />
                      {t("nobody")}
                    </>
                  )}
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
                    <Menu.Popup className={popup}>
                      <Menu.Group>
                        <Menu.GroupLabel className="px-2 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                          {tBoard("menu.assignTo")}
                        </Menu.GroupLabel>
                        {staff.map((s) => (
                          <Menu.Item
                            key={s.id}
                            className={menuItem}
                            disabled={s.id === item.assigneeId}
                            onClick={() => actions.assign(ref, s.id)}
                          >
                            <span aria-hidden>
                              <Avatar name={s.displayName} />
                            </span>
                            <span className="truncate">{s.displayName}</span>
                            {s.id === item.assigneeId && (
                              <Check
                                aria-label={tBoard("menu.current")}
                                className="ml-auto size-4 text-muted-foreground"
                              />
                            )}
                          </Menu.Item>
                        ))}
                      </Menu.Group>
                      {item.assigneeId && (
                        <>
                          <Menu.Separator className="my-1 h-px bg-border" />
                          <Menu.Item className={menuItem} onClick={() => actions.assign(ref, null)}>
                            <UserMinus aria-hidden className="size-4 text-muted-foreground" />
                            {tBoard("menu.unassign")}
                          </Menu.Item>
                        </>
                      )}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            ) : (
              item.assigneeName && (
                <span className="inline-flex items-center gap-1.5 text-small">
                  <Avatar name={item.assigneeName} />
                  <span className="max-w-32 truncate">{item.assigneeName}</span>
                </span>
              )
            ))}
        </div>
      </div>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("subtask.deleteAria", { title: item.title })}
          title={t("delete")}
          onClick={() => actions.remove(ref)}
          className="mt-0.5 text-muted-foreground hover:text-status-critical"
        >
          <Trash2 aria-hidden />
        </Button>
      )}
    </li>
  );
}
