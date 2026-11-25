"use client";

import { Dialog } from "@base-ui/react/dialog";
import { allowedTransitions, type EventStatus } from "@marktwerk/core/events/lifecycle";
import { Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import {
  changeStatus,
  restoreCancelled,
  undoStatus,
} from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { isModuleHidden } from "@/lib/modules";
import { TEXTAREA_CLASS } from "./textarea-class";

/** Toast text of a status change, with the tasks it cancelled or reopened (UX-049). */
function useStatusMessages() {
  const t = useTranslations("eventDetail");
  const tStatus = useTranslations("status.event");
  const name = (s: string) => tStatus(s as EventStatus);
  const withTasks = (text: string, to: string, tasks: number) =>
    tasks > 0
      ? `${text} · ${t(to === "cancelled" ? "status.tasksCancelled" : "status.tasksReopened", { count: tasks })}`
      : text;
  return {
    changed: (from: string, to: string, tasks: number) =>
      withTasks(t("status.changed", { from: name(from), to: name(to) }), to, tasks),
    reverted: (to: string, tasks: number) =>
      withTasks(t("status.reverted", { to: name(to) }), to, tasks),
    restored: (to: string, tasks: number) =>
      withTasks(t("status.restored", { to: name(to) }), to, tasks),
  };
}

/**
 * "Absage aufheben" (UX-049): back to the status before the cancellation, with the cancelled tasks reopened,
 * then an undo toast that cancels again with the old reason. Used by the "…" menu and the "Abgesagt" banner.
 */
export function useRestoreCancelled(eventId: string) {
  const t = useTranslations("eventDetail");
  const messages = useStatusMessages();
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();
  const errorText = (code: string) =>
    t.has(`status.errors.${code}` as never)
      ? t(`status.errors.${code}` as never)
      : t("status.errors.generic");

  function restore() {
    startTransition(async () => {
      const result = await restoreCancelled(eventId);
      if (!result.ok) {
        showError(errorText(result.error));
        return;
      }
      const { to, previousReason, tasks } = result.data;
      showToast({
        message: messages.restored(to, tasks),
        actionLabel: t("status.undo"),
        onAction: async () => {
          const undone = await undoStatus(eventId, to, "cancelled", previousReason);
          if (undone.ok) showToast({ message: messages.reverted("cancelled", undone.data.tasks) });
          else showError(errorText(undone.error));
        },
      });
    });
  }
  return { restore, pending };
}

/** The banner's "Absage aufheben" button. */
export function RestoreCancelledButton({ eventId, label }: { eventId: string; label: string }) {
  const { restore, pending } = useRestoreCancelled(eventId);
  return (
    <Button onClick={restore} disabled={pending} aria-busy={pending} className="self-start">
      <Undo2 aria-hidden className="size-4" />
      {label}
    </Button>
  );
}

/**
 * Status change of an event: the allowed targets (core lifecycle) for the "…" menu, a reason dialog only
 * when cancelling, then an undo toast instead of a confirmation dialog (UX concept §6). "abgerechnet" is
 * a finance step and not offered while finance is hidden. A cancelled event offers "Absage aufheben"
 * (`restore`) instead of the bare way back to the draft.
 */
export function useStatusChange({
  eventId,
  eventName,
  status,
  openTasks,
}: {
  eventId: string;
  eventName: string;
  status: EventStatus;
  /** Open tasks the cancellation would close, for the dialog; unknown in the list rows. */
  openTasks?: number;
}) {
  const t = useTranslations("eventDetail");
  const messages = useStatusMessages();
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const restoring = useRestoreCancelled(eventId);
  const canRestore = status === "cancelled";
  const targets = allowedTransitions(status).filter(
    (to) => !(to === "closed" && isModuleHidden("finance")) && !(canRestore && to === "draft"),
  );

  const errorText = (code: string) =>
    t.has(`status.errors.${code}` as never)
      ? t(`status.errors.${code}` as never)
      : t("status.errors.generic");

  function run(to: EventStatus, why?: string) {
    setError(null);
    startTransition(async () => {
      const result = await changeStatus(eventId, to, why);
      if (!result.ok) {
        if (to === "cancelled" && result.error === "reason_required") {
          setError(errorText(result.error));
          return;
        }
        setCancelOpen(false);
        showError(errorText(result.error));
        return;
      }
      setCancelOpen(false);
      setReason("");
      const { from, previousReason, tasks } = result.data;
      showToast({
        message: messages.changed(from, to, tasks),
        actionLabel: t("status.undo"),
        onAction: async () => {
          const undone = await undoStatus(eventId, to, from, previousReason);
          if (undone.ok) showToast({ message: messages.reverted(from, undone.data.tasks) });
          else showError(errorText(undone.error));
        },
      });
    });
  }

  /** Picks a target: cancelling opens the reason dialog first. */
  function choose(to: EventStatus) {
    if (to === "cancelled") {
      setReason("");
      setError(null);
      setCancelOpen(true);
    } else run(to);
  }

  const dialog = (
    <>
      <Dialog.Root open={cancelOpen} onOpenChange={(open) => !pending && setCancelOpen(open)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim" />
          <Dialog.Popup
            initialFocus={reasonRef}
            className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-40 flex w-[min(480px,calc(100%-2rem))] flex-col gap-4 rounded-xl border bg-card p-5 shadow-overlay outline-hidden"
          >
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="font-semibold text-lg">{t("cancel.title")}</Dialog.Title>
              <Dialog.Close
                aria-label={t("cancel.cancel")}
                className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover"
              >
                <X aria-hidden className="size-4" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="text-muted-foreground text-small">
              {openTasks === undefined
                ? t("cancel.description", { name: eventName })
                : t("cancel.descriptionCount", { name: eventName, count: openTasks })}
            </Dialog.Description>
            <form
              noValidate
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reason.trim()) {
                  setError(errorText("reason_required"));
                  return;
                }
                run("cancelled", reason);
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cancel-reason">{t("cancel.reason")}</Label>
                <textarea
                  id="cancel-reason"
                  ref={reasonRef}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "cancel-reason-error" : undefined}
                  placeholder={t("cancel.placeholder")}
                  className={`${TEXTAREA_CLASS} resize-y`}
                />
                {error && (
                  <p
                    id="cancel-reason-error"
                    role="alert"
                    className="text-small text-status-critical"
                  >
                    {error}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Dialog.Close render={<Button disabled={pending} />}>
                  {t("cancel.cancel")}
                </Dialog.Close>
                <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
                  {t("cancel.submit")}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );

  return {
    targets,
    choose,
    canRestore,
    restore: restoring.restore,
    pending: pending || restoring.pending,
    dialog,
  };
}
