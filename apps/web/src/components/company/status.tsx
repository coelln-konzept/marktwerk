import type { ObligationStatus } from "@marktwerk/core";
import {
  CalendarClock,
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
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { useDueText } from "@/components/ui/due-badge";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { formatNumber } from "@/lib/format";

const OBLIGATION: Record<ObligationStatus, { tone: Tone; icon: LucideIcon }> = {
  overdue: { tone: "critical", icon: CircleAlert },
  due: { tone: "warn", icon: CalendarClock },
  // "bald fällig" is amber with the clock like every other upcoming deadline (not the violet waiting hourglass).
  soon: { tone: "warn", icon: Clock },
  ok: { tone: "ok", icon: Check },
};

/**
 * Status of an obligation as colour + icon + text. The wording of a date follows the one due
 * vocabulary (`useDueText`): an overdue date is the badge text itself ("3 Tage überfällig"), a date
 * that is coming up sits next to the "bald fällig" badge ("In 5 Tagen"); kilometres keep their own
 * detail ("800 km drüber", "in 800 km").
 */
export function ObligationStatusBadge({
  status,
  dueOn,
  today,
  kmLeft,
  trigger,
}: {
  status: ObligationStatus;
  /** Next due date; with `today` it gives the words for the date trigger. */
  dueOn: string | null;
  today: string;
  kmLeft: number | null;
  trigger: "date" | "km" | null;
}) {
  const t = useTranslations("company");
  const locale = useLocale();
  const dueText = useDueText();
  const { tone, icon } = OBLIGATION[status];

  let label = t(`status.${status}`);
  let detail: string | null = null;
  if (status !== "ok") {
    if (trigger === "km" && kmLeft !== null) {
      detail =
        kmLeft < 0
          ? t("statusDetail.overKm", { km: formatNumber(-kmLeft, locale, 0) })
          : t("statusDetail.inKm", { km: formatNumber(kmLeft, locale, 0) });
    } else if (dueOn !== null) {
      const words = dueText(dueOn, today);
      if (status === "overdue") label = words;
      else if (status === "soon") detail = words;
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusBadge tone={tone} icon={icon}>
        {label}
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
