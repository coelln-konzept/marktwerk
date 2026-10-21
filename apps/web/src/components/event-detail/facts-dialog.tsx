"use client";

import { checkEventTimes, normalizeClockTime, parseEuroCents } from "@marktwerk/core";
import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveFacts, undoFacts } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import type { EventFacts } from "@/server/services/event-details";

const TIME_FIELDS = ["setup", "open", "close", "teardown"] as const;

/** 1250 → "12,50" (de) / "12.50" (en), the way it's typed back in. */
function centsToInput(cents: number, locale: string) {
  const text = (cents / 100).toFixed(2);
  return locale === "en" ? text : text.replace(".", ",");
}

/**
 * "Bearbeiten" in the Eckdaten panel: times of the event day and prices, for this event only.
 * Six fields, so a modal (UX concept §4); saving shows an undo toast.
 */
export function FactsDialog({
  eventId,
  facts,
  multiDay,
  happening,
}: {
  eventId: string;
  facts: EventFacts;
  multiDay: boolean;
  happening: boolean;
}) {
  const t = useTranslations("eventDetail.facts");
  const locale = useLocale();
  const { showToast } = useShell();
  const tHappening = useTranslations("eventDetail.happening");
  const { confirm, dialog } = useConfirm();
  /** While the event is happening, every change is confirmed first (decided 2026-10-21). */
  const confirmed = async () =>
    !happening ||
    confirm({
      title: tHappening("title"),
      description: tHappening("description"),
      confirmLabel: tHappening("confirm"),
      cancelLabel: tHappening("cancel"),
    });
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [times, setTimes] = useState(facts.times);
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState<{ field: string; text: string } | null>(null);

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const fieldOf = (code: string) =>
    code === "open_after_close"
      ? "close"
      : code === "close_after_teardown"
        ? "teardown"
        : code === "setup_after_open"
          ? "setup"
          : code === "invalid_time"
            ? "open"
            : "form";

  function openDialog() {
    setTimes(facts.times);
    setPrice(centsToInput(facts.pricePerMCents, locale));
    setFee(centsToInput(facts.bookingFeeCents, locale));
    setError(null);
    setOpen(true);
  }

  async function submit() {
    const pricePerMCents = parseEuroCents(price);
    if (pricePerMCents === null)
      return setError({ field: "price", text: t("errors.invalid_price") });
    const bookingFeeCents = parseEuroCents(fee);
    if (bookingFeeCents === null)
      return setError({ field: "fee", text: t("errors.invalid_price") });
    const normalized = { ...times };
    for (const key of TIME_FIELDS) {
      const value = normalizeClockTime(times[key]);
      if (value === null) return setError({ field: key, text: errorText("invalid_time") });
      normalized[key] = value;
    }
    setTimes(normalized);
    const timesError = checkEventTimes(normalized, multiDay);
    if (timesError) return setError({ field: fieldOf(timesError), text: errorText(timesError) });

    const next: EventFacts = { times: normalized, pricePerMCents, bookingFeeCents };
    setError(null);
    if (!(await confirmed())) return;
    startTransition(async () => {
      const result = await saveFacts(eventId, next);
      if (!result.ok) {
        setError({ field: fieldOf(result.error), text: errorText(result.error) });
        return;
      }
      setOpen(false);
      if (!result.data.changed) {
        showToast({ message: t("unchanged") });
        return;
      }
      const { previous } = result.data;
      showToast({
        message: t("saved"),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoFacts(eventId, previous, next);
          showToast({ message: undone.ok ? t("reverted") : errorText(undone.error) });
        },
      });
    });
  }

  const invalid = (field: string) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": "facts-error" }
      : {};

  return (
    <>
      <Button size="sm" variant="ghost" aria-label={t("title")} onClick={openDialog}>
        <Pencil aria-hidden />
        {t("edit")}
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
          <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <legend className="mb-2 font-medium text-small">{t("times")}</legend>
            {TIME_FIELDS.map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`facts-${key}`} className="text-small">
                  {t(`time.${key}`)}
                </Label>
                <Input
                  id={`facts-${key}`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="HH:MM"
                  maxLength={9}
                  required
                  value={times[key]}
                  onChange={(e) => setTimes({ ...times, [key]: e.target.value })}
                  onBlur={(e) => {
                    const value = normalizeClockTime(e.target.value);
                    if (value) setTimes((prev) => ({ ...prev, [key]: value }));
                  }}
                  className="tabular"
                  {...invalid(key)}
                />
              </div>
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="facts-price">{t("price")}</Label>
              <div className="relative">
                <Input
                  id="facts-price"
                  inputMode="decimal"
                  autoComplete="off"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="tabular pr-14"
                  {...invalid("price")}
                />
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                  {t("perMeter")}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="facts-fee">{t("fee")}</Label>
              <div className="relative">
                <Input
                  id="facts-fee"
                  inputMode="decimal"
                  autoComplete="off"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  className="tabular pr-8"
                  {...invalid("fee")}
                />
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                  €
                </span>
              </div>
            </div>
          </div>
          {error && (
            <p id="facts-error" role="alert" className="text-small text-status-critical">
              {error.text}
            </p>
          )}
          <p className="text-faint-foreground text-small">{t("presetHint")}</p>
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
      {dialog}
    </>
  );
}
