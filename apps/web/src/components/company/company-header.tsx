import { can } from "@marktwerk/core";
import { getTranslations } from "next-intl/server";
import { type EventTab, EventTabs } from "@/components/event-detail/event-tabs";
import { PageHeader } from "@/components/shell/page";
import { todayIn } from "@/lib/format";
import type { Actor } from "@/server/actor";
import { companyCounts } from "@/server/queries/company";

/** Heading and tab bar of the Firma area: Pflichten · Fahrzeuge · Mängel, each with what needs attention. */
export async function CompanyHeader({
  actor,
  actions,
}: {
  actor: Actor;
  /** Page-specific buttons on the right. */
  actions?: React.ReactNode;
}) {
  const t = await getTranslations("company");
  if (!can(actor.role, "company", "read")) return null;
  const counts = await companyCounts(todayIn());

  const obligationCount: EventTab["count"] =
    counts.needsAction > 0
      ? {
          text: String(counts.needsAction),
          level: "critical",
          sr: t("tabs.needsAction", { count: counts.needsAction }),
        }
      : counts.soon + counts.dueMissing > 0
        ? {
            text: String(counts.soon + counts.dueMissing),
            level: "warn",
            sr: [
              counts.soon > 0 ? t("tabs.soon", { count: counts.soon }) : null,
              counts.dueMissing > 0 ? t("tabs.dueMissing", { count: counts.dueMissing }) : null,
            ]
              .filter(Boolean)
              .join(", "),
          }
        : undefined;
  const issueCount: EventTab["count"] =
    counts.openIssues > 0
      ? {
          text: String(counts.openIssues),
          level: counts.criticalIssues > 0 ? "critical" : "warn",
          sr:
            counts.criticalIssues > 0
              ? `${t("tabs.openIssues", { count: counts.openIssues })}, ${t("tabs.criticalIssues", { count: counts.criticalIssues })}`
              : t("tabs.openIssues", { count: counts.openIssues }),
        }
      : undefined;

  const tabs: EventTab[] = [
    {
      key: "obligations",
      href: "/firma/pflichten",
      label: t("tabs.obligations"),
      count: obligationCount,
    },
    { key: "vehicles", href: "/firma/fahrzeuge", label: t("tabs.vehicles") },
    { key: "issues", href: "/firma/maengel", label: t("tabs.issues"), count: issueCount },
  ];

  return (
    <header className="flex flex-col gap-3">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={actions} />
      <EventTabs tabs={tabs} label={t("tabs.label")} />
    </header>
  );
}
