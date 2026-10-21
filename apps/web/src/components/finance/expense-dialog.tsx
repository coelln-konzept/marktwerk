"use client";

import { parseMoneyCents } from "@marktwerk/core";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createExpenseAction } from "@/app/(app)/finanzen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatDateShort, formatMoney } from "@/lib/format";
import type { FinanceOptions } from "@/server/queries/finance";
import { SELECT_CLASS } from "./form-classes";

const CATEGORIES = [
  "transport_fuel",
  "vehicle",
  "equipment_rental",
  "staff_external",
  "security",
  "cleaning_waste",
  "toilets",
  "marketing",
  "water_power",
  "location",
  "permit",
  "gema",
  "insurance",
  "tax_fees",
  "other",
] as const;
const METHODS = ["card", "cash", "bank_transfer", "sepa_direct_debit", "other"] as const;

/**
 * "Ausgabe erfassen": quick entry of something that was already paid (fuel, cable ties). Eight
 * fields, so a modal. The receipt is added on the row afterwards (photo or file).
 */
export function ExpenseDialog({
  options,
  today,
  defaultEventId,
}: {
  options: Pick<FinanceOptions, "events" | "vehicles">;
  today: string;
  defaultEventId?: string;
}) {
  const t = useTranslations("finance.expense");
  const tCategories = useTranslations("finance.categories");
  const tMethods = useTranslations("finance.methods");
  const tErrors = useTranslations("finance.errors");
  const locale = useLocale();
  const { showToast } = useShell();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({
    spentOn: today,
    amount: "",
    category: "transport_fuel",
    description: "",
    merchant: "",
    eventId: defaultEventId ?? "",
    vehicleId: "",
    method: "card",
  });
  const [error, setError] = useState<{ field: string; code: string } | null>(null);
  const set = (field: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));
  const errorText = (code: string) =>
    tErrors.has(code as never) ? tErrors(code as never) : tErrors("generic");

  function openDialog() {
    setValues({
      spentOn: today,
      amount: "",
      category: "transport_fuel",
      description: "",
      merchant: "",
      eventId: defaultEventId ?? "",
      vehicleId: "",
      method: "card",
    });
    setError(null);
    setOpen(true);
  }

  function submit() {
    const amountCents = parseMoneyCents(values.amount);
    if (values.description.trim() === "")
      return setError({ field: "description", code: "description_required" });
    if (amountCents === null || amountCents <= 0)
      return setError({ field: "amount", code: "invalid_amount" });
    if (values.spentOn === "" || values.spentOn > today)
      return setError({ field: "spentOn", code: "invalid_date" });
    setError(null);
    startTransition(async () => {
      const result = await createExpenseAction({
        spentOn: values.spentOn,
        amountCents,
        category: values.category,
        description: values.description,
        merchant: values.merchant,
        eventId: values.eventId || null,
        vehicleId: values.vehicleId || null,
        method: values.method,
      });
      if (!result.ok) return setError({ field: "form", code: result.error });
      setOpen(false);
      showToast({
        message: t("saved", {
          description: values.description.trim(),
          amount: formatMoney(amountCents, locale),
        }),
      });
    });
  }

  const invalid = (field: string) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": "expense-error" }
      : {};

  return (
    <>
      <Button variant="default" onClick={openDialog}>
        <Plus aria-hidden />
        {t("new")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("title")}
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-date">{t("spentOn")}</Label>
              <Input
                id="exp-date"
                type="date"
                required
                max={today}
                value={values.spentOn}
                onChange={(e) => set("spentOn", e.target.value)}
                {...invalid("spentOn")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-amount">{t("amount")}</Label>
              <div className="relative">
                <Input
                  id="exp-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={values.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  className="tabular pr-8"
                  {...invalid("amount")}
                />
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                  €
                </span>
              </div>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="exp-desc">{t("descriptionLabel")}</Label>
              <Input
                id="exp-desc"
                maxLength={200}
                autoComplete="off"
                placeholder={t("descriptionPlaceholder")}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                {...invalid("description")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-merchant">{t("merchant")}</Label>
              <Input
                id="exp-merchant"
                maxLength={200}
                autoComplete="off"
                value={values.merchant}
                onChange={(e) => set("merchant", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-category">{t("category")}</Label>
              <select
                id="exp-category"
                value={values.category}
                onChange={(e) => set("category", e.target.value)}
                className={SELECT_CLASS}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tCategories(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-event">{t("event")}</Label>
              <select
                id="exp-event"
                value={values.eventId}
                onChange={(e) => set("eventId", e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">{t("noEvent")}</option>
                {options.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {formatDateShort(ev.startsOn, locale)} · {ev.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-vehicle">{t("vehicle")}</Label>
              <select
                id="exp-vehicle"
                value={values.vehicleId}
                onChange={(e) => set("vehicleId", e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">{t("noVehicle")}</option>
                {options.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.plate}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="exp-method">{t("method")}</Label>
              <select
                id="exp-method"
                value={values.method}
                onChange={(e) => set("method", e.target.value)}
                className={SELECT_CLASS}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {tMethods(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-faint-foreground text-small">{t("receiptHint")}</p>
          {error && (
            <p id="expense-error" role="alert" className="text-small text-status-critical">
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
