"use client";

import { Menu } from "@base-ui/react/menu";
import type { TaskStatusKey } from "@marktwerk/core";
import {
  AlarmClockOff,
  Camera,
  Check,
  ChevronRight,
  Ellipsis,
  FileX,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import {
  editTask,
  giveEffortFeedback,
  newCheckItem,
  tickCheckItem,
} from "@/app/(app)/board/actions";
import { ReasonDialog } from "@/components/board/reason-dialog";
import { CategoryTag, DueLine } from "@/components/board/task-bits";
import { useTaskActions } from "@/components/board/use-task-actions";
import { ArchiveDocumentButton } from "@/components/documents/archive-document-button";
import { DocumentUpload } from "@/components/documents/upload";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateWeekdayDay } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { formatEstimate, REASON_STATUSES, TASK_STATUS_UI } from "@/lib/task-ui";
import { cn } from "@/lib/utils";
import type { StaffOption, TaskDetail } from "@/server/queries/tasks";
import { SnoozeDialog, useSnoozePresets } from "./snooze";
import { TaskActivity } from "./task-activity";

const FEEDBACK = ["as_planned", "longer", "shorter"] as const;

/** Statuses behind the "…" menu; Erledigt and Wartet auf Amt have their own buttons. */
const WaitingIcon = TASK_STATUS_UI.waiting_external.icon;

const MENU_STATUSES = ["in_progress", "blocked", "skipped", "todo"] as const;

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold text-small">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The task drawer (`?aufgabe=<id>`): status incl. "Wartet", assignee, due date, estimate with effort
 * feedback, snooze ("Zurückstellen"), description, check items, evidence, an optional completion note and
 * the task's activity.
 * Changes save as they are made and confirm with a toast; moves, assignments, status changes and edits of
 * Kernaufgabe, due date, estimate and title offer undo. The due date is saved when the field is left or
 * Enter is pressed (or after a second without typing), not on every keystroke.
 * Closing (Esc, ×) is optimistic: the drawer disappears and the URL is replaced at once, the server
 * catches up with the next refresh.
 */
