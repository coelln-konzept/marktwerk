"use client";

import { isIsoDate, parseMoneyCents } from "@marktwerk/core";
import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  addIncomeAction,
  archiveIncomeAction,
} from "@/app/(app)/veranstaltungen/[id]/geld/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/format";

/** "Einnahme erfassen": income of the event that is not a stall fee (sponsoring, bar). Four fields, a modal. */
export function IncomeDialog({ eventId }: { eventId: string }) {
  const t = useTranslations("eventMoney.income");
  const tErrors = useTranslations("finance.errors");
  const locale = useLocale();
  const { showToast } = useShell();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<{ field: string; code: string } | null>(null);
  const errorText = (code: string) =>
    tErrors.has(code as never) ? tErrors(code as never) : tErrors("generic");

  function openDialog() {
    setLabel("");
    setAmount("");
    setReceivedOn("");
    setNotes("");
    setError(null);
    setOpen(true);
  }

  function submit() {
    const amountCents = parseMoneyCents(amount);
    if (label.trim() === "") return setError({ field: "label", code: "label_required" });
    if (amountCents === null || amountCents <= 0)
      return setError({ field: "amount", code: "invalid_amount" });
    if (receivedOn !== "" && !isIsoDate(receivedOn))
      return setError({ field: "receivedOn", code: "invalid_date" });
    setError(null);
    startTransition(async () => {
      const result = await addIncomeAction(eventId, { label, amountCents, receivedOn, notes });
      if (!result.ok) return setError({ field: "form", code: result.error });
      setOpen(false);
      showToast({
        message: t("saved", { label: label.trim(), amount: formatMoney(amountCents, locale) }),
      });
    });
  }

  const invalid = (field: string) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": "income-error" }
      : {};

  return (
    <>
      <Button onClick={openDialog}>
        <Plus aria-hidden />
        {t("new")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("dialogTitle")}
        description={t("description")}
        closeLabel={t("cancel")}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="inc-label">{t("label")}</Label>
              <Input
                id="inc-label"
                maxLength={200}
                autoComplete="off"
                placeholder={t("labelPlaceholder")}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                {...invalid("label")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inc-amount">{t("amount")}</Label>
              <div className="relative">
                <Input
                  id="inc-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="tabular pr-8"
                  {...invalid("amount")}
                />
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                  €
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inc-date">{t("receivedOn")}</Label>
              <Input
                id="inc-date"
                type="date"
                value={receivedOn}
                onChange={(e) => setReceivedOn(e.target.value)}
                {...invalid("receivedOn")}
              />
              <p className="text-faint-foreground text-small">{t("receivedOnHint")}</p>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="inc-notes">{t("notes")}</Label>
              <Input
                id="inc-notes"
                maxLength={500}
                autoComplete="off"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p id="income-error" role="alert" className="text-small text-status-critical">
              {errorText(error.code)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** "Entfernen" on an income line: soft delete with an undo toast. */
export function ArchiveIncomeButton({ id, label }: { id: string; label: string }) {
  const t = useTranslations("eventMoney.income");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveIncomeAction(id);
      if (!result.ok) return showToast({ message: t("failed") });
      showToast({
        message: t("removed", { label: result.data.label }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await archiveIncomeAction(id, true);
          showToast({
            message: undone.ok ? t("restored", { label: undone.data.label }) : t("failed"),
          });
        },
      });
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      aria-label={t("remove", { label })}
      title={t("remove", { label })}
      onClick={archive}
      className="grid size-7 cursor-pointer place-items-center rounded-md hover:bg-hover disabled:cursor-progress disabled:opacity-60"
    >
      <Trash2 aria-hidden className="size-4" />
    </button>
  );
}
