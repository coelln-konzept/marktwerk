import { type HealthDimensions, issueCount, overallHealth } from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { Health, HealthShape } from "@/components/ui/health";

const DIMS = ["permits", "tasks", "team", "money"] as const;

/** "▲ Achtung · 2  ●▲○○": overall health plus one shape per dimension (permits · tasks · team · money). */
export function HealthSummary({
  health,
  compact,
}: {
  health: HealthDimensions;
  compact?: boolean;
}) {
  const t = useTranslations("health");
  const overall = overallHealth(health);
  const issues = issueCount(health);
  const label =
    overall === null
      ? t("none")
      : overall === "ok"
        ? t("ok")
        : `${t(overall)}${issues > 1 ? ` · ${issues}` : ""}`;
  return (
    <span className="inline-flex items-center gap-2">
      <Health level={overall ?? "none"} label={label} />
      {!compact && (
        <span className="inline-flex items-center">
          {DIMS.map((dim) => (
            <span key={dim} title={`${t(`dims.${dim}`)}: ${t(health[dim] ?? "none")}`}>
              <HealthShape level={health[dim] ?? "none"} className="size-3" />
              <span className="sr-only">
                {t(`dims.${dim}`)}: {t(health[dim] ?? "none")}
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
