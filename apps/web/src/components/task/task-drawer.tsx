"use client";

import { Menu } from "@base-ui/react/menu";
import type { TaskStatusKey } from "@marktwerk/core";
import {
  AlarmClockOff,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileX,
  Paperclip,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { editTask, giveEffortFeedback, newSubtask } from "@/app/(app)/board/actions";
import { ReasonDialog } from "@/components/board/reason-dialog";
import { CategoryTag, DueLine } from "@/components/board/task-bits";
import { type OptimisticPatch, useTaskActions } from "@/components/board/use-task-actions";
import { ArchiveDocumentButton } from "@/components/documents/archive-document-button";
import { DocumentUpload } from "@/components/documents/upload";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { TaskNextTimeNote } from "@/components/next-time-notes/task-next-time-note";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { OptionalMark } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { callAction } from "@/lib/call-action";
import { formatDate, formatDateWeekdayDay } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { formatEstimate, REASON_STATUSES, TASK_STATUS_UI } from "@/lib/task-ui";
import { cn } from "@/lib/utils";
import type { StaffOption, SubtaskRow, TaskDetail } from "@/server/queries/tasks";
import type { NotifyInput } from "@/server/services/tasks";
import { keptSubtasks, notifyNeedsDue, pendingSubtasks, type QueuedSubtask } from "./drawer-logic";
import { DueDateInput } from "./due-input";
import type { NotifyRecipient } from "./notify-fields";
import { NotifySection } from "./notify-section";
import { SnoozeDialog, useSnoozePresets } from "./snooze";
import { SubtaskList } from "./subtask-list";
import { TaskActivity } from "./task-activity";
import { isTickFinished, TickMark } from "./task-tick";

const FEEDBACK = ["as_planned", "longer", "shorter"] as const;

/** What a tick, delete or assignment of a subtask looks like before the server has answered. */
function patchSubtasks(rows: SubtaskRow[], patch: OptimisticPatch): SubtaskRow[] {
  switch (patch.kind) {
    case "status":
      return rows.map((r) =>
        r.id === patch.id
          ? {
              ...r,
              status: patch.status,
              overdue: r.overdue && !isTickFinished(patch.status),
            }
          : r,
      );
    case "remove":
      return rows.filter((r) => r.id !== patch.id);
    case "assign":
      return rows.map((r) =>
        r.id === patch.id
          ? { ...r, assigneeId: patch.assigneeId, assigneeName: patch.assigneeName }
          : r,
      );
    default:
      return rows;
  }
}

const WaitingIcon = TASK_STATUS_UI.waiting_external.icon;

/** Every status a person sets, in the status badge's menu (Erledigt and Wartet also have their own buttons). */
const MENU_STATUSES = [
  "todo",
  "in_progress",
  "waiting_external",
  "blocked",
  "skipped",
  "done",
] as const;

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
 * feedback, snooze ("Zurückstellen"), description, subtasks (ADR 0021; a subtask links back to its parent
 * instead), evidence, an optional completion note and the task's activity.
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
  canDelete = false,
  today,
  closeHref,
}: {
  task: TaskDetail;
  staff: StaffOption[];
  canWrite: boolean;
  canAssign: boolean;
  /** "Löschen" (UT2-13): owner, manager and staff (`task:delete`). */
  canDelete?: boolean;
  today: string;
  closeHref: string;
}) {
  const t = useTranslations("tasks");
  const tStatus = useTranslations("tasks.status");
  const tToast = useTranslations("board.toast");
  const locale = useLocale();
  const { showToast, showError } = useShell();
  const search = useSearchParams();
  const router = useRouter();
  // The URL says whether the drawer is open: closing replaces it before the server has answered.
  const isOpen = search.get("aufgabe") === task.id || search.get("detail") === `task:${task.id}`;
  // Ticking, deleting or assigning a subtask shows at once, the progress counter included (UX-068).
  const [subtasks, applySubtaskPatch] = useOptimistic(task.subtasks, patchSubtasks);
  const actions = useTaskActions({ staff, scopeEventId: task.eventId, apply: applySubtaskPatch });
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [notifyEditing, setNotifyEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [requiresPhoto, setRequiresPhoto] = useState(task.requiresPhoto);
  const [requiresAttachment, setRequiresAttachment] = useState(task.requiresAttachment);
  const [reasonFor, setReasonFor] = useState<TaskStatusKey | null>(null);
  const [note, setNote] = useState("");
  const [snoozeDate, setSnoozeDate] = useState(false);
  const presets = useSnoozePresets(today);
  const tSnooze = useTranslations("tasks.snooze");
  const tNotify = useTranslations("board.notify");
  const [newItem, setNewItem] = useState("");
  const [queued, setQueued] = useState<QueuedSubtask[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const queueKey = useRef(0);
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const focusEditButton = useRef(false);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const restoring = useRef(false);
  // The task the drawer shows now: it stays mounted when another task opens in it (a subtask link, the
  // parent link, another row), so a subtask save that finishes later must not touch that one's field.
  const shown = useRef({ id: task.id, open: isOpen });
  useEffect(() => {
    shown.current = { id: task.id, open: isOpen };
  }, [task.id, isOpen]);
  const uid = useId();

  const finished = task.status === "done" || task.status === "skipped";
  // A deleted task (status `cancelled`) says so and can only be restored (UX-060). One cancelled together
  // with its event comes back with the event, not by "Wiederherstellen" (that would make it a lone Offen).
  const deleted = task.status === "cancelled";
  const canRestore = canDelete && !task.eventCancelled;
  const writable = canWrite && !deleted;
  const ref = { id: task.id, title: task.title, status: task.status };

  /**
   * Saves a change of this task (or of one of its subtasks: `id`); `undo` is the patch that puts the old
   * values back (the toast's "Rückgängig").
   */
  function save(
    patch: Parameters<typeof editTask>[1],
    undo?: Parameters<typeof editTask>[1],
    target: { id: string; title: string } = task,
  ): Promise<boolean> {
    // Every toast names the task it is about (UX-031); a renamed task by its new title.
    const named = patch.title?.trim() || target.title;
    const message =
      patch.dueOn === null ? t("dueCleared", { title: named }) : t("savedTitle", { title: named });
    // Resolves to whether it was saved, so a field can show the saved value again after a refusal.
    return new Promise((resolve) =>
      startTransition(async () => {
        const result = await callAction(() => editTask(target.id, patch));
        resolve(result.ok);
        if (!result.ok) {
          showError(actions.errorText(result.error));
          return;
        }
        if (!result.data.changed) {
          showToast({ message: t("unchanged") });
          return;
        }
        if (!undo) {
          showToast({ message });
          return;
        }
        showToast({
          message,
          actionLabel: tToast("undo"),
          onAction: async () => {
            const back = await callAction(() => editTask(target.id, undo));
            if (back.ok) showToast({ message: tToast("revertedTitle", { title: target.title }) });
            else showError(actions.errorText(back.error));
          },
        });
      }),
    );
  }

  /** While Team is hidden the recipient is whoever set the notification (the signed-in user by default). */
  const recipient: NotifyRecipient | null = isModuleVisible("team")
    ? task.assigneeName
      ? {
          kind: "person",
          name: task.assigneeName,
          hasEmail: task.assigneeHasEmail,
          hasPhone: task.assigneeHasPhone,
        }
      : null
    : task.notifyUser?.name && task.notifyUser.id !== task.notifySelf.id
      ? { kind: "person", name: task.notifyUser.name, hasEmail: null, hasPhone: null }
      : { kind: "self", email: task.notifySelf.email, hasPhone: task.notifySelf.hasPhone };

  /** Saves the notify setting; the editor stays open until this resolves without an error text. */
  async function saveNotify(next: NotifyInput): Promise<string | null> {
    const result = await editTask(task.id, { notify: next });
    if (!result.ok) return actions.errorText(result.error);
    const undo = { notify: task.notify };
    if (!result.data.changed) {
      showToast({ message: t("unchanged") });
      return null;
    }
    showToast({
      message: t("savedTitle", { title: task.title }),
      actionLabel: tToast("undo"),
      onAction: async () => {
        const back = await callAction(() => editTask(task.id, undo));
        if (back.ok) showToast({ message: tToast("revertedTitle", { title: task.title }) });
        else showError(actions.errorText(back.error));
      },
    });
    return null;
  }

  /**
   * Due date of this task or a subtask (`DueDateInput` commits once per value; null = the field was cleared,
   * saved as "Kein Datum" with undo); undo restores the flags. Resolves to whether it was saved.
   */
  function saveDue(
    target: Pick<SubtaskRow, "id" | "title" | "dueOn" | "dueOverridden" | "customized">,
    value: string | null,
  ): Promise<boolean> {
    return save(
      { dueOn: value },
      {
        dueOn: target.dueOn,
        restoreFlags: { dueOverridden: target.dueOverridden, customized: target.customized },
      },
      target,
    );
  }

  /**
   * "Unteraufgabe hinzufügen" (Enter): the field empties at once and keeps the focus for the next one; the
   * new row shows "wird angelegt …" until it is saved. The saves run one after another in the order typed,
   * outside the drawer's own pending state, so quick Enters are never lost (UX-021). A failed one says so and
   * comes back into the field if it is empty and its task is still the one open.
   */
  function addSubtask(value: string) {
    const key = ++queueKey.current;
    const parentId = task.id;
    setNewItem("");
    setQueued((list) => [...list, { key, parentId, title: value, id: null }]);
    queue.current = queue.current.then(async () => {
      const result = await callAction(() => newSubtask(parentId, value));
      if (result.ok) {
        const { id } = result.data;
        setQueued((list) => list.map((q) => (q.key === key ? { ...q, id } : q)));
        return;
      }
      setQueued((list) => list.filter((q) => q.key !== key));
      if (shown.current.id === parentId && shown.current.open)
        setNewItem((draft) => (draft === "" ? value : draft));
      showError(t("subtask.addFailed", { title: value, reason: actions.errorText(result.error) }));
    });
  }

  // A saved subtask leaves the queue once its row has arrived with the refreshed task; one of another task
  // once it is saved (it shows with that task when it opens again).
  useEffect(() => {
    const saved = task.subtasks.map((s) => s.id);
    setQueued((list) => {
      const left = keptSubtasks(list, task.id, saved);
      return left.length === list.length ? list : left;
    });
  }, [task.id, task.subtasks]);

  /** Opens the title and description editor; its title field takes the focus. */
  function startEditing() {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setRequiresPhoto(task.requiresPhoto);
    setRequiresAttachment(task.requiresAttachment);
    setTitleError(false);
    setEditing(true);
  }

  /** Closes the editor; the focus goes back to the pencil that opened it (UX-030). */
  function stopEditing() {
    focusEditButton.current = true;
    setTitleError(false);
    setEditing(false);
  }

  function saveEdit() {
    if (title.trim() === "") {
      // An empty title is said at the field instead of only greying out "Speichern" (UX-068).
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    save(
      { title, description, requiresPhoto, requiresAttachment },
      {
        title: task.title,
        description: task.description,
        requiresPhoto: task.requiresPhoto,
        requiresAttachment: task.requiresAttachment,
      },
    );
    stopEditing();
  }

  useEffect(() => {
    if (editing) {
      titleRef.current?.focus();
      return;
    }
    if (!focusEditButton.current) return;
    focusEditButton.current = false;
    editButtonRef.current?.focus();
  }, [editing]);

  // "Wiederherstellen" disappears with the restore: the focus moves on to the Erledigt toggle instead of
  // falling to the page (UX-060).
  useEffect(() => {
    if (deleted || !restoring.current) return;
    restoring.current = false;
    doneButtonRef.current?.focus();
  }, [deleted]);

  /** Optimistic close: drop the drawer and the URL parameter now; the opener gets its focus back. */
  const close = useCallback(() => {
    window.history.replaceState(null, "", closeHref);
  }, [closeHref]);

  // Reset what was typed when the drawer closes, so reopening starts clean.
  useEffect(() => {
    if (isOpen) return;
    setEditing(false);
    setNotifyEditing(false);
    setNote("");
    setNewItem("");
    setTitleError(false);
  }, [isOpen]);

  // Esc and × close at once. Typing that is not saved yet is kept: the first Esc only leaves the field.
  const hasDraft = editing || notifyEditing || note !== "" || newItem !== "";
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
      if (result.ok) showToast({ message: t("feedback.saved") });
      else showError(actions.errorText(result.error));
    });
  }

  const StatusIcon = TASK_STATUS_UI[task.status].icon;
  const waitingNow = task.status === "waiting_external";
  const buttonBase =
    "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 font-medium text-small focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-60";

  // Erledigt is a toggle like the row ticks: pressed (green) while finished, a second click reopens. Open
  // task: also the Wartet toggle. The status badge (colour + icon + text) opens a menu with every status.
  // A deleted task (still reachable by a link or the search): no status controls, a "Gelöscht" status and
  // "Wiederherstellen" for those who may delete (UX-060).
  const deletedHeader = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="critical" icon={Trash2}>
          {task.eventCancelled ? t("deleted.eventBadge") : t("deleted.badge")}
        </StatusBadge>
        {canRestore && (
          <Button
            size="sm"
            disabled={actions.pending}
            onClick={() => {
              restoring.current = true;
              actions.restore(ref);
            }}
          >
            <RotateCcw aria-hidden />
            {t("deleted.restore")}
          </Button>
        )}
      </div>
      <p className="m-0 text-muted-foreground text-small">
        {task.eventCancelled
          ? t("deleted.eventHint")
          : canRestore
            ? t("deleted.hint")
            : t("deleted.hintNoRestore")}
      </p>
    </div>
  );

  const statusHeader = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={doneButtonRef}
          type="button"
          aria-pressed={finished}
          disabled={!writable}
          title={finished ? t("reopen") : undefined}
          aria-label={finished ? t("reopenAria", { title: task.title }) : undefined}
          onClick={() => (finished ? actions.setStatus(ref, "todo") : pickStatus("done"))}
          className={cn(
            buttonBase,
            "group/tick",
            finished
              ? "border-status-ok bg-status-ok-bg text-foreground hover:bg-hover"
              : "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
          )}
        >
          <TickMark
            status={task.status}
            className={cn("size-4", !finished && "border-primary-foreground")}
          />
          {t(`statusLong.${task.status === "skipped" ? "skipped" : "done"}`)}
        </button>
        {!finished && (
          <button
            type="button"
            aria-pressed={waitingNow}
            disabled={!writable}
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
        )}
        {writable ? (
          <Menu.Root>
            <Menu.Trigger
              aria-label={t("statusChange", { status: tStatus(task.status) })}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-muted-foreground text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover"
            >
              {t("statusLabel")}:
              <StatusBadge tone={TASK_STATUS_UI[task.status].tone} icon={StatusIcon}>
                {tStatus(task.status)}
              </StatusBadge>
              <ChevronDown aria-hidden className="size-4" />
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
                        {t(`statusLong.${status}`)}
                        {on && <Check aria-hidden className="ml-auto size-4" />}
                      </Menu.Item>
                    );
                  })}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-small">
            {t("statusLabel")}:
            <StatusBadge tone={TASK_STATUS_UI[task.status].tone} icon={StatusIcon}>
              {tStatus(task.status)}
            </StatusBadge>
          </span>
        )}
        {canDelete && (
          <button
            type="button"
            aria-label={t("deleteAria", { title: task.title })}
            onClick={() => {
              actions.remove(ref);
              router.replace(closeHref as never);
            }}
            className="ml-auto inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-muted-foreground text-small hover:bg-hover hover:text-status-critical focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Trash2 aria-hidden className="size-4" />
            {t("delete")}
          </button>
        )}
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
            ) : task.season ? (
              // A season task names its market and season and links to the market page (research 13 §6.3).
              task.season.href ? (
                <Link href={task.season.href as never} className="truncate hover:underline">
                  {t("seasonContext", { name: task.season.name, year: String(task.season.year) })}
                </Link>
              ) : (
                <span className="truncate">
                  {t("seasonContext", { name: task.season.name, year: String(task.season.year) })}
                </span>
              )
            ) : (
              <span>{t("noEvent")}</span>
            )}
            <span className="text-faint-foreground">·</span>
            <span>{t("label")}</span>
          </>
        }
        title={
          editing ? (
            <span className="flex flex-col gap-1">
              <Input
                ref={titleRef}
                aria-label={t("fields.title")}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError && e.target.value.trim() !== "") setTitleError(false);
                }}
                onKeyDown={(e) => {
                  // Enter saves, like every other one-line field in the drawer.
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (!pending) saveEdit();
                }}
                maxLength={200}
                aria-invalid={titleError || undefined}
                aria-describedby={titleError ? `${uid}-title-error` : undefined}
              />
              {titleError && (
                <span
                  id={`${uid}-title-error`}
                  role="alert"
                  className="flex items-start gap-1.5 font-normal text-small text-status-critical"
                >
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t("create.errors.title_required")}
                </span>
              )}
            </span>
          ) : (
            task.title
          )
        }
        titleExtra={
          writable && !editing ? (
            <Button
              ref={editButtonRef}
              variant="ghost"
              size="icon-sm"
              aria-label={t("edit")}
              title={t("edit")}
              onClick={startEditing}
            >
              <Pencil aria-hidden />
            </Button>
          ) : null
        }
        header={deleted ? deletedHeader : statusHeader}
        closeHref={closeHref}
      >
        {task.parent && (
          <p className="m-0 text-muted-foreground text-small">
            {t.rich("parentTask", {
              title: task.parent.title,
              link: (chunks) => (
                <Link
                  href={actions.drawer.open(task.parent?.id ?? "") as never}
                  scroll={false}
                  className="rounded-sm font-medium text-accent-soft-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}
        <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
          <dt className="text-muted-foreground text-small">
            <label htmlFor={`${uid}-due`}>{t("fields.due")}</label>
          </dt>
          <dd className="m-0 flex flex-wrap items-center gap-2">
            {writable ? (
              <DueDateInput
                id={`${uid}-due`}
                value={task.dueOn}
                pending={pending}
                clearBlocked={notifyNeedsDue(task.notify) ? t("dueRequiredByNotify") : null}
                onCommit={(value) => saveDue(task, value)}
              />
            ) : (
              <span className="tabular">
                {task.dueOn ? formatDate(task.dueOn, locale) : t("due.none")}
              </span>
            )}
            {!deleted && (
              <DueLine dueOn={task.dueOn} today={today} status={task.status} completedOn={null} />
            )}
            {/* Only a task of an event ever followed the event date (UX-068). */}
            {task.dueOverridden && task.eventId && (
              <span className="text-muted-foreground text-tiny">{t("dueSetByHand")}</span>
            )}
            {task.snoozedUntil && !finished && (
              <span className="tabular inline-flex items-center gap-1 rounded-sm bg-sunken px-1.5 py-0.5 text-muted-foreground text-small">
                <AlarmClockOff aria-hidden className="size-3.5" />
                {tSnooze("until", { date: formatDateWeekdayDay(task.snoozedUntil, locale) })}
              </span>
            )}
          </dd>

          {writable && !finished && (
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
                {writable ? (
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
                {canAssign && !deleted ? (
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

          <dt className="text-muted-foreground text-small">{tNotify("title")}</dt>
          <dd className="m-0">
            <NotifySection
              key={isOpen ? "open" : "closed"}
              saved={task.notify}
              recipient={recipient}
              hasDue={task.dueOn !== null}
              canWrite={writable && !finished}
              onEditingChange={setNotifyEditing}
              onSave={saveNotify}
            />
          </dd>

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
          {isModuleVisible("keyTasks") && (writable || task.isKey) && (
            <>
              <dt className="text-muted-foreground text-small">{t("keyTask.label")}</dt>
              <dd className="m-0">
                <label className="flex items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--primary)"
                    checked={task.isKey}
                    disabled={!writable || pending}
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

        {task.status === "done" && writable && isModuleVisible("estimates") && (
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
              <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                <legend className="mb-1 font-semibold text-small">{t("evidence.title")}</legend>
                <label className="flex min-h-8 items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--primary)"
                    checked={requiresPhoto}
                    onChange={(e) => setRequiresPhoto(e.target.checked)}
                  />
                  {t("evidence.requirePhoto")}
                </label>
                <label className="flex min-h-8 items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--primary)"
                    checked={requiresAttachment}
                    onChange={(e) => setRequiresAttachment(e.target.checked)}
                  />
                  {t("evidence.requireAttachment")}
                </label>
                <p className="m-0 text-muted-foreground text-tiny">{t("evidence.requireHint")}</p>
              </fieldset>
              <div className="flex justify-end gap-2">
                <Button onClick={stopEditing}>{t("cancel")}</Button>
                <Button variant="default" disabled={pending} onClick={saveEdit}>
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

        {/* Subtasks (ADR 0021): one level, so a subtask has none of its own. */}
        {!task.parent && (
          <SubtaskList
            subtasks={subtasks}
            staff={staff}
            today={today}
            canWrite={writable}
            canAssign={canAssign && !deleted}
            canDelete={canDelete && !deleted}
            pending={pending}
            actions={actions}
            onSaveDue={saveDue}
            draft={newItem}
            onDraftChange={setNewItem}
            onAdd={addSubtask}
            queued={pendingSubtasks(
              queued,
              task.id,
              task.subtasks.map((s) => s.id),
            )}
          />
        )}

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
                    {writable && <ArchiveDocumentButton id={d.id} fileName={d.fileName} />}
                  </li>
                ))}
              </ul>
            )}
            {writable && (task.requiresPhoto || task.requiresAttachment) && (
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

        {writable && !finished && (
          <Section
            title={
              <>
                {t("completionNote.label")} <OptionalMark />
              </>
            }
          >
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

        {/* Everyone with task:write may also write notes (permissions.ts); the service checks again. */}
        {canWrite && task.market && (
          <TaskNextTimeNote key={task.id} taskId={task.id} marketName={task.market.name} />
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