export function TaskDrawer({
  task,
  staff,
  canWrite,
  canAssign,
  today,
  closeHref,
}: {
  task: TaskDetail;
  staff: StaffOption[];
  canWrite: boolean;
  canAssign: boolean;
  today: string;
  closeHref: string;
}) {
  const t = useTranslations("tasks");
  const tStatus = useTranslations("tasks.status");
  const tToast = useTranslations("board.toast");
  const locale = useLocale();
  const { showToast } = useShell();
  const search = useSearchParams();
  // The URL says whether the drawer is open: closing replaces it before the server has answered.
  const isOpen = search.get("aufgabe") === task.id || search.get("detail") === `task:${task.id}`;
  const dueTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dueSent = useRef<string | null>(null);
  const actions = useTaskActions({ staff, scopeEventId: task.eventId });
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [reasonFor, setReasonFor] = useState<TaskStatusKey | null>(null);
  const [note, setNote] = useState("");
  const [snoozeDate, setSnoozeDate] = useState(false);
  const presets = useSnoozePresets(today);
  const tSnooze = useTranslations("tasks.snooze");
  const [newItem, setNewItem] = useState("");
  const uid = useId();

  const finished = task.status === "done" || task.status === "skipped";
  const checkDone = task.checkItems.filter((c) => c.done).length;
  const ref = { id: task.id, title: task.title, status: task.status };

  /** Saves a change; `undo` is the patch that puts the old values back (the toast's "Rückgängig"). */
  function save(patch: Parameters<typeof editTask>[1], undo?: Parameters<typeof editTask>[1]) {
    startTransition(async () => {
      const result = await editTask(task.id, patch);
      if (!result.ok) {
        showToast({ message: actions.errorText(result.error) });
        return;
      }
      if (!result.data.changed) {
        showToast({ message: t("unchanged") });
        return;
      }
      if (!undo) {
        showToast({ message: t("saved") });
        return;
      }
      showToast({
        message: t("saved"),
        actionLabel: tToast("undo"),
        onAction: async () => {
          const back = await editTask(task.id, undo);
          showToast({ message: back.ok ? tToast("reverted") : actions.errorText(back.error) });
        },
      });
    });
  }

  /** Due date: saved once per committed value (blur, Enter or a pause), not again while that save runs. */
  function commitDue(value: string) {
    clearTimeout(dueTimer.current);
    if (value === "" || value === (task.dueOn ?? "")) return;
    if (pending && value === dueSent.current) return;
    dueSent.current = value;
    save({ dueOn: value }, { dueOn: task.dueOn });
  }

  /** Optimistic close: drop the drawer and the URL parameter now; the opener gets its focus back. */
  const close = useCallback(() => {
    window.history.replaceState(null, "", closeHref);
  }, [closeHref]);

  // Reset what was typed when the drawer closes, so reopening starts clean.
  useEffect(() => {
    if (isOpen) return;
    clearTimeout(dueTimer.current);
    setEditing(false);
    setNote("");
    setNewItem("");
  }, [isOpen]);

  // Esc and × close at once. Typing that is not saved yet is kept: the first Esc only leaves the field.
  const hasDraft = editing || note !== "" || newItem !== "";
  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role=listbox]")) return;
      if (document.querySelector('[role="menu"], [role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      if (hasDraft && target?.matches("input, textarea")) {
        target.blur();
        return;
      }
      close();
    }
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as HTMLElement | null)?.closest("a");
      if (!link || link.getAttribute("href") !== closeHref) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    // Capture phase: runs before the drawer's own (server round trip) handlers.
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [isOpen, hasDraft, close, closeHref]);

  function pickStatus(status: TaskStatusKey) {
    if (status === task.status) return;
    if ((REASON_STATUSES as readonly string[]).includes(status)) {
      setReasonFor(status);
      return;
    }
    if (status === "done") {
      // The note is optional: it goes with the completion and is kept in the activity.
      actions.setStatus(ref, "done", { note: note.trim() || null });
      setNote("");
      return;
    }
    actions.setStatus(ref, status);
  }

  function feedback(value: (typeof FEEDBACK)[number]) {
    startTransition(async () => {
      const next = task.effortFeedback === value ? null : value;
      const result = await giveEffortFeedback(task.id, next);
      showToast({ message: result.ok ? t("feedback.saved") : actions.errorText(result.error) });
    });
  }

  const StatusIcon = TASK_STATUS_UI[task.status].icon;
  const waitingNow = task.status === "waiting_external";
  const buttonBase =
    "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 font-medium text-small focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-60";

  // Open task: primary Erledigt, toggle Wartet, everything else (In Arbeit, Blockiert, Übersprungen, back to
  // Offen) in the "…" menu. Finished task: one primary "Wieder öffnen" and nothing else to set. The
  // current state is always spelled out as a badge (colour + icon + text).
  const statusHeader = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {finished ? (
          canWrite && (
            <button
              type="button"
              onClick={() => actions.setStatus(ref, "todo")}
              className={cn(
                buttonBase,
                "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
              )}
            >
              <RotateCcw aria-hidden className="size-4" />
              {t("reopen")}
            </button>
          )
        ) : (
          <>
            <button
              type="button"
              disabled={!canWrite}
              onClick={() => pickStatus("done")}
              className={cn(
                buttonBase,
                "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
              )}
            >
              <Check aria-hidden className="size-4" />
              {t("statusLong.done")}
            </button>
            <button
              type="button"
              aria-pressed={waitingNow}
              disabled={!canWrite}
              onClick={() =>
                waitingNow ? actions.setStatus(ref, "todo") : pickStatus("waiting_external")
              }
              className={cn(
                buttonBase,
                waitingNow
                  ? "border-foreground bg-foreground text-background"
                  : "border-input bg-card hover:bg-hover",
              )}
            >
              <WaitingIcon aria-hidden className="size-4" />
              {t("statusToggle.waiting")}
            </button>
          </>
        )}
        {canWrite && !finished && (
          <Menu.Root>
            <Menu.Trigger
              aria-label={t("statusMore")}
              className="grid size-8 cursor-pointer place-items-center rounded-lg border border-input bg-card text-foreground-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover"
            >
              <Ellipsis aria-hidden className="size-4" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
                <Menu.Popup className="flex min-w-[200px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
                  {MENU_STATUSES.map((status) => {
                    const Icon = TASK_STATUS_UI[status].icon;
                    const on = task.status === status;
                    return (
                      <Menu.Item
                        key={status}
                        disabled={on}
                        onClick={() => pickStatus(status)}
                        className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[highlighted]:bg-hover"
                      >
                        <Icon aria-hidden className="size-4 text-muted-foreground" />
                        {status === "todo" ? t("statusReopen") : t(`statusLong.${status}`)}
                        {on && <Check aria-hidden className="ml-auto size-4" />}
                      </Menu.Item>
                    );
                  })}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-small">
          {t("statusLabel")}:
          <StatusBadge tone={TASK_STATUS_UI[task.status].tone} icon={StatusIcon}>
            {tStatus(task.status)}
          </StatusBadge>
        </span>
      </div>
      {task.status === "waiting_external" && (
        <p className="text-small text-status-waiting">
          {task.waitingReason
            ? t("waitingFor", { reason: task.waitingReason })
            : t("waitingNoReason")}
        </p>
      )}
      {task.status === "blocked" && task.waitingReason && (
        <p className="text-small text-status-warn">
          {t("blockedBy", { reason: task.waitingReason })}
        </p>
      )}
      {task.status === "skipped" && task.skippedReason && (
        <p className="text-muted-foreground text-small">
          {t("skippedBecause", { reason: task.skippedReason })}
        </p>
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
      <Drawer
        badges={
          task.removedFromTemplate && !finished ? (
            <>
              <StatusBadge tone="neutral" icon={FileX}>
                {t("removedFromTemplate")}
              </StatusBadge>
              <span className="text-muted-foreground text-tiny">
                {t("removedFromTemplateHint")}
              </span>
            </>
          ) : undefined
        }
        kind={
          <>
            <CategoryTag category={task.category} />
            {task.eventId ? (
              <Link
                href={`/veranstaltungen/${task.eventId}` as never}
                className="truncate hover:underline"
              >
                {task.eventName}
              </Link>
            ) : (
              <span>{t("noEvent")}</span>
            )}
            <span className="text-faint-foreground">·</span>
            <span>{t("label")}</span>
          </>
        }
        title={
          editing ? (
            <Input
              aria-label={t("fields.title")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          ) : (
            task.title
          )
        }
        titleExtra={
          canWrite && !editing ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("edit")}
              title={t("edit")}
              onClick={() => {
                setTitle(task.title);
                setDescription(task.description ?? "");
                setEditing(true);
              }}
            >
              <Pencil aria-hidden />
            </Button>
          ) : null
        }
        header={statusHeader}
        closeHref={closeHref}
      >
        <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
          <dt className="text-muted-foreground text-small">
            <label htmlFor={`${uid}-due`}>{t("fields.due")}</label>
          </dt>
          <dd className="m-0 flex flex-wrap items-center gap-2">
            {canWrite ? (
              <Input
                id={`${uid}-due`}
                type="date"
                defaultValue={task.dueOn ?? ""}
                key={task.dueOn ?? "none"}
                disabled={pending}
                className="w-auto"
                onChange={(e) => {
                  // A pause after the last change also commits (picking in the calendar never blurs).
                  clearTimeout(dueTimer.current);
                  const value = e.target.value;
                  dueTimer.current = setTimeout(() => commitDue(value), 1000);
                }}
                onBlur={(e) => commitDue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitDue(e.currentTarget.value);
                }}
              />
            ) : (
              <span className="tabular">
                {task.dueOn ? formatDate(task.dueOn, locale) : t("due.none")}
              </span>
            )}
            <DueLine dueOn={task.dueOn} today={today} status={task.status} completedOn={null} />
            {task.dueOverridden && (
              <span className="text-muted-foreground text-tiny">{t("dueSetByHand")}</span>
            )}
            {task.snoozedUntil && !finished && (
              <span className="tabular inline-flex items-center gap-1 rounded-sm bg-sunken px-1.5 py-0.5 text-muted-foreground text-small">
                <AlarmClockOff aria-hidden className="size-3.5" />
                {tSnooze("until", { date: formatDateWeekdayDay(task.snoozedUntil, locale) })}
              </span>
            )}
          </dd>

          {canWrite && !finished && (
            <>
              <dt className="text-muted-foreground text-small">{tSnooze("title")}</dt>
              <dd className="m-0 flex flex-wrap items-center gap-1.5">
                {presets.map((preset) => (
                  <Button
                    key={preset.key}
                    size="sm"
                    disabled={pending}
                    title={preset.hint}
                    onClick={() => actions.snooze(ref, preset.date)}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button size="sm" disabled={pending} onClick={() => setSnoozeDate(true)}>
                  {tSnooze("pickDate")}
                </Button>
                {task.snoozedUntil && (
                  <Button size="sm" disabled={pending} onClick={() => actions.unsnooze(ref)}>
                    {tSnooze("clear")}
                  </Button>
                )}
              </dd>
            </>
          )}

          {isModuleVisible("estimates") && (
            <>
              <dt className="text-muted-foreground text-small">
                <label htmlFor={`${uid}-est`}>{t("fields.estimate")}</label>
              </dt>
              <dd className="m-0 flex items-center gap-2">
                {canWrite ? (
                  <>
                    <Input
                      id={`${uid}-est`}
                      inputMode="decimal"
                      defaultValue={
                        task.estimateMinutes
                          ? String(task.estimateMinutes / 60).replace(".", ",")
                          : ""
                      }
                      key={task.estimateMinutes}
                      placeholder="0"
                      className="w-24"
                      onBlur={(e) => {
                        const hours =
                          e.target.value.trim() === ""
                            ? 0
                            : Number(e.target.value.replace(",", "."));
                        const minutes = Math.round(hours * 60);
                        if (!Number.isFinite(minutes) || minutes < 0) return;
                        if (minutes !== task.estimateMinutes)
                          save(
                            { estimateMinutes: minutes },
                            { estimateMinutes: task.estimateMinutes },
                          );
                      }}
                    />
                    <span className="text-muted-foreground text-small">{t("hours")}</span>
                  </>
                ) : (
                  <span className="tabular">{formatEstimate(task.estimateMinutes, locale)}</span>
                )}
              </dd>
            </>
          )}

          {isModuleVisible("team") && (
            <>
              <dt className="text-muted-foreground text-small">
                <label htmlFor={`${uid}-who`}>{t("fields.assignee")}</label>
              </dt>
              <dd className="m-0">
                {canAssign ? (
                  <select
                    id={`${uid}-who`}
                    className={cn(SELECT_CLASS, "max-w-64")}
                    value={task.assigneeId ?? ""}
                    onChange={(e) => actions.assign(ref, e.target.value || null)}
                  >
                    <option value="">{t("nobody")}</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{task.assigneeName ?? t("nobody")}</span>
                )}
              </dd>
            </>
          )}

          {isModuleVisible("team") && task.dutyRoleName && (
            <>
              <dt className="text-muted-foreground text-small">{t("fields.role")}</dt>
              <dd className="m-0 text-small">
                {locale === "en" ? task.dutyRoleName.en : task.dutyRoleName.de}
              </dd>
            </>
          )}
          {task.status === "done" && task.completionNote && (
            <>
              <dt className="text-muted-foreground text-small">{t("completionNote.title")}</dt>
              <dd className="m-0 whitespace-pre-wrap text-small">{task.completionNote}</dd>
            </>
          )}
          {(canWrite || task.isKey) && (
            <>
              <dt className="text-muted-foreground text-small">{t("keyTask.label")}</dt>
              <dd className="m-0">
                <label className="flex items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--primary)"
                    checked={task.isKey}
                    disabled={!canWrite || pending}
                    aria-describedby={`${uid}-key-hint`}
                    onChange={(e) => save({ isKey: e.target.checked }, { isKey: task.isKey })}
                  />
                  {t("keyTask.toggle")}
                </label>
                <p id={`${uid}-key-hint`} className="mt-1 text-muted-foreground text-tiny">
                  {t("keyTask.hint")}
                </p>
              </dd>
            </>
          )}
          {task.completedAt && (
            <>
              <dt className="text-muted-foreground text-small">{t("fields.completed")}</dt>
              <dd className="m-0 text-small">
                {formatDate(task.completedAt.slice(0, 10), locale)}
                {task.completedByName && ` · ${task.completedByName}`}
              </dd>
            </>
          )}
        </dl>

        {task.status === "done" && canWrite && isModuleVisible("estimates") && (
          <Section title={t("feedback.title")}>
            {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons */}
            <div role="group" aria-label={t("feedback.title")} className="flex flex-wrap gap-1">
              {FEEDBACK.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={task.effortFeedback === value}
                  disabled={pending}
                  onClick={() => feedback(value)}
                  className={cn(
                    "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 font-medium text-small focus-visible:outline-2 focus-visible:outline-ring",
                    task.effortFeedback === value
                      ? "border-foreground bg-foreground text-background"
                      : "border-input bg-card hover:bg-hover",
                  )}
                >
                  {task.effortFeedback === value && <Check aria-hidden className="size-4" />}
                  {t(`feedback.${value}`)}
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title={t("description")}>
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                aria-label={t("description")}
                rows={5}
                value={description}
                maxLength={4000}
                onChange={(e) => setDescription(e.target.value)}
                className={TEXTAREA_CLASS}
              />
              <div className="flex justify-end gap-2">
                <Button onClick={() => setEditing(false)}>{t("cancel")}</Button>
                <Button
                  variant="default"
                  disabled={pending || title.trim() === ""}
                  onClick={() => {
                    save(
                      { title, description },
                      { title: task.title, description: task.description },
                    );
                    setEditing(false);
                  }}
                >
                  {t("save")}
                </Button>
              </div>
            </div>
          ) : task.description ? (
            <p className="m-0 whitespace-pre-wrap text-small">{task.description}</p>
          ) : (
            <p className="m-0 text-muted-foreground text-small">{t("noDescription")}</p>
          )}
        </Section>

        <Section title={t("checklist", { done: checkDone, total: task.checkItems.length })}>
          {task.checkItems.length > 0 && (
            <ul className="flex flex-col gap-1">
              {task.checkItems.map((item) => (
                <li key={item.id}>
                  <label className="flex min-h-8 cursor-pointer items-center gap-2 text-small">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={!canWrite || pending}
                      onChange={(e) =>
                        startTransition(async () => {
                          const result = await tickCheckItem(task.id, item.id, e.target.checked);
                          if (!result.ok) showToast({ message: actions.errorText(result.error) });
                        })
                      }
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className={item.done ? "text-muted-foreground line-through" : undefined}>
                      {item.title}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = newItem.trim();
                if (!value) return;
                startTransition(async () => {
                  const result = await newCheckItem(task.id, value);
                  if (result.ok) setNewItem("");
                  else showToast({ message: actions.errorText(result.error) });
                });
              }}
            >
              <Input
                aria-label={t("addCheckItem")}
                placeholder={t("addCheckItem")}
                value={newItem}
                maxLength={200}
                onChange={(e) => setNewItem(e.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label={t("addCheckItemButton")}
                disabled={pending || !newItem.trim()}
              >
                <Plus aria-hidden />
              </Button>
            </form>
          )}
        </Section>

        {(task.requiresPhoto || task.requiresAttachment) && (
          <Section title={t("evidence.title")}>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-small">
              {task.requiresPhoto && (
                <li className="flex items-center gap-2">
                  <Camera aria-hidden className="size-4 text-muted-foreground" />
                  {t("evidence.photo")}:{" "}
                  <b
                    className={cn(
                      "font-semibold",
                      task.hasPhoto ? "text-status-ok" : "text-status-warn",
                    )}
                  >
                    {task.hasPhoto ? t("evidence.given") : t("evidence.missing")}
                  </b>
                </li>
              )}
              {task.requiresAttachment && (
                <li className="flex items-center gap-2">
                  <Paperclip aria-hidden className="size-4 text-muted-foreground" />
                  {t("evidence.attachment")}:{" "}
                  <b
                    className={cn(
                      "font-semibold",
                      task.hasAttachment ? "text-status-ok" : "text-status-warn",
                    )}
                  >
                    {task.hasAttachment ? t("evidence.given") : t("evidence.missing")}
                  </b>
                </li>
              )}
            </ul>
            {task.documents.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-small">
                {task.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-2">
                    <a
                      href={`/api/documents/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      title={d.fileName}
                      className="max-w-64 truncate font-medium text-accent-soft-foreground hover:underline"
                    >
                      {d.fileName}
                    </a>
                    <span className="text-muted-foreground text-tiny">
                      {d.kind === "photo" ? t("evidence.photo") : t("evidence.attachment")}
                    </span>
                    {canWrite && <ArchiveDocumentButton id={d.id} fileName={d.fileName} />}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (task.requiresPhoto || task.requiresAttachment) && (
              <div className="flex flex-wrap gap-2">
                {task.requiresPhoto && (
                  <DocumentUpload
                    link={{ taskId: task.id }}
                    kind="photo"
                    compact
                    label={t("evidence.addPhoto")}
                  />
                )}
                {task.requiresAttachment && (
                  <DocumentUpload
                    link={{ taskId: task.id }}
                    kind="other"
                    compact
                    label={t("evidence.addAttachment")}
                  />
                )}
              </div>
            )}
          </Section>
        )}

        {canWrite && !finished && (
          <Section title={t("completionNote.label")}>
            <textarea
              aria-label={t("completionNote.label")}
              rows={2}
              value={note}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
              className={TEXTAREA_CLASS}
            />
            <p className="text-muted-foreground text-tiny">{t("completionNote.hint")}</p>
          </Section>
        )}

        <details className="group">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md font-semibold text-small focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
            />
            {t("activity.title")}
            <span className="tabular font-normal text-muted-foreground">
              {task.activity.length}
            </span>
          </summary>
          <div className="mt-2">
            <TaskActivity entries={task.activity} />
          </div>
        </details>
      </Drawer>
      <SnoozeDialog
        open={snoozeDate}
        taskTitle={task.title}
        today={today}
        onCancel={() => setSnoozeDate(false)}
        onSubmit={(until) => {
          setSnoozeDate(false);
          actions.snooze(ref, until);
        }}
      />
      <ReasonDialog
        status={reasonFor}
        taskTitle={task.title}
        onCancel={() => setReasonFor(null)}
        onSubmit={(reason) => {
          if (reasonFor) actions.setStatus(ref, reasonFor, { reason });
          setReasonFor(null);
        }}
      />
    </>
  );
}
