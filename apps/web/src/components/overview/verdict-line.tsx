import type { VerdictReason, WeekendVerdict } from "@marktwerk/core/events/weekend-verdict";
import { useTranslations } from "next-intl";
import { HealthShape } from "@/components/ui/health";
import { cn } from "@/lib/utils";

const WORD_TONE: Record<WeekendVerdict["level"], string> = {
  ok: "text-status-ok",
  warn: "text-status-warn",
  critical: "text-status-critical",
  none: "text-muted-foreground",
};

/** The reasons as words ("4 überfällig", "1 Genehmigung fehlt"), in the order the verdict gives them. */
export function useReasonTexts() {
  const t = useTranslations("overview.weekend.reason");
  return (reasons: VerdictReason[]) => reasons.map((r) => t(r.key, { count: r.count ?? 0 }));
}

/**
 * A market's verdict: shape + word (colour carries it a third time) and, unless `compact`, why:
 * "■ Nicht startklar · 4 überfällig · Genehmigungen ok". The compact form is for the "Nächstes
 * Wochenende" row and keeps the reasons in the tooltip.
 */
export function VerdictLine({
  verdict,
  compact = false,
  className,
}: {
  verdict: WeekendVerdict;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("overview.weekend.verdict");
  const reasonTexts = useReasonTexts();
  const reasons = reasonTexts(verdict.reasons);
  return (
    <span
      title={compact && reasons.length > 0 ? reasons.join(" · ") : undefined}
      className={cn("inline-flex flex-wrap items-center gap-x-1.5 text-small", className)}
    >
      <HealthShape level={verdict.level} />
      <span className={cn("font-semibold", WORD_TONE[verdict.level])}>{t(verdict.level)}</span>
      {!compact && reasons.length > 0 && (
        <span className="text-muted-foreground">· {reasons.join(" · ")}</span>
      )}
    </span>
  );
}
