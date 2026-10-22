import {
  type HealthDimensions,
  type HealthReason,
  overallHealth,
  permitsReason,
  tasksReason,
} from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { Health, HealthShape } from "@/components/ui/health";
import { isModuleVisible, maskHealth } from "@/lib/modules";

export const HEALTH_DIMS = [
  "permits",
  "tasks",
  ...(isModuleVisible("team") ? (["team"] as const) : []),
  ...(isModuleVisible("finance") ? (["money"] as const) : []),
] as const;

/** The numbers behind the permit and task levels (see `EventRow.reasons`). */
export type HealthCounts = {
  permitsMissing: number;
  tasksOverdue: number;
  tasksBlocked: number;
};

/**
 * "▲ 1 Genehmigung fehlt · 5 überfällig  ●▲○○": what is wrong (not "Achtung"), plus one shape per
 * dimension (permits · tasks · team · money). "Im Plan" when nothing is.
 */
export function HealthSummary({
  health: rawHealth,
  counts,
  compact,
}: {
  health: HealthDimensions;
  counts: HealthCounts;
  compact?: boolean;
}) {
  const t = useTranslations("health");
  const health = maskHealth(rawHealth);
  const overall = overallHealth(health);
  const text = (reason: HealthReason | null) =>
    reason && reason.key !== "ok" ? t(`reason.${reason.key}`, { count: reason.count ?? 0 }) : null;
  const reasons = [
    text(permitsReason(health.permits, counts.permitsMissing)),
    text(tasksReason(health.tasks, counts.tasksOverdue, counts.tasksBlocked)),
    health.team === "warn" || health.team === "critical" ? t("reason.team") : null,
    health.money === "warn" || health.money === "critical" ? t("reason.money") : null,
  ].filter((r): r is string => r !== null);
  const label =
    overall === null
      ? t("none")
      : overall === "ok"
        ? t("ok")
        : reasons.length > 0
          ? reasons.join(" · ")
          : t(overall);
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
