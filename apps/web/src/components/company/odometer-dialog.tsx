"use client";

import { parseWholeNumber } from "@marktwerk/core";
import { Gauge } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { recordOdometerAction, undoOdometerAction } from "@/app/(app)/firma/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatNumber } from "@/lib/format";
import { useErrorText } from "./shared";

/** "Kilometerstand eintragen": a new reading with its date (two fields, so a modal), undo toast afterwards. */
export function OdometerButton({
  vehicleId,
  name,
  currentKm,
  today,
}: {
  vehicleId: string;
  name: string;
  currentKm: number | null;
  today: string;
}) {
  const t = useTranslations("company");
  const to = useTranslations("company.odometer");
  const locale = useLocale();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [km, setKm] = useState("");
  const [on, setOn] = useState(today);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setKm(currentKm === null ? "" : String(currentKm));
    setOn(today);
    setError(null);
    setOpen(true);
  }

  function submit() {
    const value = parseWholeNumber(km.trim());
    if (value === null) return setError(errorText("invalid_odometer"));
    setError(null);
    startTransition(async () => {
      const result = await recordOdometerAction(vehicleId, value, on || null);
      if (!result.ok) return setError(errorText(result.error));
      setOpen(false);
      const { previous, next } = result.data;
      showToast({
        message: to("saved", { km: formatNumber(value, locale, 0) }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoOdometerAction(vehicleId, previous, next);
          showToast({ message: undone.ok ? to("reverted") : errorText(undone.error) });
        },
      });
    });
  }

  return (
    <>
      <Button onClick={openDialog}>
        <Gauge aria-hidden />
        {to("button")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={to("title")}
        description={
          currentKm === null
            ? to("descriptionNone", { name })
            : to("description", { name, km: formatNumber(currentKm, locale, 0) })
        }
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
              <Label htmlFor="odometer-km">{to("km")}</Label>
              <div className="relative">
                <Input
                  id="odometer-km"
                  value={km}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  className="tabular pr-10"
                  onChange={(e) => setKm(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby="odometer-error"
                />
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                  km
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="odometer-on">{to("on")}</Label>
              <Input
                id="odometer-on"
                type="date"
                value={on}
                max={today}
                className="tabular"
                onChange={(e) => setOn(e.target.value)}
              />
            </div>
          </div>
          <p id="odometer-error" role="alert" className="min-h-5 text-small text-status-critical">
            {error}
          </p>
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {to("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
