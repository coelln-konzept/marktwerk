import { type HealthDimensions, issueCount, overallHealth } from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { Health, HealthShape } from "@/components/ui/health";
import { isModuleVisible, maskHealth } from "@/lib/modules";

export const HEALTH_DIMS = [
  "permits",
  "tasks",
  ...(isModuleVisible("team") ? (["team"] as const) : []),
  ...(isModuleVisible("finance") ? (["money"] as const) : []),
] as const;

/** "▲ Achtung · 2  ●▲○○": overall health plus one shape per dimension (permits · tasks · team · money). */
export function HealthSummary({
  health: rawHealth,
  compact,
}: {
  health: HealthDimensions;
  compact?: boolean;
}) {
  const t = useTranslations("health");
  const health = maskHealth(rawHealth);
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
          {HEALTH_DIMS.map((dim) => (
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
