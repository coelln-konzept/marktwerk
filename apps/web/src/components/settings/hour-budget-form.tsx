"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setDefaultHourBudgetAction } from "@/app/(app)/team/planung/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/format";

/** "12", "37,5", "37.5" → number; null when it isn't 0–200 in half hours. */
function parseBudget(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const value = Number(s);
  return value <= 200 && Math.round(value * 2) === value * 2 ? value : null;
}

/** Rechtliches → Planung: the company's default hour budget per month (settings:manage). */
export function HourBudgetForm({ current }: { current: number }) {
  const t = useTranslations("settings.legal.planning");
  const locale = useLocale();
  const { showToast } = useShell();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(() => formatNumber(current, locale, 2));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const hours = parseBudget(value);
    if (hours === null) return setError(t("invalid"));
    setError(null);
    start(async () => {
      const result = await setDefaultHourBudgetAction(hours);
      if (!result.ok) return setError(t("error"));
      showToast({ message: t("saved", { hours: formatNumber(hours, locale, 2) }) });
    });
  }

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="default-hour-budget">{t("budget")}</Label>
        <div className="relative w-40">
          <Input
            id="default-hour-budget"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="tabular pr-10"
            {...(error
              ? { "aria-invalid": true as const, "aria-describedby": "default-hour-budget-error" }
              : {})}
          />
          <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
            {t("unit")}
          </span>
        </div>
      </div>
      <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
        {t("save")}
      </Button>
      {error && (
        <p
          id="default-hour-budget-error"
          role="alert"
          className="m-0 basis-full text-small text-status-critical"
        >
          {error}
        </p>
      )}
    </form>
  );
}
