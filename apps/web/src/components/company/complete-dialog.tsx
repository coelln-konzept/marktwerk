"use client";

import { parseCostCents, parseWholeNumber } from "@marktwerk/core";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { completeObligationAction, undoCompletionAction } from "@/app/(app)/firma/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatNumber } from "@/lib/format";
import { useErrorText } from "./shared";

export type CompleteTarget = {
  id: string;
  title: string;
  kind: string;
  /** Has a km interval: the reading is required. */
  intervalKm: number | null;
  /** Belongs to a vehicle: a reading can be given (and updates the odometer). */
  onVehicle: boolean;
  currentKm: number | null;
};

/**
 * "Erledigt …": date, km (vehicle obligations), cost and a note; a licence check also needs who checked.
 * Five fields at most, so a modal. Saving rolls the next due date/km forward and shows an undo toast.
 */
export function CompleteButton({
  target,
  today,
  size = "default",
  variant = "outline",
}: {
  target: CompleteTarget;
  today: string;
  size?: "default" | "sm";
  variant?: "outline" | "default";
}) {
  const t = useTranslations("company");
  const tc = useTranslations("company.complete");
  const locale = useLocale();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [doneOn, setDoneOn] = useState(today);
  const [km, setKm] = useState("");
  const [cost, setCost] = useState("");
  const [checker, setChecker] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);

  const isCheck = target.kind === "licence_check";
  const f = (key: string) => `complete-${target.id}-${key}`;

  function openDialog() {
    setDoneOn(today);
    setKm(target.currentKm === null ? "" : formatNumber(target.currentKm, locale, 0));
    setCost("");
    setChecker("");
    setNotes("");
    setError(null);
    setOpen(true);
  }

  function fail(code: string) {
    const field =
      code === "invalid_date" || code === "future_date" || code === "already_done_on"
        ? "doneOn"
        : code === "km_required" || code === "invalid_odometer"
          ? "km"
          : code === "invalid_cost"
            ? "cost"
            : code === "checker_required"
              ? "checker"
              : null;
    setError({ field, text: errorText(code) });
    if (field) document.getElementById(f(field))?.focus();
  }

  function submit() {
    setError(null);
    const kmText = km.trim();
    const doneKm = kmText === "" ? null : parseWholeNumber(kmText);
    if (kmText !== "" && doneKm === null) return fail("invalid_odometer");
    const costText = cost.trim();
    const costCents = costText === "" ? null : parseCostCents(costText);
    if (costText !== "" && costCents === null) return fail("invalid_cost");

    startTransition(async () => {
      const result = await completeObligationAction(target.id, {
        doneOn,
        doneKm: target.onVehicle ? doneKm : null,
        costCents,
        checkerName: checker || null,
        notes: notes || null,
      });
      if (!result.ok) return fail(result.error);
      setOpen(false);
      const { next, completionId, previous, odometer } = result.data;
      const nextText =
        next.nextDueOn && next.nextDueKm !== null
          ? tc("nextBoth", {
              date: formatDate(next.nextDueOn, locale),
              km: formatNumber(next.nextDueKm, locale, 0),
            })
          : next.nextDueOn
            ? formatDate(next.nextDueOn, locale)
            : next.nextDueKm !== null
              ? tc("nextKm", { km: formatNumber(next.nextDueKm, locale, 0) })
              : null;
      showToast({
        message: nextText ? tc("saved", { next: nextText }) : tc("savedNoNext"),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoCompletionAction(completionId, previous, odometer);
          showToast({ message: undone.ok ? tc("reverted") : errorText(undone.error) });
        },
      });
    });
  }

  const invalid = (field: string) =>
    error?.field === field ? { "aria-invalid": true as const, "aria-describedby": f("error") } : {};

  return (
    <>
      <Button
        size={size}
        variant={variant}
        aria-label={t("obligations.doneFor", { title: target.title })}
        onClick={openDialog}
      >
        <Check aria-hidden />
        {t("obligations.done")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={tc("title", { title: target.title })}
        description={tc("description")}
        closeLabel={t("close")}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={f("doneOn")}>{tc("doneOn")}</Label>
              <Input
                id={f("doneOn")}
                type="date"
                value={doneOn}
                max={today}
                required
                onChange={(e) => setDoneOn(e.target.value)}
                className="tabular"
                {...invalid("doneOn")}
              />
            </div>
            {target.onVehicle && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={f("km")}>{tc("km")}</Label>
                <div className="relative">
                  <Input
                    id={f("km")}
                    value={km}
                    inputMode="numeric"
                    autoComplete="off"
                    required={target.intervalKm !== null}
                    onChange={(e) => setKm(e.target.value)}
                    className="tabular pr-10"
                    {...invalid("km")}
                  />
                  <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                    {tc("kmUnit")}
                  </span>
                </div>
              </div>
            )}
            {isCheck && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={f("checker")}>{tc("checker")}</Label>
                <Input
                  id={f("checker")}
                  value={checker}
                  maxLength={120}
                  required
                  autoComplete="off"
                  onChange={(e) => setChecker(e.target.value)}
                  {...invalid("checker")}
                />
                <p className="text-faint-foreground text-small">{tc("checkerHint")}</p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={f("cost")}>{tc("cost")}</Label>
              <div className="relative">
                <Input
                  id={f("cost")}
                  value={cost}
                  inputMode="decimal"
                  autoComplete="off"
                  onChange={(e) => setCost(e.target.value)}
                  className="tabular pr-8"
                  {...invalid("cost")}
                />
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                  €
                </span>
              </div>
            </div>
            {target.onVehicle && <p className="text-faint-foreground text-small">{tc("kmHint")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={f("notes")}>{tc("notes")}</Label>
            <textarea
              id={f("notes")}
              value={notes}
              rows={2}
              maxLength={2000}
              className={TEXTAREA_CLASS}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <p id={f("error")} role="alert" className="min-h-5 text-small text-status-critical">
            {error?.text}
          </p>
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
