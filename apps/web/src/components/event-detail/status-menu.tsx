"use client";

import { Dialog } from "@base-ui/react/dialog";
import { allowedTransitions, type EventStatus } from "@marktwerk/core/events/lifecycle";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { changeStatus, undoStatus } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { isModuleHidden } from "@/lib/modules";
import { TEXTAREA_CLASS } from "./textarea-class";

/**
 * Status change of an event: the allowed targets (core lifecycle) for the "…" menu, a reason dialog only
 * when cancelling, then an undo toast instead of a confirmation dialog (UX concept §6). "abgerechnet" is
 * a finance step and not offered while finance is hidden.
 */
export function useStatusChange({
  eventId,
  eventName,
  status,
}: {
  eventId: string;
  eventName: string;
  status: EventStatus;
}) {
  const t = useTranslations("eventDetail");
  const tStatus = useTranslations("status.event");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const targets = allowedTransitions(status).filter(
    (to) => !(to === "closed" && isModuleHidden("finance")),
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
        showToast({ message: errorText(result.error) });
        return;
      }
      setCancelOpen(false);
      setReason("");
      const { from, previousReason } = result.data;
      showToast({
        message: t("status.changed", { from: tStatus(from as EventStatus), to: tStatus(to) }),
        actionLabel: t("status.undo"),
        onAction: async () => {
          const undone = await undoStatus(eventId, to, from, previousReason);
          showToast(
            undone.ok
              ? { message: t("status.reverted", { to: tStatus(from as EventStatus) }) }
              : { message: errorText(undone.error) },
          );
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
          <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-40 flex w-[min(480px,calc(100%-2rem))] flex-col gap-4 rounded-xl border bg-card p-5 shadow-overlay outline-hidden">
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
              {t("cancel.description", { name: eventName })}
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

  return { targets, choose, pending, dialog };
}
