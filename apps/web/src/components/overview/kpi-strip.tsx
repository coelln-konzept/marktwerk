import { getLocale, getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { Overview } from "@/server/queries/overview";

/**
 * KPI strip next to the greeting (UX concept §5): Fällig bis Sonntag · Überfällig · Geld überfällig ·
 * Offene Aufgaben · Dieses Wochenende ("2 von 4 im Plan"). "Geld überfällig" is left out for roles
 * without finance access; "Entwürfe" only shows while drafts are waiting.
 */
export async function KpiStrip({ kpis }: { kpis: Overview["kpis"] }) {
  const t = await getTranslations("overview.kpi");
  const locale = await getLocale();
  const money = kpis.moneyOverdue;
  const items = [
    {
      key: "dueByWeekend",
      label: t("dueByWeekend"),
      value: kpis.dueByWeekend,
      hint: t("dueByWeekendHint"),
    },
    { key: "overdue", label: t("overdue"), value: kpis.overdue, hint: t("overdueHint") },
    ...(money
      ? [
          {
            key: "moneyOverdue",
            label: t("moneyOverdue"),
            value: money.count,
            hint:
              money.count > 0
                ? t("moneyOverdueHint", { amount: formatMoney(money.cents, locale) })
                : t("moneyOverdueNone"),
          },
        ]
      : []),
    {
      key: "openTasks",
      label: t("openTasks"),
      value: kpis.openTasks,
      hint:
        kpis.overdueTasks > 0
          ? t("openTasksHint", { overdue: kpis.overdueTasks })
          : t("openTasksNone"),
    },
    {
      key: "weekend",
      label: t("weekend"),
      value: kpis.weekendCount,
      hint:
        kpis.weekendTracked > 0
          ? t("weekendHint", { count: kpis.weekendCount, inPlan: kpis.weekendInPlan })
          : t("weekendHintNone", { count: kpis.weekendCount }),
    },
    ...(kpis.drafts > 0
      ? [{ key: "drafts", label: t("drafts"), value: kpis.drafts, hint: t("draftsHint") }]
      : []),
  ];
  return (
    <dl
      aria-label={t("label")}
      className="m-0 grid w-full grid-cols-2 gap-y-3 sm:flex sm:w-auto sm:flex-wrap sm:gap-y-3"
    >
      {items.map((item, i) => (
        <div
          key={item.key}
          className={`flex min-w-0 flex-col gap-0.5 pr-3 sm:pr-5 ${i > 0 ? "sm:border-border-subtle sm:border-l sm:pl-5" : ""}`}
        >
          <dt className="text-muted-foreground text-tiny sm:whitespace-nowrap">{item.label}</dt>
          <dd className="m-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
            <span className="tabular font-semibold text-[22px] leading-tight">{item.value}</span>
            <span className="text-muted-foreground text-small">{item.hint}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
