import { getTranslations } from "next-intl/server";
import type { Overview } from "@/server/queries/overview";

/**
 * Two numbers next to the greeting: Heute fällig · Überfällig. Both count the "Heute fällig" list (current
 * markets only), and each is a jump link to its group there, so the numbers stay useful although the
 * weekend block comes first. Everything else the strip used to show (open tasks, money, permits, the
 * weekend count) is in the lists or one click away.
 */
export async function KpiStrip({ kpis }: { kpis: Overview["kpis"] }) {
  const t = await getTranslations("overview.kpi");
  const items = [
    { key: "dueToday", label: t("dueToday"), value: kpis.dueToday, href: "#faellig-today" },
    { key: "overdue", label: t("overdue"), value: kpis.overdue, href: "#faellig-overdue" },
  ];
  return (
    <dl aria-label={t("label")} className="m-0 flex flex-wrap gap-x-6 gap-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 items-baseline gap-2">
          <dt className="text-muted-foreground text-small">
            {item.value > 0 ? (
              <a href={item.href} className="hover:underline">
                {item.label}
              </a>
            ) : (
              item.label
            )}
          </dt>
          <dd className="m-0">
            <span className="tabular font-semibold text-[22px] leading-tight">{item.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
