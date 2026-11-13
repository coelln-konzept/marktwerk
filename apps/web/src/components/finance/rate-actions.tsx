"use client";

import { Ban, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  cancelInstallmentAction,
  cancelPayableAction,
  reopenInstallmentsAction,
} from "@/app/(app)/finanzen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { type PayableRate, PayDialog } from "./pay-dialog";

/**
 * What can be done with one rate: "Bezahlt" while money is open, "Rate entfällt" while nothing is paid
 * on it, "Wieder öffnen" once cancelled. Cancelling is undone by a toast, not confirmed first.
 */
export function RateActions({
  rate,
  status,
  today,
  staff,
  defaultStaffId,
}: {
  rate: PayableRate;
  status: "open" | "partially_paid" | "paid" | "cancelled";
  today: string;
  staff: { id: string; name: string }[];
  defaultStaffId: string | null;
}) {
  const t = useTranslations("finance.rate");
  const tErrors = useTranslations("finance.errors");
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();

  const errorText = (code: string) =>
    tErrors.has(code as never) ? tErrors(code as never) : tErrors("generic");

  function cancel() {
    startTransition(async () => {
      const result = await cancelInstallmentAction(rate.id);
      if (!result.ok) return showError(errorText(result.error));
      showToast({
        message: t("cancelled", { position: rate.position }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await reopenInstallmentsAction([rate.id]);
          if (undone.ok) showToast({ message: t("reopened", { position: rate.position }) });
          else showError(errorText(undone.error));
        },
      });
    });
  }

  function reopen() {
    startTransition(async () => {
      const result = await reopenInstallmentsAction([rate.id]);
      if (result.ok) showToast({ message: t("reopened", { position: rate.position }) });
      else showError(errorText(result.error));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rate.openCents > 0 && status !== "cancelled" && (
        <PayDialog rate={rate} today={today} staff={staff} defaultStaffId={defaultStaffId} />
      )}
      {status === "open" && (
        <Button size="sm" variant="ghost" disabled={pending} aria-busy={pending} onClick={cancel}>
          <Ban aria-hidden />
          {t("cancel")}
          <span className="sr-only">{rate.position}</span>
        </Button>
      )}
      {status === "cancelled" && (
        <Button size="sm" variant="ghost" disabled={pending} aria-busy={pending} onClick={reopen}>
          <Undo2 aria-hidden />
          {t("reopen")}
          <span className="sr-only">{rate.position}</span>
        </Button>
      )}
    </div>
  );
}

/** "Posten stornieren": cancels every rate without a payment; an undo toast reopens them. */
export function CancelPayableButton({ payableId, title }: { payableId: string; title: string }) {
  const t = useTranslations("finance.detail");
  const tErrors = useTranslations("finance.errors");
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const result = await cancelPayableAction(payableId);
      if (!result.ok) {
        showError(
          tErrors.has(result.error as never) ? tErrors(result.error as never) : tErrors("generic"),
        );
        return;
      }
      const ids = result.data.cancelledIds;
      showToast({
        message: t("cancelledToast", { title: result.data.title, count: ids.length }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await reopenInstallmentsAction(ids);
          if (undone.ok) showToast({ message: t("reopenedToast", { title }) });
          else showError(tErrors("generic"));
        },
      });
    });
  }

  return (
    <Button disabled={pending} aria-busy={pending} onClick={cancel}>
      <Ban aria-hidden />
      {t("cancelPayable")}
    </Button>
  );
}
