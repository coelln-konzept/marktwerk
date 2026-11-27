import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlanningGrid } from "@/components/planning/planning-grid";
import { Page, PageHeader } from "@/components/shell/page";
import { MonthNav, monthParam, TeamTabs } from "@/components/team/team-nav";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import { todayIn } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { getPlanningMonth } from "@/server/queries/planning";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("planning"))("title") };
}

const PATH = "/team/planung";

/**
 * Team › Planung (spec §6): people × market days of a month with each person's hour budget, KW totals and
 * the open slots per day. `team:read` sees it (owner, manager); the actions check `team:manage`.
 */
export default async function PlanningPage({ searchParams }: PageProps<"/team/planung">) {
  await requirePermission("team", "read");
  const sp = await searchParams;
  const [t, tNav, tTeam] = await Promise.all([
    getTranslations("planning"),
    getTranslations("nav"),
    getTranslations("team"),
  ]);
  const today = todayIn();
  const current = `${today.slice(0, 7)}-01`;
  const month = monthParam(param(sp.month), today);
  const allDays = param(sp.days) === "all";
  const data = await getPlanningMonth(month, { allDays });

  return (
    <Page crumbs={[{ label: tNav("team"), href: PATH }, { label: tTeam("tabs.planning") }]} wide>
      <PageHeader title={tTeam("title")} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TeamTabs active="planning" month={month} />
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedLinks
            label={t("daysLabel")}
            items={[
              {
                key: "market",
                label: t("marketDays"),
                href: hrefWith(PATH, sp, { days: undefined }),
                active: !allDays,
              },
              {
                key: "all",
                label: t("allDays"),
                href: hrefWith(PATH, sp, { days: "all" }),
                active: allDays,
              },
            ]}
          />
          <MonthNav path={PATH} month={month} current={current} sp={sp} />
        </div>
      </div>
      <PlanningGrid data={data} />
    </Page>
  );
}
