import { CircleCheck, CircleDot, CirclePlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { MarketCode } from "@/components/ui/market-marker";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PlanningNeed } from "@/server/queries/planning";

/**
 * The head of one day column: weekday and date, the day's markets (colour + Kürzel), and the gap:
 * "2 offen" (amber dot) or "Besetzt" (check), plus "+1 über Bedarf" when more people are on than needed.
 */
export function DayHeader({ day, needs }: { day: string; needs: readonly PlanningNeed[] }) {
  const locale = useLocale();
  const markets = new Map<string, string | null>();
  for (const need of needs) {
    const code = need.marketShortCode ?? need.eventName;
    if (!markets.has(code)) markets.set(code, need.marketColor);
  }
  const open = needs.reduce((sum, n) => sum + n.open, 0);
  const over = needs.reduce((sum, n) => sum + n.over, 0);
  return (
    <th
      scope="col"
      className="min-w-28 border-input border-b px-1.5 py-1 text-left align-bottom font-normal"
    >
      <div className="font-semibold text-small">{formatDateShort(day, locale)}</div>
      {markets.size > 0 && (
        <div className="flex flex-wrap gap-1.5 py-0.5">
          {[...markets].map(([code, color]) => (
            <span key={code} className="inline-flex items-center">
              <MarketCode code={code} color={color} />
              <span className="sr-only">{code}</span>
            </span>
          ))}
        </div>
      )}
      {needs.length > 0 && <GapStatus open={open} over={over} className="flex-col" />}
    </th>
  );
}

/** The gap of a day or a need: "2 offen" (amber dot) or "Besetzt" (check), plus "+1 über Bedarf". */
export function GapStatus({
  open,
  over,
  className,
}: {
  open: number;
  over: number;
  className?: string;
}) {
  const t = useTranslations("planning");
  return (
    <div className={cn("flex flex-wrap gap-x-2 text-tiny", className)}>
      {open > 0 ? (
        <span className="inline-flex items-center gap-1 font-medium text-status-warn">
          <CircleDot aria-hidden className="size-3.5 shrink-0" />
          {t("open", { count: open })}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-status-ok">
          <CircleCheck aria-hidden className="size-3.5 shrink-0" />
          {t("full")}
        </span>
      )}
      {over > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CirclePlus aria-hidden className="size-3.5 shrink-0" />
          {t("overNeed", { count: over })}
        </span>
      )}
    </div>
  );
}
