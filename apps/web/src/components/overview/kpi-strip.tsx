import { getTranslations } from "next-intl/server";
import type { Overview } from "@/server/queries/overview";

/** KPI strip next to the greeting. Only numbers that exist in M1 (events); no placeholder zeros. */
export async function KpiStrip({ kpis }: { kpis: Overview["kpis"] }) {
  const t = await getTranslations("overview.kpi");
  const items = [
    {
      key: "weekend",
      label: t("weekend"),
      value: kpis.weekendCount,
      hint:
        kpis.weekendTracked > 0
          ? t("weekendHint", { count: kpis.weekendCount, inPlan: kpis.weekendInPlan })
          : t("weekendHintNone", { count: kpis.weekendCount }),
    },
    {
      key: "next30",
      label: t("next30"),
      value: kpis.next30,
      hint: t("next30Hint", { count: kpis.next30 }),
    },
    { key: "drafts", label: t("drafts"), value: kpis.drafts, hint: t("draftsHint") },
  ];
  return (
    <dl
      aria-label={t("label")}
      className="m-0 grid w-full grid-cols-3 gap-y-3 sm:flex sm:w-auto sm:flex-nowrap"
    >
      {items.map((item, i) => (
        <div
          key={item.key}
          className={`flex min-w-0 flex-col gap-0.5 pr-3 sm:pr-5 ${i > 0 ? "border-border-subtle border-l pl-3 sm:pl-5" : ""}`}
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
