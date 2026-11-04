"use client";

import { MARKET_COLORS } from "@marktwerk/core";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { OptionalMark } from "@/components/ui/label";
import { marketColorClass } from "@/components/ui/market-marker";

/**
 * The market colour (optional): a row of swatches plus "Keine Farbe", and a legend of the colours that
 * active markets already use, so a new colour can be told apart from the others (CF9-4). `usage` maps a
 * colour key to the market names using it; every swatch names them in its tooltip and label.
 */
export function MarketColorPicker({
  name,
  value,
  onChange,
  usage,
  error,
}: {
  /** Radio group name; unique per form. */
  name: string;
  value: string | null;
  onChange: (value: string | null) => void;
  usage: Record<string, string[]>;
  error?: ReactNode;
}) {
  const t = useTranslations("templates.form.color");
  const label = (key: string) => {
    const colour = t(`names.${key}` as never);
    const users = usage[key] ?? [];
    return users.length > 0
      ? t("usedBy", { name: colour, markets: users.join(", ") })
      : t("free", { name: colour });
  };
  const used = MARKET_COLORS.filter((key) => (usage[key]?.length ?? 0) > 0);

  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className="mb-1 flex gap-2 font-medium text-small">
        {t("legend")}
        <OptionalMark />
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {MARKET_COLORS.map((key) => (
          <label key={key} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={key}
              checked={value === key}
              onChange={() => onChange(key)}
              className="peer sr-only"
              aria-label={label(key)}
            />
            <span
              aria-hidden
              title={label(key)}
              className={`block size-7 rounded-md ${marketColorClass(key)} ring-offset-2 ring-offset-card peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-ring`}
            />
          </label>
        ))}
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-muted-foreground text-small has-checked:bg-selected has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring">
          <input
            type="radio"
            name={name}
            value=""
            checked={value === null}
            onChange={() => onChange(null)}
            className="sr-only"
          />
          {t("none")}
        </label>
      </div>
      {used.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-muted-foreground text-small">
          {used.map((key) => (
            <li key={key} className="flex items-baseline gap-2">
              <span
                aria-hidden
                className={`size-2.5 shrink-0 translate-y-px rounded-sm ${marketColorClass(key)}`}
              />
              <span>
                <span className="font-medium text-foreground">{t(`names.${key}` as never)}</span>
                {": "}
                {usage[key]?.join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-faint-foreground text-small">{t("hint")}</p>
      {error}
    </fieldset>
  );
}
