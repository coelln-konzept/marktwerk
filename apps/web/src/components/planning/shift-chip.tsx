import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { MarketCode } from "@/components/ui/market-marker";
import { cn } from "@/lib/utils";
import type { PlanningShift } from "@/server/queries/planning";

const ICON = { requested: CircleHelp, confirmed: CircleCheck, declined: CircleX } as const;

/** "6:00" / "06:00" → "6"; "06:30" → "6:30" (the chip is tight). */
const short = (time: string) => time.replace(/^0(\d)/, "$1").replace(/:00$/, "");

/** The time span of a shift for a chip or a menu entry ("6–8", "14:30–18"), or "" without times. */
export function shortSpan(start: string | null, end: string | null): string {
  return start && end ? `${short(start)}–${short(end)}` : "";
}

/**
 * One shift in a planning cell: "▌ALT Aufbau 6–8" with ? angefragt / ✓ bestätigt / ✕ abgesagt. The status
 * is an icon plus text for screen readers (colour is never the only cue).
 */
export function ShiftChip({ shift }: { shift: PlanningShift }) {
  const t = useTranslations("planning");
  const locale = useLocale();
  const Icon = ICON[shift.status as keyof typeof ICON] ?? CircleCheck;
  const role = locale === "en" ? (shift.roleNameEn ?? shift.roleName) : shift.roleName;
  const declined = shift.status === "declined";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded border border-input bg-card px-1 py-0.5 text-[11px] leading-tight",
        declined && "text-muted-foreground line-through",
        shift.status === "requested" && "border-dashed",
      )}
    >
      {shift.marketShortCode && (
        <MarketCode code={shift.marketShortCode} color={shift.marketColor} />
      )}
      {role && <span className="min-w-0 truncate text-muted-foreground">{role}</span>}
      <span className="tabular whitespace-nowrap">
        {shortSpan(shift.plannedStart, shift.plannedEnd)}
      </span>
      <Icon
        aria-hidden
        className={cn(
          "size-3 shrink-0",
          shift.status === "confirmed" && "text-status-ok",
          shift.status === "requested" && "text-status-warn",
        )}
      />
      <span className="sr-only">{t(`status.${shift.status}`)}</span>
    </span>
  );
}
