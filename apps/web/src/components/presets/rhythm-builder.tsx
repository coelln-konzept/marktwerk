"use client";

import { addDays } from "@marktwerk/core";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { OptionalMark } from "@/components/ui/label";
import { formatDateRange, formatWeek, todayIn } from "@/lib/format";
import { rruleText } from "@/lib/rrule-text";
import { cn } from "@/lib/utils";
import { type Rhythm, rhythmToRule, SET_POSITIONS, upcomingDates, WEEKDAY_ORDER } from "./rhythm";

const SELECT_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

/** Mo–So and Jan–Dez in the current locale. */
function useCalendarNames(locale: string) {
  return useMemo(() => {
    const tag = locale === "en" ? "en-GB" : "de-DE";
    const weekday = new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" });
    const month = new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" });
    return {
      // 2024-01-01 is a Monday, so day N (1 = Monday … 7 = Sunday) is 2024-01-0N.
      weekday: (day: number) => weekday.format(new Date(Date.UTC(2024, 0, day === 0 ? 7 : day))),
      month: (m: number) => month.format(new Date(Date.UTC(2024, m - 1, 1))),
    };
  }, [locale]);
}

function Check({
  id,
  label,
  checked,
  disabled,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-8 cursor-pointer items-center gap-2 rounded-md border bg-card px-2.5 text-small hover:bg-hover",
        checked && !disabled && "border-primary bg-selected",
        disabled && "cursor-not-allowed opacity-50 hover:bg-card",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 accent-primary"
      />
      {label}
    </label>
  );
}

/**
 * Rhythm of a preset: weekdays, "which one in the month" and months, or no rhythm at all. Shows the
 * rule in words and the next five dates as they change, so what gets generated is never a surprise.
 */
export function RhythmBuilder({
  rhythm,
  onChange,
  storedRule,
  durationDays,
  error,
}: {
  rhythm: Rhythm;
  onChange: (next: Rhythm) => void;
  storedRule: string | null;
  durationDays: number;
  /** Message for the rhythm field, shown below the builder (id `preset-rrule-error`). */
  error?: string;
}) {
  const t = useTranslations("templates.form.rhythm");
  const locale = useLocale();
  const names = useCalendarNames(locale);
  const rule = rhythmToRule(rhythm, storedRule) ?? null;
  const dates = useMemo(() => upcomingDates(rule, todayIn()), [rule]);
  const days = Number.isInteger(durationDays) && durationDays >= 1 ? durationDays : 1;
  const toggle = (list: number[], value: number, on: boolean) =>
    on ? [...new Set([...list, value])] : list.filter((v) => v !== value);

  return (
    <div className="flex flex-col gap-4">
      <Check
        id="preset-rhythm-none"
        label={t("none")}
        checked={rhythm.none}
        onChange={(none) => onChange({ ...rhythm, none })}
      />

      <div className="flex flex-col gap-4">
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 font-medium text-small">{t("weekdays")}</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_ORDER.map((day, index) => (
              <Check
                key={day}
                id={index === 0 ? "preset-rrule" : `preset-rrule-day-${day}`}
                label={names.weekday(day)}
                checked={rhythm.weekdays.includes(day)}
                disabled={rhythm.none}
                invalid={Boolean(error)}
                describedBy={error ? "preset-rrule-error" : undefined}
                onChange={(on) =>
                  onChange({ ...rhythm, weekdays: toggle(rhythm.weekdays, day, on) })
                }
              />
            ))}
          </div>
        </fieldset>

        <div className="flex max-w-60 flex-col gap-1.5">
          <label htmlFor="preset-rrule-pos" className="font-medium text-small">
            {t("position")}
          </label>
          <select
            id="preset-rrule-pos"
            className={SELECT_CLASS}
            disabled={rhythm.none}
            value={rhythm.setPos === null ? "" : String(rhythm.setPos)}
            onChange={(e) =>
              onChange({ ...rhythm, setPos: e.target.value === "" ? null : Number(e.target.value) })
            }
          >
            {SET_POSITIONS.map((pos) => (
              <option key={String(pos)} value={pos === null ? "" : String(pos)}>
                {pos === null ? t("everyOne") : pos === -1 ? t("last") : t("nth", { n: pos })}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 flex gap-2 p-0 font-medium text-small">
            {t("months")}
            <OptionalMark />
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
              <Check
                key={month}
                id={`preset-rrule-month-${month}`}
                label={names.month(month)}
                checked={rhythm.months.includes(month)}
                disabled={rhythm.none}
                onChange={(on) => onChange({ ...rhythm, months: toggle(rhythm.months, month, on) })}
              />
            ))}
          </div>
          <p className="text-faint-foreground text-small">{t("monthsHint")}</p>
        </fieldset>
      </div>

      {error && (
        <p id="preset-rrule-error" className="text-small text-status-critical">
          {error}
        </p>
      )}

      <div
        aria-live="polite"
        className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-sunken px-3 py-2.5"
      >
        <p className="text-small">
          <span className="text-muted-foreground">{t("inWords")}: </span>
          <span className="font-medium">{rule ? rruleText(rule, locale) : t("noRuleText")}</span>
        </p>
        {rule && (
          <div>
            <p className="mb-1 font-semibold text-muted-foreground text-tiny uppercase tracking-wide">
              {t("nextDates")}
            </p>
            {dates.length === 0 ? (
              <p className="text-muted-foreground text-small">{t("noDates")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {dates.map((date) => (
                  <li key={date} className="flex items-baseline gap-2 text-small">
                    <span className="tabular whitespace-nowrap font-semibold">
                      {formatDateRange(date, addDays(date, days - 1), locale)}
                    </span>
                    <span className="tabular text-muted-foreground">
                      {formatWeek(date, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
