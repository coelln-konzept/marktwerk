import type { ObligationStatus } from "@marktwerk/core";
import {
  CalendarDays,
  Check,
  CircleAlert,
  CircleDot,
  Clock,
  Hammer,
  type LucideIcon,
  OctagonAlert,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { OVERDUE_ICON } from "@/lib/due-ui";
import { formatNumber } from "@/lib/format";

/** Due states in the one vocabulary (`lib/due-ui.ts`): überfällig = red octagon, fällig = amber clock. */
const OBLIGATION: Record<ObligationStatus, { tone: Tone; icon: LucideIcon }> = {
  overdue: { tone: "critical", icon: OVERDUE_ICON },
  due: { tone: "warn", icon: Clock },
  soon: { tone: "neutral", icon: CalendarDays },
  ok: { tone: "ok", icon: Check },
};

/**
 * Status of an obligation: ok / bald / fällig / überfällig as colour + icon + text, plus how far away it is
 * ("seit 12 Tagen", "in 5 Tagen", "in 800 km") for everything that is not simply fine.
 */
export async function ObligationStatusBadge({
  status,
  daysLeft,
  kmLeft,
  trigger,
}: {
  status: ObligationStatus;
  daysLeft: number | null;
  kmLeft: number | null;
  trigger: "date" | "km" | null;
}) {
  const t = await getTranslations("company");
  const locale = await getLocale();
  const { tone, icon } = OBLIGATION[status];

  let detail: string | null = null;
  if (status !== "ok") {
    if (trigger === "km" && kmLeft !== null) {
      detail =
        kmLeft < 0
          ? t("statusDetail.overKm", { km: formatNumber(-kmLeft, locale, 0) })
          : t("statusDetail.inKm", { km: formatNumber(kmLeft, locale, 0) });
    } else if (daysLeft !== null) {
      detail =
        daysLeft < 0
          ? t("statusDetail.overdueDays", { days: -daysLeft })
          : daysLeft === 0
            ? t("statusDetail.today")
            : t("statusDetail.inDays", { days: daysLeft });
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusBadge tone={tone} icon={icon}>
        {t(`status.${status}`)}
      </StatusBadge>
      {detail && status !== "due" && (
        <span className="tabular whitespace-nowrap text-muted-foreground text-small">{detail}</span>
      )}
    </span>
  );
}

const SEVERITY: Record<string, { tone: Tone; icon: LucideIcon }> = {
  minor: { tone: "neutral", icon: CircleDot },
  major: { tone: "warn", icon: TriangleAlert },
  critical: { tone: "critical", icon: OctagonAlert },
};

export async function IssueSeverityBadge({ severity }: { severity: string }) {
  const t = await getTranslations("company.issues.severity");
  const { tone, icon } = SEVERITY[severity] ?? { tone: "neutral" as Tone, icon: CircleDot };
  return (
    <StatusBadge tone={tone} icon={icon}>
      {t(severity as never)}
    </StatusBadge>
  );
}

const ISSUE_STATUS: Record<string, { tone: Tone; icon: LucideIcon }> = {
  open: { tone: "warn", icon: CircleAlert },
  in_progress: { tone: "info", icon: Wrench },
  resolved: { tone: "ok", icon: Check },
};

export async function IssueStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("company.issues.status");
  const { tone, icon } = ISSUE_STATUS[status] ?? { tone: "neutral" as Tone, icon: Hammer };
  return (
    <StatusBadge tone={tone} icon={icon}>
      {t(status as never)}
    </StatusBadge>
  );
}
