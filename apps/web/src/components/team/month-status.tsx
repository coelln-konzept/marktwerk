import { Ban, CircleCheck, Clock, FileCheck2, Lock, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PeriodStatus, PersonMonthRow } from "@/server/queries/hours";

export type PersonLevel = "ok" | "near" | "over" | "illegal" | "missing" | "arbzg";

/** Share of the limit from which a Minijob person is shown as "Grenze nah". */
const NEAR_SHARE = 0.9;

/** The one status a person gets in the month grid: the most serious thing first. */
export function personLevel(row: PersonMonthRow): PersonLevel {
  const mj = row.minijob;
  if (mj?.status.level === "red") return "illegal";
  if (row.missingTimes > 0) return "missing";
  if (mj?.status.level === "amber") return "over";
  if (row.arbzg.length > 0) return "arbzg";
  if (mj && mj.status.earnedCents >= mj.params.limitCents * NEAR_SHARE) return "near";
  return "ok";
}

export async function PersonStatusBadge({ level }: { level: PersonLevel }) {
  const t = await getTranslations("hours.status");
  switch (level) {
    case "ok":
      return (
        <StatusBadge tone="ok" icon={CircleCheck}>
          {t("ok")}
        </StatusBadge>
      );
    case "near":
      return (
        <StatusBadge tone="warn" icon={Clock}>
          {t("near")}
        </StatusBadge>
      );
    case "over":
      return (
        <StatusBadge tone="warn" icon={TriangleAlert}>
          {t("over")}
        </StatusBadge>
      );
    case "illegal":
      return (
        <StatusBadge tone="critical" icon={Ban}>
          {t("illegal")}
        </StatusBadge>
      );
    case "missing":
      return (
        <StatusBadge tone="critical" icon={Clock}>
          {t("missing")}
        </StatusBadge>
      );
    case "arbzg":
      return (
        <StatusBadge tone="warn" icon={TriangleAlert}>
          {t("arbzg")}
        </StatusBadge>
      );
  }
}

/** Open · gesperrt · freigegeben · exportiert. */
export async function PeriodBadge({ status }: { status: PeriodStatus }) {
  const t = await getTranslations("hours.period");
  switch (status) {
    case "open":
      return (
        <StatusBadge tone="neutral" icon={Clock} outline>
          {t("open")}
        </StatusBadge>
      );
    case "locked":
      return (
        <StatusBadge tone="warn" icon={Lock}>
          {t("locked")}
        </StatusBadge>
      );
    case "approved":
      return (
        <StatusBadge tone="info" icon={FileCheck2}>
          {t("approved")}
        </StatusBadge>
      );
    case "exported":
      return (
        <StatusBadge tone="ok" icon={CircleCheck}>
          {t("exported")}
        </StatusBadge>
      );
  }
}
