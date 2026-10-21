"use client";

import { Ban, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatHours, formatMoney } from "@/lib/format";
import type { LiveWarning } from "./live-warnings";

/** Warnings while typing: ArbZG and Minijob, colour + icon + text, announced politely. */
export function WarningList({ warnings }: { warnings: LiveWarning[] }) {
  const t = useTranslations("hours.warn");
  const locale = useLocale();
  if (warnings.length === 0) return null;
  const text = (w: LiveWarning): string => {
    switch (w.code) {
      case "daily_max":
        return t("daily_max", {
          hours: formatHours(w.minutes, locale),
          limit: formatHours(w.limit, locale),
        });
      case "rest_period":
        return t("rest_period", {
          rest: formatHours(w.restMinutes, locale),
          limit: formatHours(w.limit, locale),
        });
      case "break_missing":
        return t("break_missing", { minutes: w.required });
      case "overlap":
        return t("overlap");
      case "minijob":
        return t(w.level === "red" ? "minijob_red" : "minijob_amber", {
          earned: formatMoney(w.earnedCents, locale),
          limit: formatMoney(w.limitCents, locale),
        });
    }
  };
  return (
    <ul
      className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0"
      role="status"
      aria-live="polite"
    >
      {warnings.map((w) => {
        const critical = w.code === "minijob" && w.level === "red";
        return (
          <li key={`${w.code}-${text(w)}`}>
            <StatusBadge
              tone={critical ? "critical" : "warn"}
              icon={critical ? Ban : TriangleAlert}
              className="h-auto whitespace-normal py-1"
            >
              {text(w)}
            </StatusBadge>
          </li>
        );
      })}
    </ul>
  );
}
