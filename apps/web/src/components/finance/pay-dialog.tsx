"use client";

import { centsToInput, parseMoneyCents } from "@marktwerk/core";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { payInstallmentAction, undoPaymentAction } from "@/app/(app)/finanzen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/format";
import { SELECT_CLASS } from "./form-classes";

const METHODS = ["bank_transfer", "sepa_direct_debit", "cash", "card", "other"] as const;

export type PayableRate = {
  id: string;
  /** "Rate 2/3": position in the plan. */
  position: string;
  payableTitle: string;
  openCents: number;
};

/**
 * "Bezahlt": marks a rate as paid, which *is* the expense. Five fields, so a modal. The amount defaults
 * to what is still open (less = part payment). Saving shows an undo toast; a receipt can be added on the
 * row right afterwards ("Beleg fehlt").
 */
export function PayDialog({
  rate,
  today,
  staff,
  defaultStaffId,
  size = "sm",
}: {
  rate: PayableRate;
  today: string;
  staff: { id: string; name: string }[];
  defaultStaffId: string | null;
  size?: "sm" | "default";
}) {
  const t = useTranslations("finance.pay");
  const tMethods = useTranslations("finance.methods");
  const tErrors = useTranslations("finance.errors");
  const locale = useLocale();
  const { showToast } = useShell();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidBy, setPaidBy] = useState(defaultStaffId ?? "");
  const [error, setError] = useState<{ field: string; code: string } | null>(null);

  const errorText = (code: string) =>
    tErrors.has(code as never) ? tErrors(code as never) : tErrors("generic");

  function openDialog() {
    setPaidOn(today);
    setAmount(centsToInput(rate.openCents, locale !== "en"));
    setMethod("bank_transfer");
    setReference("");
    setPaidBy(defaultStaffId ?? "");
    setError(null);
    setOpen(true);
  }

  function submit() {
    const amountCents = parseMoneyCents(amount);
    if (amountCents === null || amountCents <= 0)
      return setError({ field: "amount", code: "invalid_amount" });
    if (amountCents > rate.openCents) return setError({ field: "amount", code: "amount_too_high" });
    if (paidOn === "" || paidOn > today)
      return setError({ field: "paidOn", code: "invalid_paid_on" });
    setError(null);
    startTransition(async () => {
      const result = await payInstallmentAction(rate.id, {
        paidOn,
        amountCents,
        method,
        reference,
        paidByStaffMemberId: paidBy === "" ? null : paidBy,
      });
      if (!result.ok) {
        setError({
          field: result.error === "amount_too_high" ? "amount" : "form",
          code: result.error,
        });
        return;
      }
      setOpen(false);
      const { previous, paidAmountCents, status } = result.data;
      showToast({
        message: t(status === "paid" ? "done" : "donePartial", {
          position: rate.position,
          amount: formatMoney(amountCents, locale),
        }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoPaymentAction(rate.id, previous, paidAmountCents);
          showToast({
            message: undone.ok
              ? t("reverted", { position: rate.position })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  const invalid = (field: string) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": "pay-error" }
      : {};

  return (
    <>
      <Button size={size} variant="default" onClick={openDialog}>
        <Check aria-hidden />
        {t("trigger")}
        <span className="sr-only">
          {rate.position} {rate.payableTitle}
        </span>
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("title", { position: rate.position })}
        description={t("description", {
          title: rate.payableTitle,
          open: formatMoney(rate.openCents, locale),
        })}
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-date">{t("paidOn")}</Label>
              <Input
                id="pay-date"
                type="date"
                required
                max={today}
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                {...invalid("paidOn")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-amount">{t("amount")}</Label>
              <div className="relative">
                <Input
                  id="pay-amount"
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
              <Label htmlFor="pay-method">{t("method")}</Label>
              <select
                id="pay-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={SELECT_CLASS}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {tMethods(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-by">{t("paidBy")}</Label>
              <select
                id="pay-by"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">{t("nobody")}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="pay-ref">{t("reference")}</Label>
              <Input
                id="pay-ref"
                maxLength={200}
                autoComplete="off"
                placeholder={t("referencePlaceholder")}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
          <p className="text-faint-foreground text-small">{t("partHint")}</p>
          {error && (
            <p id="pay-error" role="alert" className="text-small text-status-critical">
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
