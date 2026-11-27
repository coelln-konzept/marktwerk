import { CircleAlert, CircleCheck, CircleDot } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICON = { ok: CircleCheck, tight: CircleDot, over: CircleAlert } as const;
const TONE = {
  ok: "text-status-ok",
  tight: "text-status-warn",
  over: "text-status-critical",
} as const;
const BAR = {
  ok: "bg-status-ok-dot",
  tight: "bg-status-warn-dot",
  over: "bg-status-critical-dot",
} as const;

/**
 * Month budget of one person: a bar, "28 / 40 h · 12 h frei" and the level as icon and text (colour is
 * never the only cue). Works in server and client components (no state).
 */
export function BudgetBar(props: {
  usedMinutes: number;
  budgetMinutes: number;
  requestedMinutes: number;
  level: "ok" | "tight" | "over";
  noContract: boolean;
}) {
  const t = useTranslations("planning");
  const locale = useLocale();
  const h = (minutes: number) => formatNumber(minutes / 60, locale, 1);
  const Icon = ICON[props.level];
  const left = props.budgetMinutes - props.usedMinutes;
  const pct =
    props.budgetMinutes > 0
      ? Math.min(100, (props.usedMinutes / props.budgetMinutes) * 100)
      : props.usedMinutes > 0
        ? 100
        : 0;
  return (
    <div className="flex min-w-44 flex-col gap-0.5 font-normal text-tiny">
      <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
        <div className={cn("h-full", BAR[props.level])} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("inline-flex items-center gap-1 font-medium", TONE[props.level])}>
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="sr-only">{t(`level.${props.level}`)}: </span>
        <span className="tabular">
          {left >= 0
            ? t("budget", {
                used: h(props.usedMinutes),
                budget: h(props.budgetMinutes),
                left: h(left),
              })
            : t("budgetOver", {
                used: h(props.usedMinutes),
                budget: h(props.budgetMinutes),
                over: h(-left),
              })}
        </span>
      </span>
      {(props.requestedMinutes > 0 || props.noContract) && (
        <span className="text-muted-foreground">
          {props.requestedMinutes > 0 && t("requestedPart", { hours: h(props.requestedMinutes) })}
          {props.requestedMinutes > 0 && props.noContract && " · "}
          {props.noContract && t("noContract")}
        </span>
      )}
    </div>
  );
}
