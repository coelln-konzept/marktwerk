"use client";

import { parseCostCents, parseWholeNumber, rollForward } from "@marktwerk/core";
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
import { FieldError, FormErrorSummary, useFieldErrors } from "./field-errors";
import { useErrorText } from "./shared";

export type CompleteTarget = {
  id: string;
  title: string;
  kind: string;
  /** Has a km interval: the reading is required. */
  intervalKm: number | null;
  /** Belongs to a vehicle: a reading can be given (and updates the odometer). */
  onVehicle: boolean;
  /** Completing with a cost also creates a payable (Zahlung) that is due on the completion date. */
  createsPayable: boolean;
  currentKm: number | null;
  /** Day of that odometer reading: a completion on or after it cannot have fewer km. */
  currentKmOn: string | null;
  /** Schedule, for the preview of the next due date (`rollForward`, the same rule as the server). */
  intervalMonths: number | null;
  nextDueOn: string | null;
  nextDueKm: number | null;
  leadDays: number;
  lastDoneOn: string | null;
};

const ORDER = ["doneOn", "km", "checker", "cost", "notes"] as const;

const FIELD_OF: Record<string, string> = {
  invalid_date: "doneOn",
  future_date: "doneOn",
  already_done_on: "doneOn",
  km_required: "km",
  invalid_odometer: "km",
  odometer_lower: "km",
  invalid_cost: "cost",
  checker_required: "checker",
  invalid_text: "notes",
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
  className,
}: {
  target: CompleteTarget;
  today: string;
  size?: "default" | "sm";
  variant?: "outline" | "default";
  className?: string;
}) {
  const t = useTranslations("company");
  const tc = useTranslations("company.complete");
  const locale = useLocale();
  const { showToast, showError } = useShell();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [doneOn, setDoneOn] = useState(today);
  const [km, setKm] = useState("");
  const [cost, setCost] = useState("");
  const [checker, setChecker] = useState("");
  const [notes, setNotes] = useState("");

  const isCheck = target.kind === "licence_check";
  const f = (key: string) => `complete-${target.id}-${key}`;
  const { errors, show, clear, invalid } = useFieldErrors(f);

  /** A reading below the vehicle's known odometer, dated on or after that reading (UX-067). */
  const belowOdometer = (doneKm: number | null) =>
    doneKm !== null &&
    target.currentKm !== null &&
    doneKm < target.currentKm &&
    (target.currentKmOn === null || doneOn >= target.currentKmOn);

  function openDialog() {
    setDoneOn(today);
    setKm(target.currentKm === null ? "" : formatNumber(target.currentKm, locale, 0));
    setCost("");
    setChecker("");
    setNotes("");
    clear();
    setOpen(true);
  }

  function kmBelowText() {
    const km = formatNumber(target.currentKm ?? 0, locale, 0);
    // A reading without its date (odometer_recorded_on is nullable) gets the sentence without one.
    return target.currentKmOn
      ? tc("kmBelow", { km, date: formatDate(target.currentKmOn, locale) })
      : tc("kmBelowNoDate", { km });
  }

  function fail(code: string) {
    const field = FIELD_OF[code] ?? "form";
    show({ [field]: code === "odometer_lower" ? kmBelowText() : errorText(code) }, ORDER);
  }

  function submit() {
    clear();
    // Every wrong field is answered on the spot, at the field; the first one gets the focus.
    const found: Record<string, string> = {};
    if (!doneOn) found.doneOn = errorText("invalid_date");
    else if (doneOn > today) found.doneOn = errorText("future_date");
    const kmText = km.trim();
    const doneKm = kmText === "" ? null : parseWholeNumber(kmText);
    if (target.onVehicle) {
      if (kmText !== "" && doneKm === null) found.km = errorText("invalid_odometer");
      else if (kmText === "" && target.intervalKm !== null) found.km = errorText("km_required");
      else if (belowOdometer(doneKm)) found.km = kmBelowText();
    }
    if (isCheck && checker.trim() === "") found.checker = errorText("checker_required");
    const costText = cost.trim();
    const costCents = costText === "" ? null : parseCostCents(costText);
    if (costText !== "" && costCents === null) found.cost = errorText("invalid_cost");
    if (Object.keys(found).length > 0) return show(found, ORDER);

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
      const { next, completionId, previous, odometer, payableId } = result.data;
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
        message: nextText
          ? tc(payableId ? "savedWithPayable" : "saved", { next: nextText })
          : tc("savedNoNext"),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoCompletionAction(completionId, previous, odometer, payableId);
          if (undone.ok) showToast({ message: tc("reverted") });
          else showError(errorText(undone.error));
        },
      });
    });
  }

  // What "Erledigt" will set as the next due date, live while typing (the same rule the server applies).
  const previewKm = km.trim() === "" ? null : parseWholeNumber(km.trim());
  const preview =
    doneOn && doneOn <= today
      ? target.lastDoneOn !== null && doneOn < target.lastDoneOn
        ? { nextDueOn: target.nextDueOn, nextDueKm: target.nextDueKm, history: true }
        : {
            ...rollForward({
              intervalMonths: target.intervalMonths,
              intervalKm: target.intervalKm,
              nextDueOn: target.nextDueOn,
              leadDays: target.leadDays,
              doneOn,
              doneKm: target.onVehicle ? previewKm : null,
            }),
            history: false,
          }
      : null;
  const previewText = preview
    ? preview.history
      ? tc("previewHistory")
      : preview.nextDueOn && preview.nextDueKm !== null
        ? tc("previewBoth", {
            date: formatDate(preview.nextDueOn, locale),
            km: formatNumber(preview.nextDueKm, locale, 0),
          })
        : preview.nextDueOn
          ? tc("previewDate", { date: formatDate(preview.nextDueOn, locale) })
          : preview.nextDueKm !== null
            ? tc("previewKm", { km: formatNumber(preview.nextDueKm, locale, 0) })
            : target.intervalKm !== null
              ? tc("previewNeedsKm")
              : tc("previewNone")
    : null;

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
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
              <FieldError id={f("doneOn")} text={errors.doneOn} />
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
                <FieldError id={f("km")} text={errors.km} />
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
                <FieldError id={f("checker")} text={errors.checker} />
                <p className="text-faint-foreground text-small">{tc("checkerHint")}</p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={f("cost")} optional>
                {tc("cost")}
              </Label>
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
              <FieldError id={f("cost")} text={errors.cost} />
            </div>
            {target.onVehicle && <p className="text-faint-foreground text-small">{tc("kmHint")}</p>}
            {target.createsPayable && (
              <p className="text-faint-foreground text-small">{tc("payableHint")}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={f("notes")} optional>
              {tc("notes")}
            </Label>
            <textarea
              id={f("notes")}
              value={notes}
              rows={2}
              maxLength={2000}
              className={TEXTAREA_CLASS}
              onChange={(e) => setNotes(e.target.value)}
              {...invalid("notes")}
            />
            <FieldError id={f("notes")} text={errors.notes} />
          </div>
          {previewText && (
            <p
              aria-live="polite"
              className="rounded-lg bg-sunken px-3 py-2 text-foreground-2 text-small"
            >
              {previewText}
            </p>
          )}
          <div className="min-h-5">
            <FormErrorSummary errors={errors} />
          </div>
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
