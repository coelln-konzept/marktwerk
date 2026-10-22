import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { Overview } from "@/server/queries/overview";

/**
 * KPI strip next to the greeting (UX concept §5): Fällig bis Sonntag · Überfällig · Geld überfällig ·
 * Offene Aufgaben · Dieses Wochenende ("2 von 4 im Plan"). "Geld überfällig" is left out for roles
 * without finance access; "Ohne Genehmigung" (upcoming planned events still waiting for a permit) only shows while there are any
 * and links to the Veranstaltungen list filtered the same way.
 */
export async function KpiStrip({ kpis }: { kpis: Overview["kpis"] }) {
  const t = await getTranslations("overview.kpi");
  const locale = await getLocale();
  const money = kpis.moneyOverdue;
  const items: { key: string; label: string; value: number; hint: string; href?: string }[] = [
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
    ...(kpis.withoutPermit > 0
      ? [
          {
            key: "withoutPermit",
            label: t("withoutPermit"),
            value: kpis.withoutPermit,
            hint: t("withoutPermitHint"),
            href: "/veranstaltungen?status=planned&genehmigung=offen",
          },
        ]
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
          <dt className="text-muted-foreground text-tiny sm:whitespace-nowrap">
            {item.href ? (
              <Link href={item.href as never} className="hover:underline">
                {item.label}
              </Link>
            ) : (
              item.label
            )}
          </dt>
          <dd className="m-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
            <span className="tabular font-semibold text-[22px] leading-tight">{item.value}</span>
            <span className="text-muted-foreground text-small">{item.hint}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
